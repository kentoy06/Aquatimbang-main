"""
Data mining on published fish prices.

1. Learned anomaly detection (outlier detection)
   For each fish and municipality, the "normal" price is learned from the
   last 90 days (adjustable in Insight Settings) of published prices: the median and the median
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

# The z-score cut-offs follow Iglewicz & Hoaglin (1993) and stay fixed.
# The percent and window cut-offs are kept in InsightSetting, where the
# LGU can preview and change them.
NORMAL_WINDOW_DAYS = 90
MIN_HISTORY = 10
UNUSUAL_Z = 3.5
VERY_UNUSUAL_Z = 5.0


def current_params():
    """The cut-offs in use now (InsightSetting), as plain numbers."""
    from .models import InsightSetting
    return InsightSetting.load().values()


def _params(params):
    from .models import InsightSetting
    return {**InsightSetting.DEFAULTS, **(params if params is not None else current_params())}


def _normal_from(prices):
    """Median, MAD and the typical 10th-90th percentile range of a list of prices."""
    values = [float(p) for p in prices]
    mid = median(values)
    mad = median(abs(v - mid) for v in values)
    if mad == 0:  # completely flat history: avoid dividing by zero
        mad = max(0.01 * mid, 0.5)
    low, high = np.percentile(values, [10, 90])
    return {"median": round(mid, 2), "mad": mad, "low": round(float(low), 2), "high": round(float(high), 2), "count": len(values)}


def score_price(price, normal, params=None):
    """Compare one price with a learned normal range."""
    p = _params(params)
    price = float(price)
    z = 0.6745 * (price - normal["median"]) / normal["mad"]
    pct = (price - normal["median"]) / normal["median"] * 100 if normal["median"] else 0.0
    if abs(z) >= VERY_UNUSUAL_Z and abs(pct) >= p["very_unusual_percent"]:
        level = "very_unusual"
    elif abs(z) >= UNUSUAL_Z and abs(pct) >= p["unusual_percent"]:
        level = "unusual"
    else:
        level = "normal"
    return {"level": level, "z_score": round(z, 2), "percent_from_usual": round(pct, 1)}


def history_before(species_id, municipality_id, day, exclude_id=None, window_days=NORMAL_WINDOW_DAYS):
    """Published prices of the `window_days` before `day`."""
    rows = PriceRecord.objects.filter(
        status=PriceRecord.STATUS_PUBLISHED,
        fish_species_id=species_id,
        municipality_id=municipality_id,
        recorded_date__lt=day,
        recorded_date__gte=day - timedelta(days=window_days),
    )
    if exclude_id:
        rows = rows.exclude(pk=exclude_id)
    return list(rows.values_list("price_per_kg", flat=True))


def check_price(species, municipality, price, day, params=None):
    """Is this price unusual for this fish, place and time? Used while encoding."""
    p = _params(params)
    history = history_before(species.pk, municipality.pk, day, window_days=p["window_days"])
    if len(history) < MIN_HISTORY:
        return {
            "level": "no_history",
            "message": f"Not enough past prices for {species.name} in {municipality.name} yet to judge this price.",
            "history_count": len(history),
        }
    normal = _normal_from(history)
    result = score_price(price, normal, p)
    pct = result["percent_from_usual"]
    direction = "higher" if pct > 0 else "lower"
    usual = f"₱{normal['low']:,.2f}–₱{normal['high']:,.2f}"
    if result["level"] == "normal" and normal["low"] <= float(price) <= normal["high"]:
        message = f"Within the usual range for {species.name} in {municipality.name} ({usual}/kg)."
    elif result["level"] == "normal":
        message = (
            f"Slightly {direction} than usual for {species.name} in {municipality.name} "
            f"({abs(pct):.0f}% from the median ₱{normal['median']:,.2f}; usually {usual}/kg), but not unusual."
        )
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
        "window_days": p["window_days"],
    }


def find_outliers(records, params=None):
    """
    Score many price records against their own history. `records` is a
    queryset of PriceRecord; only unusual ones are returned, worst first.
    """
    p = _params(params)
    window_days = p["window_days"]
    records = list(records.select_related("fish_species", "municipality"))
    if not records:
        return []
    start = min(r.recorded_date for r in records) - timedelta(days=window_days)
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
        window_start = record.recorded_date - timedelta(days=window_days)
        history = [
            price for day, price, pk in groups.get((record.fish_species_id, record.municipality_id), [])
            if window_start <= day < record.recorded_date and pk != record.pk
        ]
        if len(history) < MIN_HISTORY:
            continue
        normal = _normal_from(history)
        result = score_price(record.price_per_kg, normal, p)
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

# Defaults (see InsightSetting): usual = median of the previous 28 days;
# above/below usual by 4% counts; a rule needs 5 days, 40% confidence and
# a lift of 1.25.

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


def _transactions(species_id=None, municipality_id=None, days=730, params=None):
    """Build one transaction (conditions + outcome) per fish, place and day."""
    p = _params(params)
    usual_window = p["usual_window_days"]
    level_pct = p["level_percent"]
    prices = PriceRecord.objects.filter(status=PriceRecord.STATUS_PUBLISHED)
    if species_id:
        prices = prices.filter(fish_species_id=species_id)
    if municipality_id:
        prices = prices.filter(municipality_id=municipality_id)
    latest = prices.order_by("-recorded_date").values_list("recorded_date", flat=True).first()
    if latest is None:
        return [], None, None
    start = latest - timedelta(days=days)
    rows = prices.filter(recorded_date__gte=start - timedelta(days=usual_window)).values_list(
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
            first = bisect_left(days_sorted, day - timedelta(days=usual_window))
            window = values[first:index]
            if len(window) < min(10, max(3, usual_window // 2)):
                continue
            usual = median(window)
            pct = (by_day[day] - usual) / usual * 100 if usual else 0
            outcome = "above" if pct >= level_pct else "below" if pct <= -level_pct else "usual"

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


def mine_rules(species_id=None, municipality_id=None, days=730, params=None):
    """Association rules "conditions -> price above/below usual", strongest first."""
    p = _params(params)
    MIN_RULE_COUNT = p["min_days"]
    MIN_CONFIDENCE = p["min_confidence_percent"] / 100
    MIN_LIFT = p["min_lift"]
    transactions, start, latest = _transactions(species_id, municipality_id, days, p)
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
            "usual_window_days": p["usual_window_days"],
            "level_percent": p["level_percent"],
            "min_days": MIN_RULE_COUNT,
            "min_confidence": MIN_CONFIDENCE,
            "min_lift": MIN_LIFT,
        },
    }


# ---------------------------------------------------------------------------
# 3. Insight Settings: checking new cut-offs
# ---------------------------------------------------------------------------

PARAM_LIMITS = {
    # key: (lowest, highest, label)
    "window_days": (30, 365, "Days used to learn the usual price"),
    "unusual_percent": (1, 100, "Unusual price difference (%)"),
    "very_unusual_percent": (2, 200, "Very unusual price difference (%)"),
    "usual_window_days": (7, 90, "Days used for the usual price in Market Insights"),
    "level_percent": (1, 50, "Above/below usual by at least (%)"),
    "min_days": (2, 100, "Minimum days for a pattern"),
    "min_confidence_percent": (10, 100, "Minimum confidence (%)"),
    "min_lift": (1, 5, "Minimum lift"),
}


def clean_params(data):
    """Check proposed cut-offs. Returns (values, errors)."""
    from .models import InsightSetting
    values, errors = {}, {}
    current = current_params()
    for key, default in InsightSetting.DEFAULTS.items():
        raw = data.get(key, current[key])
        low, high, label = PARAM_LIMITS[key]
        try:
            number = float(raw)
            if number != number:  # NaN
                raise ValueError
        except (TypeError, ValueError):
            errors[key] = f"{label}: enter a number."
            continue
        if isinstance(default, int):
            if number != int(number):
                errors[key] = f"{label}: enter a whole number."
                continue
            number = int(number)
        else:
            number = round(number, 2 if key == "min_lift" else 1)
        if not low <= number <= high:
            errors[key] = f"{label}: use a value from {low} to {high}."
            continue
        values[key] = number
    if not errors and values["very_unusual_percent"] <= values["unusual_percent"]:
        errors["very_unusual_percent"] = "The very unusual difference must be bigger than the unusual one."
    return values, errors
