"""
AquaTimbang tracks fish only: remove items in Fish Species that are not fish
(squid, shrimp, crabs, shellfish, seaweed, Annicad...), found by name with
the same word list the import uses, together with everything recorded under
them. Each removal is kept in the activity log. Fish are not touched.
"""

from django.db import migrations


def remove_non_fish(apps, schema_editor):
    from api.species_tools import is_non_fish

    FishSpecies = apps.get_model("api", "FishSpecies")
    PriceRecord = apps.get_model("api", "PriceRecord")
    VendorPriceSuggestion = apps.get_model("api", "VendorPriceSuggestion")
    WeightEntry = apps.get_model("api", "WeightEntry")
    FishScanPhoto = apps.get_model("api", "FishScanPhoto")
    ActivityLog = apps.get_model("api", "ActivityLog")

    for fish in FishSpecies.objects.all():
        if not is_non_fish(fish.name):
            continue
        prices = PriceRecord.objects.filter(fish_species=fish)
        details = {
            "deleted_id": fish.pk,
            "deleted_name": fish.name,
            "prices_deleted": prices.count(),
            "suggestions_deleted": VendorPriceSuggestion.objects.filter(fish_species=fish).count(),
            "calculations_deleted": WeightEntry.objects.filter(fish_species=fish).count(),
            "reason": "Not a fish (removed automatically by the system update)",
        }
        WeightEntry.objects.filter(fish_species=fish).delete()
        FishScanPhoto.objects.filter(fish_species=fish).delete()
        VendorPriceSuggestion.objects.filter(fish_species=fish).delete()
        prices.delete()
        ActivityLog.objects.create(
            actor=None, actor_username="system", actor_role="System",
            action="deleted with all records", target_type="FishSpecies",
            target_id=fish.pk, target_name=fish.name, details=details,
        )
        fish.delete()


class Migration(migrations.Migration):
    dependencies = [("api", "0045_notification_state")]
    operations = [migrations.RunPython(remove_non_fish, migrations.RunPython.noop)]
