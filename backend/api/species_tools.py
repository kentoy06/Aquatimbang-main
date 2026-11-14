"""
Shared helpers for fish species: merging two records of the same fish, and
the scientific names of fish commonly sold in Cebu markets.

merge_species() takes the model classes as arguments so the same code runs
in views and in data migrations (which use historical models).
"""

from django.db.models import Q


def name_key(value):
    """'Lapu-Lapu', 'lapu lapu' and 'LAPULAPU' all become 'lapulapu'."""
    return "".join(ch for ch in str(value or "").lower() if ch.isalnum())


# Fish commonly sold in Cebu City markets: (common name, scientific name).
# Offered as choices when adding a fish, and used to fill the scientific name
# when it is left blank; the LGU or Administrator can still edit it.
KNOWN_FISH = [
    ("Galunggong", "Decapterus macrosoma"),
    ("Budloy", "Decapterus macrosoma"),
    ("Bangus", "Chanos chanos"),
    ("Tilapia", "Oreochromis niloticus"),
    ("Tulingan", "Auxis thazard"),
    ("Alumahan", "Rastrelliger kanagurta"),
    ("Anduhaw", "Rastrelliger kanagurta"),
    ("Hasa-Hasa", "Rastrelliger brachysoma"),
    ("Tamban", "Sardinella lemuru"),
    ("Tunsoy", "Sardinella fimbriata"),
    ("Matambaka", "Selar crumenophthalmus"),
    ("Salay-Salay", "Selaroides leptolepis"),
    ("Dilis", "Stolephorus spp."),
    ("Bolinaw", "Stolephorus spp."),
    ("Lapu-Lapu", "Epinephelus spp."),
    ("Pugapo", "Epinephelus spp."),
    ("Maya-Maya", "Lutjanus spp."),
    ("Tambakol", "Thunnus albacares"),
    ("Bariles", "Thunnus albacares"),
    ("Tanigue", "Scomberomorus commerson"),
    ("Tangigue", "Scomberomorus commerson"),
    ("Danggit", "Siganus spp."),
    ("Samaral", "Siganus spp."),
    ("Dalagang Bukid", "Caesio cuning"),
    ("Sapsap", "Leiognathus spp."),
    ("Talakitok", "Caranx spp."),
    ("Mamsa", "Caranx spp."),
    ("Bisugo", "Nemipterus spp."),
    ("Pampano", "Trachinotus blochii"),
    ("Espada", "Trichiurus lepturus"),
    ("Hito", "Clarias batrachus"),
    ("Dalag", "Channa striata"),
    ("Haluan", "Channa striata"),
    ("Bilong-Bilong", "Mene maculata"),
    ("Kitang", "Scatophagus argus"),
    ("Labahita", "Acanthurus spp."),
    ("Molmol", "Scarus spp."),
    ("Dorado", "Coryphaena hippurus"),
]

KNOWN_SCIENTIFIC_NAMES = {name_key(name): scientific for name, scientific in KNOWN_FISH}


def spelling_key(value):
    """
    Key that ignores common Cebuano/Filipino spelling differences, so that
    "Anduhaw" and "Andohaw", "Bisugo" and "Bisogo", or "Tulingan" and
    "Tolingan", or "Lagao" and "Lagaw" are recognized as the same fish: a
    final or inner "ao" is read as "aw", o as u, e as i, and repeated letters
    count once.
    """
    key = name_key(value).replace("ao", "aw").replace("o", "u").replace("e", "i")
    out = []
    for ch in key:
        if not out or out[-1] != ch:
            out.append(ch)
    return "".join(out)


def similarity(a, b):
    from difflib import SequenceMatcher
    return SequenceMatcher(None, spelling_key(a), spelling_key(b)).ratio()


# Names this similar (after spelling_key) are probably the same fish.
SIMILAR_RATIO = 0.86


def names_of(fish):
    return [fish.name, *[a for a in (fish.aliases or []) if a]]


def find_same_fish(name, fishes):
    """
    The existing fish that `name` most likely refers to, and how it matched:
    ("exact" | "alias" | "spelling" | "similar", fish), or (None, None).
    """
    key = name_key(name)
    if not key:
        return None, None
    for fish in fishes:
        if name_key(fish.name) == key:
            return "exact", fish
    for fish in fishes:
        if any(name_key(a) == key for a in (fish.aliases or [])):
            return "alias", fish
    folded = spelling_key(name)
    same = [f for f in fishes if any(spelling_key(n) == folded for n in names_of(f))]
    if len(same) == 1:
        return "spelling", same[0]
    if len(key) >= 5:
        scored = sorted(
            ((max(similarity(name, n) for n in names_of(f)), f) for f in fishes),
            key=lambda pair: -pair[0],
        )
        if scored and scored[0][0] >= SIMILAR_RATIO and (len(scored) == 1 or scored[1][0] < scored[0][0]):
            return "similar", scored[0][1]
    return None, None


def similar_pairs(fishes):
    """Pairs of different fish whose names look like spellings of one name."""
    pairs = []
    fishes = list(fishes)
    for i, a in enumerate(fishes):
        for b in fishes[i + 1:]:
            ratio = max(similarity(x, y) for x in names_of(a) for y in names_of(b))
            if spelling_key(a.name) == spelling_key(b.name) or ratio >= SIMILAR_RATIO:
                pairs.append((a, b, round(ratio, 2)))
    return sorted(pairs, key=lambda p: -p[2])


def add_alias(fish, *names):
    """Remember other spellings of a fish (no duplicates, not its own name)."""
    current = list(fish.aliases or [])
    keys = {name_key(fish.name), *(name_key(a) for a in current)}
    for name in names:
        if name and name_key(name) not in keys:
            current.append(name)
            keys.add(name_key(name))
    fish.aliases = current


def known_scientific_name(common_name):
    return KNOWN_SCIENTIFIC_NAMES.get(name_key(common_name), "")


def merge_species(source, target, PriceRecord, VendorPriceSuggestion, WeightEntry,
                  FishScanPhoto, FishVendorVerification, ClosedFishingSeason):
    """
    Move everything recorded under `source` to `target`. When both have a
    price for the same municipality, market and day, the target's price is
    kept and the source's is removed. The caller deletes `source` afterwards.
    """
    live = ~Q(status__in=["rejected", "withdrawn"])
    taken = set(
        PriceRecord.objects.filter(live, fish_species=target)
        .values_list("municipality_id", "market_id", "recorded_date")
    )
    duplicates = [
        record.pk for record in PriceRecord.objects.filter(live, fish_species=source)
        if (record.municipality_id, record.market_id, record.recorded_date) in taken
    ]
    PriceRecord.objects.filter(pk__in=duplicates).delete()
    moved = PriceRecord.objects.filter(fish_species=source).update(fish_species=target)
    suggestions = VendorPriceSuggestion.objects.filter(fish_species=source).update(fish_species=target)
    WeightEntry.objects.filter(fish_species=source).update(fish_species=target)
    FishScanPhoto.objects.filter(fish_species=source).update(fish_species=target)
    for vendor in FishVendorVerification.objects.filter(species_sold=source):
        vendor.species_sold.add(target)
    for season in ClosedFishingSeason.objects.filter(species=source):
        season.species.add(target)
    changed = ["aliases"]
    add_alias(target, source.name, *(source.aliases or []))
    if not target.scientific_name and source.scientific_name:
        target.scientific_name = source.scientific_name
        changed.append("scientific_name")
    if not target.photo and source.photo:
        target.photo = source.photo
        changed.append("photo")
    if changed:
        target.save(update_fields=changed)
    return {"prices_moved": moved, "duplicate_prices_removed": len(duplicates), "suggestions_moved": suggestions}
