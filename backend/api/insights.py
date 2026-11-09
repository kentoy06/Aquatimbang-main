"""
Data mining on published fish prices.

1. Learned anomaly detection (outlier detection)
   For each fish and municipality, the "normal" price is learned from the
   last NORMAL_WINDOW_DAYS of published prices: the median and the median
   absolute deviation (MAD). A price is scored with the robust z-score

       z = 0.6745 * (price - median) / MAD

   which, unlike the mean and standard deviation, is not thrown off by the
   very outliers it is looking for. A price is "unusual" when it is both
   far in z-score terms and far in pesos (percent from the median), so tiny
   differences on very stable fish are not flagged.

2. Market insights (association rule mining)
   Every day with a price becomes a "transaction" holding the conditions
   of that day (stormy, rainy, holiday, weekend, closed season, diesel up
   or down) and the outcome: the price was above or below its usual level
   (its own median over the previous 28 days). Rules "conditions -> outcome"
   are kept when they occur often enough (support), hold often enough
   (confidence) and happen clearly more than on an ordinary day (lift),
   as in the Apriori approach.
"""

from bisect import bisect_left
from datetime import timedelta
from itertools import combinations
from statistics import median

import numpy as np

from .models import ClosedFishingSeason, ExternalFactor, PriceRecord

# ---------------------------------------------------------------------------
# 1. Learned anomaly detection
# ---------------------------------------------------------------------------

NORMAL_WINDOW_DAYS = 90
MIN_HISTORY = 10
UNUSUAL_Z, UNUSUAL_PCT = 3.5, 12.0
VERY_UNUSUAL_Z, VERY_UNUSUAL_PCT = 5.0, 25.0


def _normal_from(prices):
    """Median, MAD and the typical 10th-90th percentile range of a list of prices."""
    values = [float(p) for p in prices]
    mid = median(values)
    mad = median(abs(v - mid) for v in values)
    if mad == 0:  # completely flat history: avoid dividing by zero
        mad = max(0.01 * mid, 0.5)
    low, high = np.percentile(values, [10, 90])
    return {"median": round(mid, 2), "mad": mad, "low": round(float(low), 2), "high": round(float(high), 2), "count": len(values)}


def score_price(price, normal):
    """Compare one price with a learned normal range."""
    price = float(price)
    z = 0.6745 * (price - normal["median"]) / normal["mad"]
    pct = (price - normal["median"]) / normal["median"] * 100 if normal["median"] else 0.0
    if abs(z) >= VERY_UNUSUAL_Z and abs(pct) >= VERY_UNUSUAL_PCT:
        level = "very_unusual"
    elif abs(z) >= UNUSUAL_Z and abs(pct) >= UNUSUAL_PCT:
        level = "unusual"
    else:
        level = "normal"
    return {"level": level, "z_score": round(z, 2), "percent_from_usual": round(pct, 1)}


def history_before(species_id, municipality_id, day, exclude_id=None):
    """Published prices of the NORMAL_WINDOW_DAYS before `day`."""
    rows = PriceRecord.objects.filter(
        status=PriceRecord.STATUS_PUBLISHED,
        fish_species_id=species_id,
        municipality_id=municipality_id,
        recorded_date__lt=day,
        recorded_date__gte=day - timedelta(days=NORMAL_WINDOW_DAYS),
    )
    if exclude_id:
        rows = rows.exclude(pk=exclude_id)
    return list(rows.values_list("price_per_kg", flat=True))


def check_price(species, municipality, price, day):
    """Is this price unusual for this fish, place and time? Used while encoding."""
    history = history_before(species.pk, municipality.pk, day)
    if len(history) < MIN_HISTORY:
        return {
            "level": "no_history",
            "message": f"Not enough past prices for {species.name} in {municipality.name} yet to judge this price.",
            "history_count": len(history),
        }
    normal = _normal_from(history)
    result = score_price(price, normal)
    pct = result["percent_from_usual"]
    direction = "higher" if pct > 0 else "lower"
    usual = f"₱{normal['low']:,.2f}–₱{normal['high']:,.2f}"
    if result["level"] == "normal":
        message = f"Within the usual range for {species.name} in {municipality.name} ({usual}/kg)."
    else:
        message = (
            f"₱{float(price):,.2f} is {abs(pct):.0f}% {direction} than the usual {species.name} price in "
            f"{municipality.name} (median ₱{normal['median']:,.2f}, usually {usual}/kg). Check it before saving."
        )
    return {
        **result,
        "message": message,
        "usual_median": normal["median"],
        "usual_low": normal["low"],
        "usual_high": normal["high"],
        "history_count": normal["count"],
        "window_days": NORMAL_WINDOW_DAYS,
    }


def find_outliers(records):
    """
    Score many price records against their own history. `records` is a
    queryset of PriceRecord; only unusual ones are returned, worst first.
    """
    records = list(records.select_related("fish_species", "municipality"))
    if not records:
        return []
    start = min(r.recorded_date for r in records) - timedelta(days=NORMAL_WINDOW_DAYS)
    end = max(r.recorded_date for r in records)
    groups = {}
    for fish_id, place_id, day, price, pk in PriceRecord.objects.filter(
        status=PriceRecord.STATUS_PUBLISHED,
        fish_species_id__in={r.fish_species_id for r in records},
        municipality_id__in={r.municipality_id for r in records},
        recorded_date__gte=start,
        recorded_date__lte=end,
    ).values_list("fish_species_id", "municipality_id", "recorded_date", "price_per_kg", "pk"):
        groups.setdefault((fish_id, place_id), []).append((day, float(price), pk))

    found = []
    for record in records:
        window_start = record.recorded_date - timedelta(days=NORMAL_WINDOW_DAYS)
        history = [
            price for day, price, pk in groups.get((record.fish_species_id, record.municipality_id), [])
            if window_start <= day < record.recorded_date and pk != record.pk
        ]
        if len(history) < MIN_HISTORY:
            continue
        normal = _normal_from(history)
        result = score_price(record.price_per_kg, normal)
        if result["level"] == "normal":
            continue
        found.append({
            "id": record.pk,
            "fish": record.fish_species.name,
            "fish_id": record.fish_species_id,
            "municipality": record.municipality.name,
            "date": record.recorded_date,
            "price": float(record.price_per_kg),
            "status": record.status,
            "usual_median": normal["median"],
            "usual_low": normal["low"],
            "usual_high": normal["high"],
            **result,
        })
    found.sort(key=lambda row: -abs(row["z_score"]))
    return found


# ---------------------------------------------------------------------------
# 2. Market insights: association rules
# ---------------------------------------------------------------------------

USUAL_WINDOW_DAYS = 28
LEVEL_PCT = 4.0          # above/below the usual level by this much counts
MIN_RULE_COUNT = 5       # a rule must happen on at least this many days
MIN_CONFIDENCE = 0.40
MIN_LIFT = 1.25

CONDITION_LABELS = {
    "stormy": "it is stormy",
    "rainy": "it is rainy",
    "holiday": "it is a holiday",
    "holiday_eve": "it is the day before a holiday",
    "weekend": "it is a weekend",
    "closed_season": "a closed fishing season is on",
    "fuel_up": "diesel rose in the past week",
    "fuel_down": "diesel fell in the past week",
}
OUTCOME_LABELS = {"above": "above its usual price", "below": "below its usual price"}


def _transactions(species_id=None, municipality_id=None, days=730):
    """Build one transaction (conditions + outcome) per fish, place and day."""
    prices = PriceRecord.objects.filter(status=PriceRecord.STATUS_PUBLISHED)
    if species_id:
        prices = prices.filter(fish_species_id=species_id)
    if municipality_id:
        prices = prices.filter(municipality_id=municipality_id)
    latest = prices.order_by("-recorded_date").values_list("recorded_date", flat=True).first()
    if latest is None:
        return [], None, None
    start = latest - timedelta(days=days)
    rows = prices.filter(recorded_date__gte=start - timedelta(days=USUAL_WINDOW_DAYS)).values_list(
        "fish_species_id", "municipality_id", "recorded_date", "price_per_kg"
    )
    series = {}
    for fish_id, place_id, day, price in rows:
        series.setdefault((fish_id, place_id), {})[day] = float(price)

    factors = {
        f.date: f for f in ExternalFactor.objects.filter(
            date__gte=start - timedelta(days=10), date__lte=latest + timedelta(days=1)
        )
    }
    seasons = {}
    for season in ClosedFishingSeason.objects.filter(is_active=True).prefetch_related("species"):
        for fish in season.species.all():
            seasons.setdefault(fish.pk, []).append(season)

    transactions = []
    for (fish_id, _place), by_day in series.items():
        days_sorted = sorted(by_day)
        values = [by_day[d] for d in days_sorted]
        for index, day in enumerate(days_sorted):
            if day < start:
                continue
            first = bisect_left(days_sorted, day - timedelta(days=USUAL_WINDOW_DAYS))
            window = values[first:index]
            if len(window) < 10:
                continue
            usual = median(window)
            pct = (by_day[day] - usual) / usual * 100 if usual else 0
            outcome = "above" if pct >= LEVEL_PCT else "below" if pct <= -LEVEL_PCT else "usual"

            items = set()
            factor = factors.get(day)
            if factor is not None:
                if factor.weather == ExternalFactor.WEATHER_STORMY:
                    items.add("stormy")
                elif factor.weather == ExternalFactor.WEATHER_RAINY:
                    items.add("rainy")
                if factor.is_holiday:
                    items.add("holiday")
                week_ago = factors.get(day - timedelta(days=7))
                if factor.fuel_price is not None and week_ago is not None and week_ago.fuel_price is not None:
                    change = float(factor.fuel_price) - float(week_ago.fuel_price)
                    if change >= 1:
                        items.add("fuel_up")
                    elif change <= -1:
                        items.add("fuel_down")
            tomorrow = factors.get(day + timedelta(days=1))
            if tomorrow is not None and tomorrow.is_holiday:
                items.add("holiday_eve")
            if day.weekday() >= 5:
                items.add("weekend")
            if any(s.covers(day) for s in seasons.get(fish_id, [])):
                items.add("closed_season")
            transactions.append((frozenset(items), outcome, pct))
    return transactions, start, latest


def mine_rules(species_id=None, municipality_id=None, days=730):
    """Association rules "conditions -> price above/below usual", strongest first."""
    transactions, start, latest = _transactions(species_id, municipality_id, days)
    total = len(transactions)
    if total < 30:
        return {"transactions": total, "rules": [], "baseline": None, "from": start, "to": latest}

    baseline = {
        outcome: sum(1 for _, o, _ in transactions if o == outcome) / total
        for outcome in ("above", "below")
    }
    single_counts = {}
    for items, _, _ in transactions:
        for item in items:
            single_counts[item] = single_counts.get(item, 0) + 1
    frequent = sorted(i for i, n in single_counts.items() if n >= MIN_RULE_COUNT)

    # Apriori: pairs are only built from conditions that are frequent alone.
    antecedents = [(item,) for item in frequent] + list(combinations(frequent, 2))
    rules = []
    best_single = {}
    for antecedent in antecedents:
        matching = [(o, pct) for items, o, pct in transactions if set(antecedent) <= items]
        if len(matching) < MIN_RULE_COUNT:
            continue
        for outcome in ("above", "below"):
            hits = [pct for o, pct in matching if o == outcome]
            confidence = len(hits) / len(matching)
            lift = confidence / baseline[outcome] if baseline[outcome] else 0
            if len(antecedent) == 1:
                best_single[(antecedent[0], outcome)] = confidence
            if len(hits) < MIN_RULE_COUNT or confidence < MIN_CONFIDENCE or lift < MIN_LIFT:
                continue
            # A pair must add at least 10 points over each of its conditions alone.
            if len(antecedent) == 2 and confidence <= max(best_single.get((a, outcome), 0) for a in antecedent) + 0.10:
                continue
            rules.append({
                "conditions": list(antecedent),
                "outcome": outcome,
                "days_with_conditions": len(matching),
                "days_matched": len(hits),
                "support": round(len(hits) / total, 4),
                "confidence": round(confidence, 3),
                "lift": round(lift, 2),
                "average_percent": round(sum(hits) / len(hits), 1),
                "text": (
                    f"When {' and '.join(CONDITION_LABELS[a] for a in antecedent)}, the price was "
                    f"{OUTCOME_LABELS[outcome]} on {confidence:.0%} of those days "
                    f"(usually {baseline[outcome]:.0%}), by about {abs(sum(hits) / len(hits)):.1f}%."
                ),
            })
    rules.sort(key=lambda r: (-r["lift"] * r["confidence"], -r["days_matched"]))
    return {
        "transactions": total,
        "baseline": {k: round(v, 3) for k, v in baseline.items()},
        "rules": rules[:20],
        "from": start,
        "to": latest,
        "settings": {
            "usual_window_days": USUAL_WINDOW_DAYS,
            "level_percent": LEVEL_PCT,
            "min_days": MIN_RULE_COUNT,
            "min_confidence": MIN_CONFIDENCE,
            "min_lift": MIN_LIFT,
        },
    }
