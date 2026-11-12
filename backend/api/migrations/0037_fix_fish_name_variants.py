"""
Clean up fish added more than once under different spellings, e.g.
"Lapu2x" and "lapu lapu" next to "Lapu-Lapu":

- every name gets the tidy form ("lapu2x" -> "Lapu-Lapu", "bangus" -> "Bangus")
- fish whose tidy names match are merged into one: the oldest record is
  kept, and the others' prices, suggestions and other records move to it
  (when both have a price for the same market and day, the kept fish's price
  stays)
- a blank scientific name is filled in for well-known fish
"""

from django.db import migrations


def fix_variants(apps, schema_editor):
    from api.species_tools import known_scientific_name, merge_species, name_key
    from api.validators import clean_fish_name

    FishSpecies = apps.get_model("api", "FishSpecies")
    models = [apps.get_model("api", name) for name in (
        "PriceRecord", "VendorPriceSuggestion", "WeightEntry",
        "FishScanPhoto", "FishVendorVerification", "ClosedFishingSeason",
    )]

    groups = {}
    for fish in FishSpecies.objects.order_by("pk"):
        groups.setdefault(name_key(clean_fish_name(fish.name)), []).append(fish)

    for fishes in groups.values():
        keep, extra = fishes[0], fishes[1:]
        for other in extra:
            merge_species(other, keep, *models)
            if other.is_active and not keep.is_active:
                keep.is_active = True
            other.delete()
        keep.name = clean_fish_name(keep.name)[:100]
        if not (keep.scientific_name or "").strip():
            keep.scientific_name = known_scientific_name(keep.name)
        keep.save()


class Migration(migrations.Migration):
    dependencies = [("api", "0036_tidy_fish_names")]
    operations = [migrations.RunPython(fix_variants, migrations.RunPython.noop)]
