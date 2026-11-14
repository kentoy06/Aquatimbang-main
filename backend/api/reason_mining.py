"""
Vendor suggestion analytics: reason clustering and the recommended price.

1. Text clustering of vendor reasons
   Each suggestion has a reason category (e.g. "Higher fuel price") and an
   optional comment in English, Filipino or Cebuano. The text is cleaned,
   common words are dropped, and words with the same meaning are read as one
   ("krudo", "diesel" and "gasolina" are all "fuel"). Each suggestion becomes
   a TF-IDF vector, and the suggestions are grouped with k-means using cosine
   similarity. The starting centers are the reason categories the vendors
   chose, so a vendor who picked "Other" but wrote "mahal ang krudo" moves
   to the fuel group. Each cluster reports its size, its share of all
   suggestions, its most important words, and the median price suggested.

2. Recommended price (history + vendor suggestions)
   history_median = median of the latest published prices (up to 7)
   vendor_median  = median of the vendors' latest suggestions (last 7 days)
   When at least MIN_VENDORS vendors suggested and the largest reason
   cluster holds at least AGREEMENT_SHARE of them, the vendors' price moves
   the recommendation in proportion to how many agree:
       weight = min(MAX_VENDOR_WEIGHT, VENDOR_WEIGHT_STEP x vendors)
       recommended = (1 - weight) x history_median + weight x vendor_median
   Otherwise the history alone is used. The LGU reviews the recommendation
   and publishes it.
"""

import math
import re
from datetime import timedelta
from statistics import median

from django.utils import timezone

MIN_VENDORS = 3            # vendors needed before suggestions move the price
AGREEMENT_SHARE = 0.6      # share of vendors the main reason must have
VENDOR_WEIGHT_STEP = 0.1   # weight added per vendor
MAX_VENDOR_WEIGHT = 0.7    # vendors never decide more than 70% of the price
SUGGESTION_DAYS = 7        # suggestions older than this are not counted
HISTORY_COUNT = 7          # latest published prices used for the history
OTHER_SIMILARITY = 0.15    # an "Other" reason this close to a group joins it
AUTO_SOURCE = "AquaTimbang automatic price (vendor agreement + price history)"

# Words with the same meaning, in English, Filipino and Cebuano.
SYNONYMS = {
    "fuel": ["fuel", "diesel", "krudo", "gasolina", "gasoline", "gas", "oil", "petrolyo", "langis", "pamasahe sa bangka"],
    "weather": ["weather", "ulan", "bagyo", "unos", "storm", "stormy", "rain", "rainy", "typhoon", "hangin", "balod", "waves", "panahon"],
    "scarce": ["catch", "kuha", "dakop", "huli", "nihit", "kulang", "scarce", "few", "less", "shortage", "wala", "gamay"],
    "demand": ["demand", "buyers", "mamalit", "mamimili", "fiesta", "pista", "holiday", "pasko", "christmas", "sinulog", "semana", "weekend", "daghang"],
    "transport": ["transport", "plete", "freight", "pamasahe", "yelo", "ice", "delivery", "biyahe"],
    "closedseason": ["closed", "ban", "bfar", "sira", "spawning"],
    "quality": ["quality", "size", "dako", "dagko", "fresh", "presko", "lab-as", "labas", "bago"],
    "oversupply": ["oversupply", "surplus", "mabaligya", "mabenta", "selling", "daghan"],
    "high": ["mahal", "taas", "high", "higher", "expensive", "increase", "tumaas", "misaka", "saka"],
    "low": ["mura", "ubos", "low", "lower", "cheap", "bumaba", "minus", "nanaog"],
}
WORD_TO_TOKEN = {word: token for token, words in SYNONYMS.items() for word in words}

# Category -> token, so the chosen reason counts like a strong word.
CATEGORY_TOKEN = {
    "fuel_price": "fuel",
    "weather": "weather",
    "low_catch": "scarce",
    "high_demand": "demand",
    "transport_ice": "transport",
    "closed_season": "closedseason",
    "quality_size": "quality",
    "oversupply": "oversupply",
    "other": "",
}

TOKEN_LABEL = {
    "fuel": "fuel / diesel",
    "weather": "weather",
    "scarce": "low catch",
    "demand": "more buyers",
    "transport": "transport / ice",
    "closedseason": "closed season",
    "quality": "size / quality",
    "oversupply": "oversupply",
    "high": "price is high",
    "low": "price is low",
}

STOPWORDS = set("""
a an and are as at be because but by for from has have i in is it its my of on or so that the their there this to
too very was we were will with our you your they them us also just than then now today
ang ng sa na ay mga at ko ako kami namin natin tayo yung iyong kasi dahil para pero lang din rin po ho si ni kay
nga ug kay mao among amo ato kita ta pud pod kaayo karon gyud jud man ba lagi nato ani ana kini kana
""".split())


def tokens_of(category, comment):
    words = re.findall(r"[a-zñ\-]+", str(comment or "").lower())
    out = []
    for word in words:
        word = word.strip("-")
        if len(word) < 2 or word in STOPWORDS:
            continue
        out.append(WORD_TO_TOKEN.get(word, word))
    token = CATEGORY_TOKEN.get(category or "other", "")
    if token:
        out += [token, token]  # the chosen reason weighs like two words
    return out


def _tfidf(docs):
    vocab = sorted({t for doc in docs for t in doc})
    index = {t: i for i, t in enumerate(vocab)}
    n = len(docs)
    df = [0] * len(vocab)
    for doc in docs:
        for t in set(doc):
            df[index[t]] += 1
    idf = [math.log((1 + n) / (1 + d)) + 1 for d in df]
    vectors = []
    for doc in docs:
        vec = [0.0] * len(vocab)
        for t in doc:
            vec[index[t]] += 1
        vec = [v * idf[i] for i, v in enumerate(vec)]
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        vectors.append([v / norm for v in vec])
    return vocab, vectors


def _cosine(a, b):
    return sum(x * y for x, y in zip(a, b))


def _mean(vectors):
    if not vectors:
        return None
    total = [sum(col) / len(vectors) for col in zip(*vectors)]
    norm = math.sqrt(sum(v * v for v in total)) or 1.0
    return [v / norm for v in total]


def cluster_reasons(items):
    """
    items: [{"category": str, "comment": str, "price": float}]
    Returns clusters sorted by size: label, category, size, share,
    top_terms, median_price, comments.
    """
    from .models import VendorPriceSuggestion
    labels = dict(VendorPriceSuggestion.REASON_CHOICES)
    if not items:
        return []
    docs = [tokens_of(i["category"], i["comment"]) or ["other"] for i in items]
    vocab, vectors = _tfidf(docs)

    # Starting centers: one per reason category chosen (max 6). "Other"
    # reasons start their own group only when their words are unlike every
    # chosen reason; otherwise k-means moves them to the closest group.
    groups = {}
    for i, item in enumerate(items):
        groups.setdefault(item["category"] or "other", []).append(i)
    named = sorted(((c, m) for c, m in groups.items() if c != "other"), key=lambda kv: -len(kv[1]))[:6]
    centers = [_mean([vectors[i] for i in members]) for _, members in named]
    others = groups.get("other", [])
    if others:
        unlike = [i for i in others if not centers or max(_cosine(vectors[i], c) for c in centers) < OTHER_SIMILARITY]
        if unlike:
            centers.append(_mean([vectors[i] for i in unlike]))

    assignment = [None] * len(items)
    for _ in range(25):
        changed = False
        for i, vec in enumerate(vectors):
            best = max(range(len(centers)), key=lambda c: _cosine(vec, centers[c]))
            if assignment[i] != best:
                assignment[i] = best
                changed = True
        new_centers = []
        for c in range(len(centers)):
            members = [vectors[i] for i in range(len(items)) if assignment[i] == c]
            new_centers.append(_mean(members) or centers[c])
        centers = new_centers
        if not changed:
            break

    clusters = []
    total = len(items)
    for c, center in enumerate(centers):
        members = [i for i in range(total) if assignment[i] == c]
        if not members:
            continue
        cats = {}
        for i in members:
            cats[items[i]["category"] or "other"] = cats.get(items[i]["category"] or "other", 0) + 1
        main_cat = max(cats.items(), key=lambda kv: (kv[1], kv[0] != "other"))[0]
        top = sorted(range(len(vocab)), key=lambda j: -center[j])[:4]
        terms = [TOKEN_LABEL.get(vocab[j], vocab[j]) for j in top if center[j] > 0.05]
        clusters.append({
            "label": labels.get(main_cat, "Other reason") if main_cat != "other" else (
                f"Other: {terms[0]}" if terms and terms[0] != "other" else "Other reason"),
            "category": main_cat,
            "size": len(members),
            "share": round(len(members) / total, 3),
            "top_terms": terms,
            "median_price": round(median(items[i]["price"] for i in members), 2),
            "comments": [items[i]["comment"] for i in members if (items[i]["comment"] or "").strip()][:3],
        })
    clusters.sort(key=lambda cl: -cl["size"])
    return clusters


def latest_suggestions(fish, municipality, today=None, days=SUGGESTION_DAYS):
    """Each vendor's latest active suggestion for this fish in the last `days` days."""
    from .models import VendorPriceSuggestion
    today = today or timezone.localdate()
    since = today - timedelta(days=days - 1)
    rows = (
        VendorPriceSuggestion.objects.filter(
            fish_species=fish, municipality=municipality, created_at__date__gte=since,
        )
        .exclude(status__in=[VendorPriceSuggestion.STATUS_WITHDRAWN, VendorPriceSuggestion.STATUS_REJECTED])
        .order_by("vendor_id", "-created_at")
    )
    latest = {}
    for row in rows:
        latest.setdefault(row.vendor_id, row)
    return list(latest.values())


def recommend_price(fish, municipality, market=None, today=None):
    """History + vendor suggestions -> recommended price for one fish."""
    from django.db.models import Q
    from .models import PriceRecord, SystemSetting
    today = today or timezone.localdate()

    published = PriceRecord.objects.filter(
        fish_species=fish, municipality=municipality, status=PriceRecord.STATUS_PUBLISHED,
    )
    if market is not None:
        published = published.filter(Q(market=market) | Q(market__isnull=True))
    # The history is the prices before today, so today's price (automatic or
    # published by the LGU) does not count toward its own calculation.
    history = list(published.filter(recorded_date__lt=today).order_by("-recorded_date", "-id")[:HISTORY_COUNT])
    history_prices = [float(r.price_per_kg) for r in history]
    history_median = round(median(history_prices), 2) if history_prices else None
    today_record = published.filter(recorded_date=today).order_by("-id").first()
    if today_record is not None and market is not None and today_record.market_id not in (None, market.pk):
        today_record = None

    suggestions = latest_suggestions(fish, municipality, today)
    items = [{"category": s.reason_category, "comment": s.comment, "price": float(s.suggested_price)} for s in suggestions]
    clusters = cluster_reasons(items)
    vendors = len(items)
    vendor_median = round(median(i["price"] for i in items), 2) if items else None
    top = clusters[0] if clusters else None
    agree = bool(top) and vendors >= MIN_VENDORS and top["share"] >= AGREEMENT_SHARE

    weight = min(MAX_VENDOR_WEIGHT, VENDOR_WEIGHT_STEP * vendors) if agree else 0.0
    if history_median is None:
        recommended = vendor_median if agree else None
        weight = 1.0 if agree else 0.0
    else:
        recommended = round((1 - weight) * history_median + weight * vendor_median, 2) if agree else history_median

    if recommended is None:
        basis = "No price history and not enough agreeing vendor suggestions yet."
    elif not items:
        basis = f"No vendor suggestions in the last {SUGGESTION_DAYS} days; based on the price history only."
    elif not agree:
        if vendors < MIN_VENDORS:
            basis = f"Only {vendors} vendor{'s' if vendors != 1 else ''} suggested (at least {MIN_VENDORS} needed); based on the price history."
        else:
            basis = (f"Vendors gave mixed reasons (the main reason has {round(top['share'] * 100)}%, "
                     f"below {round(AGREEMENT_SHARE * 100)}%); based on the price history.")
    else:
        basis = (f"{round(top['share'] * 100)}% of {vendors} vendors gave the same reason ({top['label'].lower()}), "
                 f"so their median of ₱{vendor_median:,.2f} counts {round(weight * 100)}% and the history "
                 f"(₱{history_median:,.2f}) counts {round((1 - weight) * 100)}%." if history_median is not None else
                 f"No price history; {round(top['share'] * 100)}% of {vendors} vendors agree, so their median is used.")

    low, high, _label = SystemSetting.load().bounds_for(fish)
    in_range = recommended is None or (float(low) <= recommended <= float(high))
    change = None
    if recommended is not None and history_prices:
        change = round((recommended - history_prices[0]) / history_prices[0] * 100, 1)

    return {
        "fish_id": fish.pk,
        "fish_name": fish.name,
        "history_median": history_median,
        "history_count": len(history_prices),
        "last_price": history_prices[0] if history_prices else None,
        "last_date": history[0].recorded_date if history else None,
        "vendor_count": vendors,
        "vendor_median": vendor_median,
        "clusters": clusters,
        "agreement": top["share"] if top else 0,
        "vendor_weight": round(weight, 2),
        "recommended_price": recommended,
        "change_percent": change,
        "basis": basis,
        "in_allowed_range": in_range,
        "allowed_range": [float(low), float(high)],
        "published_today": bool(today_record),
        "published_today_price": float(today_record.price_per_kg) if today_record else None,
        "published_today_automatic": bool(today_record and today_record.source == AUTO_SOURCE),
        "rules": {
            "min_vendors": MIN_VENDORS, "agreement_share": AGREEMENT_SHARE,
            "weight_per_vendor": VENDOR_WEIGHT_STEP, "max_vendor_weight": MAX_VENDOR_WEIGHT,
            "suggestion_days": SUGGESTION_DAYS, "history_count": HISTORY_COUNT,
        },
    }


def default_market(municipality):
    """The market used for vendor suggestions: Pasil when there is one."""
    from .models import Market
    markets = Market.objects.filter(municipality=municipality, is_active=True).order_by("name")
    return markets.filter(name__icontains="pasil").first() or markets.first()


def auto_publish(fish, municipality, market=None, today=None):
    """
    Called whenever a vendor submits, edits or withdraws a suggestion.
    When enough vendors agree on the reason, today's price of the fish is
    published automatically from the price history and the vendors'
    suggestions, so the published history (and therefore the forecast)
    follows the market. An automatic price is updated as more vendors
    suggest, and withdrawn if the vendors no longer agree. A price the LGU
    published or imported for today is never replaced.
    Returns "published", "updated", "withdrawn" or "" (nothing done).
    """
    from decimal import Decimal
    from django.utils import timezone as tz
    from .models import ActivityLog, PriceRecord, SystemSetting
    today = today or timezone.localdate()
    market = market or default_market(municipality)
    rec = recommend_price(fish, municipality, market, today)
    live = (
        PriceRecord.objects.filter(fish_species=fish, municipality=municipality, market=market, recorded_date=today)
        .exclude(status__in=[PriceRecord.STATUS_REJECTED, PriceRecord.STATUS_WITHDRAWN])
        .first()
    )
    if live is not None and live.source != AUTO_SOURCE:
        return ""  # the LGU's own price for today stays

    agree = rec["vendor_weight"] > 0 and rec["recommended_price"] is not None and rec["in_allowed_range"]

    def log(action, record, extra=None):
        top = rec["clusters"][0] if rec["clusters"] else {}
        ActivityLog.objects.create(
            actor=None, actor_username="AquaTimbang", actor_role="System", action=action,
            target_type="PriceRecord", target_id=record.pk, target_name=fish.name,
            details={
                "price_per_kg": str(record.price_per_kg), "recorded_date": today.isoformat(),
                "market": market.name if market else "", "history_median": rec["history_median"],
                "vendor_median": rec["vendor_median"], "vendor_count": rec["vendor_count"],
                "main_reason": top.get("label", ""), "agreement": rec["agreement"],
                "vendor_weight": rec["vendor_weight"], **(extra or {}),
            },
        )

    if not agree:
        if live is not None:
            live.status = PriceRecord.STATUS_WITHDRAWN
            live.remarks = (live.remarks + " Withdrawn automatically: the vendors no longer agree on the reason.")[:2000]
            live.save(update_fields=["status", "remarks", "updated_at"])
            log("auto-withdrawn", live)
            return "withdrawn"
        return ""

    price = Decimal(str(rec["recommended_price"])).quantize(Decimal("0.01"))
    top = rec["clusters"][0]
    remarks = (f"{rec['basis']} Main reason: {top['label']}"
               + (f" (key words: {', '.join(top['top_terms'])})" if top["top_terms"] else "") + ".")[:2000]
    now = tz.now()
    if live is None:
        record = PriceRecord.objects.create(
            fish_species=fish, municipality=municipality, market=market, recorded_date=today,
            price_per_kg=price, status=PriceRecord.STATUS_PUBLISHED, source=AUTO_SOURCE, remarks=remarks,
            reviewed_at=now, published_at=now,
        )
        log("auto-published", record)
        return "published"
    if live.price_per_kg != price or live.remarks != remarks:
        previous = live.price_per_kg
        live.price_per_kg = price
        live.remarks = remarks
        live.save(update_fields=["price_per_kg", "remarks", "updated_at"])
        log("auto-updated", live, {"previous_price": str(previous)})
        return "updated"
    return ""
