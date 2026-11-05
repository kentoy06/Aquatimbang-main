"""
Price change explanations ("Why is the price changing?").

Compares the latest published price with the price a week earlier and
lists the recorded conditions that usually move fish prices:

- stormy or rainy weather (fewer fishing trips, less supply)
- a change in the diesel price (fishing trip costs)
- holidays and fiestas (more buyers)
- BFAR closed fishing seasons (less catch allowed)
- the usual price for this month in past years

Where a SARIMAX forecast was already made, its fitted coefficients show
how much each factor moved this fish's price in the past.
"""

import calendar
from datetime import timedelta

import pandas as pd

from .forecasting import daily_series, published_prices
from .models import ClosedFishingSeason, ExternalFactor, ForecastRun

# A weekly change smaller than this (in %) counts as "steady".
STEADY_PCT = 2.0
# A month counts as usually higher/lower when it differs by this much (in %).
SEASONAL_PCT = 5.0
# Price history needed before monthly patterns are trusted.
SEASONAL_MIN_DAYS = 330
# A fuel change smaller than this (in pesos per liter) is ignored.
FUEL_MIN_CHANGE = 1.0
LOOKBACK_DAYS = 7
SEASON_NOTICE_DAYS = 14


def _peso(value):
    return f"₱{value:,.2f}"


def _long(day):
    return f"{calendar.month_name[day.month]} {day.day}"


def _season_dates(season):
    return (
        f"{calendar.month_abbr[season.start_month]} {season.start_day} – "
        f"{calendar.month_abbr[season.end_month]} {season.end_day}"
    )


def _coefficients(species_id, municipality_id):
    """Factor effects (₱/kg) from the newest SARIMAX forecast, if any."""
    run = (
        ForecastRun.objects.filter(
            fish_species_id=species_id,
            municipality_id=municipality_id,
            model_type=ForecastRun.MODEL_SARIMAX,
        )
        .order_by("-created_at")
        .first()
    )
    return (run.coefficients or {}) if run else {}


def _past_effect(coefficients, name, unit_text):
    value = coefficients.get(name)
    if value is None or abs(value) < 0.01:
        return ""
    verb = "raised" if value > 0 else "lowered"
    return f" In past AquaTimbang data, {unit_text} {verb} this fish's price by about {_peso(abs(value))}/kg."


def _reason(kind, icon, effect, title, detail):
    return {"kind": kind, "icon": icon, "effect": effect, "title": title, "detail": detail}


def weather_reasons(ref, coefficients):
    days = ExternalFactor.objects.filter(date__gt=ref - timedelta(days=LOOKBACK_DAYS), date__lte=ref)
    stormy = sum(1 for f in days if f.weather == ExternalFactor.WEATHER_STORMY)
    rainy = sum(1 for f in days if f.weather == ExternalFactor.WEATHER_RAINY)
    if stormy:
        return [_reason(
            "weather", "⛈", "up", "Stormy weather",
            f"{stormy} stormy day{'s' if stormy > 1 else ''} in the past week. Fewer boats go out in bad weather, "
            f"so less fish reaches the market." + _past_effect(coefficients, "stormy", "each stormy day"),
        )]
    if rainy >= 2:
        return [_reason(
            "weather", "🌧", "up", "Rainy weather",
            f"{rainy} rainy days in the past week can mean fewer or shorter fishing trips."
            + _past_effect(coefficients, "rainy", "each rainy day"),
        )]
    # Only call the week "good weather" when most days were actually logged.
    if days.count() >= 4 and not stormy and not rainy:
        return [_reason(
            "weather", "☀", "down", "Good weather",
            "No rain or storms were recorded in the past week, so boats could fish normally and supply is steady.",
        )]
    return []


def fuel_reasons(ref, coefficients):
    recent = (
        ExternalFactor.objects.filter(
            fuel_price__isnull=False, date__gt=ref - timedelta(days=LOOKBACK_DAYS), date__lte=ref
        ).order_by("-date").first()
    )
    if recent is None:
        return []
    earlier = (
        ExternalFactor.objects.filter(
            fuel_price__isnull=False,
            date__lte=recent.date - timedelta(days=21),
            date__gte=recent.date - timedelta(days=60),
        ).order_by("-date").first()
    )
    if earlier is None:
        return []
    change = float(recent.fuel_price) - float(earlier.fuel_price)
    if abs(change) < FUEL_MIN_CHANGE:
        return []
    pct = change / float(earlier.fuel_price) * 100
    up = change > 0
    return [_reason(
        "fuel", "⛽", "up" if up else "down",
        "Diesel price went up" if up else "Diesel price went down",
        f"Diesel is {_peso(float(recent.fuel_price))}/liter, {'up' if up else 'down'} {_peso(abs(change))} "
        f"({abs(pct):.1f}%) since {_long(earlier.date)}. Fuel is one of the biggest costs of a fishing trip, "
        f"so {'higher fuel usually means higher' if up else 'cheaper fuel can mean lower'} fish prices."
        + _past_effect(coefficients, "fuel_price", "each ₱1/liter of fuel"),
    )]


def holiday_reasons(ref, coefficients):
    days = ExternalFactor.objects.filter(
        is_holiday=True,
        date__gt=ref - timedelta(days=LOOKBACK_DAYS),
        date__lte=ref + timedelta(days=LOOKBACK_DAYS),
    ).order_by("date")
    if not days:
        return []
    names = ", ".join(
        f"{_long(d.date)}{f' ({d.notes})' if d.notes else ''}" for d in days[:3]
    )
    return [_reason(
        "holiday", "🎉", "up", "Holiday or fiesta",
        f"Holiday{'s' if len(days) > 1 else ''} on {names}. More families buy fish for celebrations, "
        f"so demand goes up." + _past_effect(coefficients, "holiday", "a holiday"),
    )]


def season_reasons(species, ref):
    reasons = []
    seasons = ClosedFishingSeason.objects.filter(is_active=True, species=species)
    for season in seasons:
        dates = _season_dates(season)
        if season.covers(ref):
            reasons.append(_reason(
                "season", "🚫", "up", f"Closed fishing season: {season.area}",
                f"{season.name} ({dates}). {season.notes} Less catch is allowed, "
                f"so less {species.name} reaches the market and prices tend to rise.",
            ))
        elif season.covers(ref + timedelta(days=SEASON_NOTICE_DAYS)):
            reasons.append(_reason(
                "season", "📅", "up", f"Closed season starting soon: {season.area}",
                f"{season.name} starts {calendar.month_abbr[season.start_month]} {season.start_day} ({dates}). "
                f"Expect less {species.name} supply and higher prices.",
            ))
        elif season.covers(ref - timedelta(days=SEASON_NOTICE_DAYS)):
            reasons.append(_reason(
                "season", "🎣", "down", f"Closed season just ended: {season.area}",
                f"{season.name} ended {calendar.month_abbr[season.end_month]} {season.end_day}. "
                f"Fishing is open again, so more {species.name} supply is coming back.",
            ))
    return reasons


def seasonal_reasons(species, municipality_id, ref):
    rows = list(published_prices(species.pk, municipality_id).values_list("recorded_date", "price_per_kg"))
    if not rows:
        return []
    frame = pd.DataFrame(rows, columns=["date", "price"])
    frame["date"] = pd.to_datetime(frame["date"])
    if (frame["date"].max() - frame["date"].min()).days < SEASONAL_MIN_DAYS:
        return []
    frame["price"] = frame["price"].astype(float)
    overall = frame["price"].mean()
    this_month = frame[frame["date"].dt.month == ref.month]["price"]
    if this_month.empty or overall <= 0:
        return []
    pct = (this_month.mean() - overall) / overall * 100
    if abs(pct) < SEASONAL_PCT:
        return []
    month = calendar.month_name[ref.month]
    up = pct > 0
    return [_reason(
        "pattern", "📆", "up" if up else "down", f"Usual {month} pattern",
        f"In past records, {species.name} is usually about {abs(pct):.0f}% "
        f"{'higher' if up else 'lower'} in {month} than the yearly average.",
    )]


def explain_price(species, municipality=None):
    municipality_id = municipality.pk if municipality else None
    series, _ = daily_series(species.pk, municipality_id)
    if len(series) < 2:
        return {
            "enough_data": False,
            "message": f"Not enough published prices for {species.name} yet to explain price changes.",
        }

    ref_ts = series.index.max()
    ref = ref_ts.date()
    start_ts = max(series.index.min(), ref_ts - pd.Timedelta(days=LOOKBACK_DAYS))
    latest = float(series.iloc[-1])
    before = float(series[start_ts])
    change = latest - before
    pct = (change / before * 100) if before else 0.0
    direction = "steady" if abs(pct) < STEADY_PCT else ("up" if pct > 0 else "down")

    coefficients = _coefficients(species.pk, municipality_id)
    reasons = (
        season_reasons(species, ref)
        + weather_reasons(ref, coefficients)
        + fuel_reasons(ref, coefficients)
        + holiday_reasons(ref, coefficients)
        + seasonal_reasons(species, municipality_id, ref)
    )
    for reason in reasons:
        reason["matches"] = direction != "steady" and reason["effect"] == direction

    matching = [r["title"] for r in reasons if r["matches"]]
    place = f" in {municipality.name}" if municipality else ""
    if direction == "steady":
        summary = f"{species.name}{place} is steady at about {_peso(latest)}/kg this week."
        if any(r["effect"] == "up" for r in reasons):
            summary += " Some of the conditions below could push the price up soon."
    else:
        summary = (
            f"{species.name}{place} is {_peso(latest)}/kg, "
            f"{'up' if direction == 'up' else 'down'} {_peso(abs(change))} ({abs(pct):.1f}%) from a week ago."
        )
        if matching:
            summary += f" Likely reason{'s' if len(matching) > 1 else ''}: {', '.join(matching)}."
        else:
            summary += (
                " No recorded weather, fuel, holiday or closed season explains it, "
                "so it may be normal day-to-day market movement."
            )

    return {
        "enough_data": True,
        "fish_name": species.name,
        "municipality_name": municipality.name if municipality else None,
        "as_of": ref,
        "compared_with": start_ts.date(),
        "latest_price": round(latest, 2),
        "previous_price": round(before, 2),
        "change": round(change, 2),
        "change_pct": round(pct, 1),
        "direction": direction,
        "summary": summary,
        "reasons": reasons,
    }
