"""
Load SIMULATED demo data so the forecast and price explanations can be
shown before real DVMF price history is available.

    python manage.py load_demo_data            # 2 years for Cebu City
    python manage.py load_demo_data --days 365 --municipality "Cebu City"
    python manage.py load_demo_data --clear    # remove all demo data again

Every demo price has the source "SIMULATED DEMO DATA" and every demo
external factor starts its notes with "[Demo]", so they are easy to spot
and are the only rows --clear removes. Real prices and factors are never
changed: days that already have a record are skipped.

How the prices are simulated (so the patterns can be explained in a
defense): each fish has a base price, plus
- a weekly pattern (higher Friday to Sunday),
- a yearly pattern and a small yearly price increase,
- a jump during its BFAR closed fishing season (from Closed Seasons),
- extra cost on stormy and rainy days (fewer fishing trips),
- higher demand on holidays, the day before them, and Holy Week,
- a diesel price effect,
- day-to-day random noise.
SARIMAX should find these effects again from the data alone.
"""

import math
import random
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from api.models import ClosedFishingSeason, ExternalFactor, FishSpecies, ForecastRun, Municipality, PriceRecord

DEMO_SOURCE = "SIMULATED DEMO DATA"
DEMO_NOTE = "[Demo]"

# name: (base ₱/kg today, peak month of the yearly pattern)
DEMO_FISH = {
    "Galunggong": (200, 12),
    "Bangus": (190, 4),
    "Tilapia": (130, 4),
    "Tamban": (110, 1),
    "Tulingan": (220, 9),
    "Alumahan": (260, 1),
    "Lapu-Lapu": (420, 12),
    "Dalagang Bukid": (280, 12),
}

# Chance of a stormy / rainy day per month in Cebu (Jan..Dec).
STORM_CHANCE = [0.02, 0.01, 0.01, 0.01, 0.02, 0.04, 0.06, 0.07, 0.08, 0.09, 0.08, 0.06]
RAIN_CHANCE = [0.15, 0.10, 0.08, 0.08, 0.15, 0.30, 0.35, 0.35, 0.35, 0.35, 0.30, 0.25]

# Effects, as a share of the fish's base price.
WEEKLY = [-0.01, -0.015, -0.01, 0.0, 0.015, 0.025, 0.02]  # Mon..Sun
YEARLY_AMPLITUDE = 0.04
YEARLY_INCREASE = 0.03
CLOSED_SEASON = 0.10
STORM = 0.06
RAIN = 0.015
HOLIDAY = 0.03
FUEL_PER_PESO = 0.012  # per ₱1/liter above the starting diesel price
NOISE = 0.012
START_FUEL = 62.0


def easter(year):
    """Easter Sunday (Anonymous Gregorian algorithm)."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    month = (h + l_ - 7 * m + 114) // 31
    day = ((h + l_ - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def holidays(year):
    """Philippine national holidays plus Sinulog (Cebu), with names."""
    fixed = {
        (1, 1): "New Year's Day", (4, 9): "Araw ng Kagitingan", (5, 1): "Labor Day",
        (6, 12): "Independence Day", (8, 21): "Ninoy Aquino Day", (11, 1): "All Saints' Day",
        (11, 2): "All Souls' Day", (11, 30): "Bonifacio Day", (12, 8): "Immaculate Conception",
        (12, 24): "Christmas Eve", (12, 25): "Christmas Day", (12, 30): "Rizal Day",
        (12, 31): "New Year's Eve",
    }
    result = {date(year, m, d): name for (m, d), name in fixed.items()}
    sunday = easter(year)
    result[sunday - timedelta(days=3)] = "Maundy Thursday"
    result[sunday - timedelta(days=2)] = "Good Friday"
    # Sinulog: third Sunday of January.
    first = date(year, 1, 1)
    first_sunday = first + timedelta(days=(6 - first.weekday()) % 7)
    result[first_sunday + timedelta(days=14)] = "Sinulog Festival"
    return result


class Command(BaseCommand):
    help = "Load SIMULATED demo prices and external factors (for demos before DVMF data arrives)."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=730, help="Days of history up to today (default 730).")
        parser.add_argument("--municipality", default="Cebu City", help="Municipality for the demo prices.")
        parser.add_argument("--seed", type=int, default=2026, help="Random seed, so the data is the same each time.")
        parser.add_argument("--clear", action="store_true", help="Remove all demo prices and demo external factors.")

    def handle(self, *args, **options):
        if options["clear"]:
            return self.clear()
        days = options["days"]
        if not 60 <= days <= 1500:
            raise CommandError("--days must be between 60 and 1500.")
        municipality = Municipality.objects.filter(name__iexact=options["municipality"]).first()
        if municipality is None:
            raise CommandError(
                f"Municipality '{options['municipality']}' not found. Add it under Municipalities first, "
                f"or pass --municipality with an existing name."
            )
        fish = {f.name.lower(): f for f in FishSpecies.objects.filter(is_active=True)}
        chosen = [(fish[name.lower()], base, peak) for name, (base, peak) in DEMO_FISH.items() if name.lower() in fish]
        if not chosen:
            raise CommandError("None of the demo fish exist yet. Run: python manage.py load_fish_species")

        rng = random.Random(options["seed"])
        today = timezone.localdate()
        start = today - timedelta(days=days - 1)
        calendar_days = [start + timedelta(days=i) for i in range(days)]
        conditions = self.simulate_conditions(calendar_days, rng)

        with transaction.atomic():
            factors_added = self.save_factors(conditions)
            prices_added, skipped = self.save_prices(chosen, municipality, conditions, rng, today)
            ForecastRun.objects.filter(fish_species__in=[c[0] for c in chosen]).delete()

        self.stdout.write(self.style.SUCCESS(
            f"Added {prices_added:,} demo prices for {len(chosen)} fish in {municipality.name} "
            f"({start:%b %d, %Y} – {today:%b %d, %Y}) and {factors_added} demo external-factor days."
        ))
        if skipped:
            self.stdout.write(f"Skipped {skipped:,} days that already had a real price.")
        missing = [name for name in DEMO_FISH if name.lower() not in fish]
        if missing:
            self.stdout.write(f"Not in the fish list, so not simulated: {', '.join(missing)}")
        self.stdout.write(self.style.WARNING(
            f"These prices are SIMULATED (source \"{DEMO_SOURCE}\"). Remove them before using real DVMF data: "
            f"python manage.py load_demo_data --clear"
        ))

    # ------------------------------------------------------------------
    def simulate_conditions(self, calendar_days, rng):
        """Weather, diesel price and holidays for each day."""
        holiday_names = {}
        for year in {d.year for d in calendar_days} | {calendar_days[-1].year + 1}:
            holiday_names.update(holidays(year))
        fuel = START_FUEL
        storm_left = 0
        result = {}
        for day in calendar_days:
            # Diesel prices in the Philippines change every Tuesday.
            if day.weekday() == 1:
                fuel = min(80.0, max(52.0, fuel + rng.gauss(0.05, 0.9)))
            if storm_left:
                weather = "stormy"
                storm_left -= 1
            else:
                roll = rng.random()
                if roll < STORM_CHANCE[day.month - 1]:
                    weather = "stormy"
                    storm_left = rng.choice([0, 1, 1, 2])  # storms last 1-3 days
                elif roll < STORM_CHANCE[day.month - 1] + RAIN_CHANCE[day.month - 1]:
                    weather = "rainy"
                else:
                    weather = rng.choice(["sunny", "sunny", "cloudy"])
            result[day] = {
                "weather": weather,
                "fuel": round(fuel, 2),
                "holiday": holiday_names.get(day, ""),
                "eve": bool(holiday_names.get(day + timedelta(days=1))),
            }
        return result

    def save_factors(self, conditions):
        taken = set(ExternalFactor.objects.filter(date__in=list(conditions)).values_list("date", flat=True))
        rows = [
            ExternalFactor(
                date=day,
                fuel_price=Decimal(f"{c['fuel']:.2f}"),
                weather=c["weather"],
                is_holiday=bool(c["holiday"]),
                notes=f"{DEMO_NOTE} {c['holiday']}".strip(),
            )
            for day, c in conditions.items()
            if day not in taken
        ]
        ExternalFactor.objects.bulk_create(rows, batch_size=1000)
        return len(rows)

    def save_prices(self, chosen, municipality, conditions, rng, today):
        seasons = list(ClosedFishingSeason.objects.filter(is_active=True).prefetch_related("species"))
        holy_week = {}
        now = timezone.now()
        rows, skipped = [], 0
        # Simulated prices belong to the study's market: Pasil Fish Market in
        # Cebu City (created if missing), or the municipality's only market.
        from api.models import Market
        markets = list(Market.objects.filter(municipality=municipality, is_active=True))
        market = next((m for m in markets if "pasil" in m.name.lower()), None)
        if market is None and municipality.name.lower() == "cebu city":
            market = Market.objects.create(municipality=municipality, name="Pasil Fish Market")
        if market is None and len(markets) == 1:
            market = markets[0]
        for fish, base, peak in chosen:
            fish_seasons = [s for s in seasons if fish in s.species.all()]
            taken = set(
                PriceRecord.objects.filter(fish_species=fish, municipality=municipality, recorded_date__in=list(conditions))
                .values_list("recorded_date", flat=True)
            )
            noise = 0.0
            for day, c in conditions.items():
                noise = 0.6 * noise + rng.gauss(0, NOISE)  # prices drift, not jump
                if day in taken:
                    skipped += 1
                    continue
                years_ago = (today - day).days / 365.0
                level = base * (1 - YEARLY_INCREASE * years_ago)
                if day.year not in holy_week:
                    sunday = easter(day.year)
                    holy_week[day.year] = (sunday - timedelta(days=6), sunday - timedelta(days=1))
                lent_start, lent_end = holy_week[day.year]
                effect = (
                    WEEKLY[day.weekday()]
                    + YEARLY_AMPLITUDE * math.cos(2 * math.pi * (day.month - peak) / 12)
                    + (CLOSED_SEASON if any(s.covers(day) for s in fish_seasons) else 0)
                    + (STORM if c["weather"] == "stormy" else RAIN if c["weather"] == "rainy" else 0)
                    + (HOLIDAY if c["holiday"] or c["eve"] else 0)
                    + (HOLIDAY if lent_start <= day <= lent_end else 0)  # Holy Week: more fish, less meat
                    + FUEL_PER_PESO * (c["fuel"] - START_FUEL)
                    + noise
                )
                price = max(20.0, level * (1 + effect))
                rows.append(PriceRecord(
                    fish_species=fish, municipality=municipality, market=market, recorded_date=day,
                    price_per_kg=Decimal(f"{price:.2f}"), source=DEMO_SOURCE,
                    remarks="Simulated price for demonstration only. Not real DVMF data.",
                    status=PriceRecord.STATUS_PUBLISHED, reviewed_at=now, published_at=now,
                ))
        PriceRecord.objects.bulk_create(rows, batch_size=1000)
        return len(rows), skipped

    def clear(self):
        with transaction.atomic():
            demo_prices = PriceRecord.objects.filter(source=DEMO_SOURCE)
            fish_ids = set(demo_prices.values_list("fish_species_id", flat=True))
            prices = demo_prices.count()
            demo_prices.delete()
            demo_factors = ExternalFactor.objects.filter(notes__startswith=DEMO_NOTE)
            factors = demo_factors.count()
            demo_factors.delete()
            # Saved forecasts were made from demo data, so they go too.
            ForecastRun.objects.filter(fish_species_id__in=fish_ids).delete()
        self.stdout.write(self.style.SUCCESS(
            f"Removed {prices:,} demo prices and {factors:,} demo external-factor days. Real data was not touched."
        ))
