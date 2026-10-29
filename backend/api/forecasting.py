"""
AquaTimbang Predictive Analytics Module.

Forecasts fish prices with SARIMAX (seasonal ARIMA with exogenous
regressors), as described in Chapter II of the capstone paper:

1. Published prices are collected into a daily series (one average
   price per day for the species, optionally for one municipality).
2. External factors (fuel price, rainy/stormy weather, holidays) become
   exogenous regressors.
3. pmdarima's auto_arima selects the (p, d, q)(P, D, Q, 7) order by AIC,
   with weekly seasonality.
4. Accuracy is measured on the most recent hold-out days (MAPE, RMSE).
5. The model is refit on all data and forecasts the requested days with
   95% confidence intervals.

When there is too little data, or the model cannot be fitted, a simple
linear trend is returned instead with a warning (use case UC-6).
"""

import warnings as py_warnings
import numpy as np
import pandas as pd
from django.db.models import Max

from .models import ExternalFactor, PriceRecord

# Use case UC-6: at least 4 weeks of history for a model-based forecast.
MIN_SARIMAX_DAYS = 28
# Fewer days than this and not even a trend line is shown.
MIN_TREND_DAYS = 7
# Days held back to measure accuracy.
HOLDOUT_DAYS = 7
SEASONAL_PERIOD = 7
CONFIDENCE = 0.95
# Most recent days of price history used to fit the model.
TRAINING_WINDOW_DAYS = 365
# An external factor is only used when it was recorded on this share of training days.
MIN_FACTOR_COVERAGE = 0.5

FACTOR_LABELS = {
    "fuel_price": "Fuel price (per ₱1/liter)",
    "rainy": "Rainy weather",
    "stormy": "Stormy weather",
    "holiday": "Holiday",
}


class NotEnoughData(Exception):
    """Raised when there are too few published prices to forecast."""


def published_prices(species_id, municipality_id=None):
    records = PriceRecord.objects.filter(
        fish_species_id=species_id,
        status=PriceRecord.STATUS_PUBLISHED,
    )
    if municipality_id:
        records = records.filter(municipality_id=municipality_id)
    return records


def data_signature(species_id, municipality_id=None):
    """Identify the input data, so a saved forecast can be reused until it changes."""
    prices = published_prices(species_id, municipality_id).aggregate(
        latest=Max("updated_at"), last_day=Max("recorded_date")
    )
    factors = ExternalFactor.objects.aggregate(latest=Max("updated_at"))
    parts = [prices["latest"], prices["last_day"], factors["latest"]]
    return "|".join(value.isoformat() if value else "-" for value in parts)


def daily_series(species_id, municipality_id=None):
    """Average published price per day, with missing days interpolated."""
    rows = list(
        published_prices(species_id, municipality_id).values_list("recorded_date", "price_per_kg")
    )
    if not rows:
        return pd.Series(dtype=float), 0

    frame = pd.DataFrame(rows, columns=["date", "price"])
    frame["date"] = pd.to_datetime(frame["date"])
    frame["price"] = frame["price"].astype(float)
    series = frame.groupby("date")["price"].mean().sort_index()

    # Keep the most recent year so fitting stays fast.
    series = series[series.index >= series.index.max() - pd.Timedelta(days=TRAINING_WINDOW_DAYS - 1)]
    observed_days = len(series)

    full_range = pd.date_range(series.index.min(), series.index.max(), freq="D")
    series = series.reindex(full_range).interpolate(method="time")
    series.index.freq = "D"
    return series, observed_days


def factor_frame(start, end):
    """External factors for each day from start to end (inclusive)."""
    index = pd.date_range(start, end, freq="D")
    rows = ExternalFactor.objects.filter(date__gte=start.date(), date__lte=end.date()).values(
        "date", "fuel_price", "weather", "is_holiday"
    )
    frame = pd.DataFrame(index=index, columns=["fuel_price", "rainy", "stormy", "holiday"], dtype=float)
    recorded = pd.Series(False, index=index)
    for row in rows:
        day = pd.Timestamp(row["date"])
        frame.loc[day, "fuel_price"] = float(row["fuel_price"]) if row["fuel_price"] is not None else np.nan
        frame.loc[day, "rainy"] = 1.0 if row["weather"] == ExternalFactor.WEATHER_RAINY else 0.0
        frame.loc[day, "stormy"] = 1.0 if row["weather"] == ExternalFactor.WEATHER_STORMY else 0.0
        frame.loc[day, "holiday"] = 1.0 if row["is_holiday"] else 0.0
        recorded[day] = True
    return frame, recorded


def build_regressors(series, horizon):
    """
    Exogenous regressors for the training days and the forecast days.

    Returns (train_X, future_X, columns, notes). train_X is None when no
    factor has enough recorded days to be useful.
    """
    start = series.index.min()
    end = series.index.max() + pd.Timedelta(days=horizon)
    frame, recorded = factor_frame(start, end)
    train_days = series.index
    future_days = pd.date_range(series.index.max() + pd.Timedelta(days=1), periods=horizon, freq="D")
    notes = []

    coverage = recorded[train_days].mean() if len(train_days) else 0
    if coverage < MIN_FACTOR_COVERAGE:
        if recorded[train_days].any():
            notes.append(
                f"External factors were recorded on only {coverage:.0%} of the training days, "
                "so they were not used. Log factors daily in External Factors to include them."
            )
        return None, None, [], notes

    # Days without a record: carry the last fuel price forward; assume no
    # rain, storm or holiday.
    frame["fuel_price"] = frame["fuel_price"].ffill().bfill()
    frame[["rainy", "stormy", "holiday"]] = frame[["rainy", "stormy", "holiday"]].fillna(0.0)

    if not recorded[future_days].all():
        notes.append(
            "Forecast days without logged external factors assume the latest fuel price "
            "and no rain, storm or holiday."
        )

    # A factor that never changes during training cannot be estimated.
    columns = [
        column for column in ["fuel_price", "rainy", "stormy", "holiday"]
        if frame.loc[train_days, column].notna().all() and frame.loc[train_days, column].nunique() > 1
    ]
    if not columns:
        return None, None, [], notes

    return frame.loc[train_days, columns], frame.loc[future_days, columns], columns, notes


def select_order(series, regressors):
    """Pick the SARIMAX order with pmdarima's auto_arima (lowest AIC)."""
    from pmdarima import auto_arima

    seasonal = len(series) >= 2 * SEASONAL_PERIOD + 7
    model = auto_arima(
        series,
        X=regressors,
        seasonal=seasonal,
        m=SEASONAL_PERIOD if seasonal else 1,
        stepwise=True,
        max_p=3,
        max_q=3,
        max_P=1,
        max_Q=1,
        max_d=1,
        max_D=1,
        information_criterion="aic",
        suppress_warnings=True,
        error_action="ignore",
    )
    seasonal_order = model.seasonal_order if seasonal else (0, 0, 0, 0)
    return model.order, seasonal_order


def fit_sarimax(series, regressors, order, seasonal_order):
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    model = SARIMAX(
        series,
        exog=regressors,
        order=order,
        seasonal_order=seasonal_order,
        enforce_stationarity=False,
        enforce_invertibility=False,
    )
    return model.fit(disp=False)


def accuracy(actual, predicted):
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    mape = float(np.mean(np.abs((actual - predicted) / actual)) * 100)
    rmse = float(np.sqrt(np.mean((actual - predicted) ** 2)))
    return round(mape, 2), round(rmse, 2)


def describe_order(order, seasonal_order):
    p, d, q = order
    if seasonal_order and seasonal_order[3]:
        P, D, Q, s = seasonal_order
        return f"SARIMAX({p},{d},{q})({P},{D},{Q},{s})"
    return f"SARIMAX({p},{d},{q})"


def sarimax_forecast(series, horizon):
    train_X, future_X, columns, notes = build_regressors(series, horizon)

    with py_warnings.catch_warnings():
        py_warnings.simplefilter("ignore")

        # Accuracy: choose and fit the model without the last days, then
        # compare its predictions for those days with the real prices.
        holdout = HOLDOUT_DAYS
        train = series.iloc[:-holdout]
        train_exog = train_X.iloc[:-holdout] if train_X is not None else None
        test_exog = train_X.iloc[-holdout:] if train_X is not None else None
        order, seasonal_order = select_order(train, train_exog)
        test_fit = fit_sarimax(train, train_exog, order, seasonal_order)
        test_pred = test_fit.get_forecast(holdout, exog=test_exog).predicted_mean
        mape, rmse = accuracy(series.iloc[-holdout:], test_pred)

        # Final model on all the data.
        fit = fit_sarimax(series, train_X, order, seasonal_order)
        result = fit.get_forecast(horizon, exog=future_X)
        mean = result.predicted_mean
        interval = result.conf_int(alpha=1 - CONFIDENCE)

    if not np.all(np.isfinite(mean)) or not np.all(np.isfinite(interval.values)):
        raise ValueError("The model produced invalid values.")

    coefficients = {
        column: round(float(fit.params[column]), 2)
        for column in columns
        if column in fit.params
    }

    forecast = [
        {
            "date": day.date(),
            "price": max(0.0, float(mean.iloc[i])),
            "lower": max(0.0, float(interval.iloc[i, 0])),
            "upper": max(0.0, float(interval.iloc[i, 1])),
        }
        for i, day in enumerate(mean.index)
    ]

    return {
        "model_type": "sarimax",
        "model_used": describe_order(order, seasonal_order),
        "exogenous": columns,
        "coefficients": coefficients,
        "mape": mape,
        "rmse": rmse,
        "holdout_days": holdout,
        "forecast": forecast,
        "warnings": notes,
    }


def trend_forecast(series, horizon):
    """Least-squares straight line, with a ±1.96 × residual band."""
    x = np.arange(len(series), dtype=float)
    y = series.to_numpy(dtype=float)
    slope, intercept = np.polyfit(x, y, 1)
    residual = float(np.std(y - (intercept + slope * x))) if len(y) > 2 else 0.0
    spread = 1.96 * residual
    last = series.index.max()

    forecast = []
    for step in range(1, horizon + 1):
        price = max(0.0, float(intercept + slope * (len(series) - 1 + step)))
        forecast.append({
            "date": (last + pd.Timedelta(days=step)).date(),
            "price": price,
            "lower": max(0.0, price - spread),
            "upper": price + spread,
        })

    return {
        "model_type": "trend",
        "model_used": "Linear trend",
        "exogenous": [],
        "coefficients": {},
        "mape": None,
        "rmse": None,
        "holdout_days": 0,
        "forecast": forecast,
        "warnings": [],
    }


def generate_forecast(species_id, municipality_id=None, horizon=7):
    """
    Forecast `horizon` days of prices. Returns a dict with the model,
    accuracy, history and forecast; raises NotEnoughData when fewer than
    MIN_TREND_DAYS days have published prices.
    """
    series, observed_days = daily_series(species_id, municipality_id)
    if observed_days < MIN_TREND_DAYS:
        raise NotEnoughData(
            f"At least {MIN_TREND_DAYS} days of published prices are needed; "
            f"only {observed_days} found."
        )

    warnings = []
    if observed_days < MIN_SARIMAX_DAYS:
        result = trend_forecast(series, horizon)
        warnings.append(
            f"Not enough historical data for forecasting ({observed_days} of {MIN_SARIMAX_DAYS} days). "
            "Showing only the available trend."
        )
    else:
        try:
            result = sarimax_forecast(series, horizon)
        except Exception:  # Any model failure falls back to the trend line (UC-6 E1).
            result = trend_forecast(series, horizon)
            warnings.append("Forecast unavailable. Showing trend only.")

    missing = len(series) - observed_days
    if missing:
        warnings.append(f"{missing} day(s) without published prices were filled in by interpolation.")

    result["warnings"] = warnings + result["warnings"]
    result["history"] = [
        {"date": day.date(), "price": float(price)}
        for day, price in series.items()
    ]
    result["training_start"] = series.index.min().date()
    result["training_end"] = series.index.max().date()
    result["observations"] = observed_days
    return result

