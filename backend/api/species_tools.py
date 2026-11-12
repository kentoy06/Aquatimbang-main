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
    changed = []
    if not target.scientific_name and source.scientific_name:
        target.scientific_name = source.scientific_name
        changed.append("scientific_name")
    if not target.photo and source.photo:
        target.photo = source.photo
        changed.append("photo")
    if changed:
        target.save(update_fields=changed)
    return {"prices_moved": moved, "duplicate_prices_removed": len(duplicates), "suggestions_moved": suggestions}
