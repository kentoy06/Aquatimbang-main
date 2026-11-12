"""
Give existing fish names the same capitals as new ones, e.g.
"Lapu-lapu" -> "Lapu-Lapu", "salay salay" -> "Salay-Salay". A name is left
as it is if another fish already uses the tidy name.
"""

from django.db import migrations


def tidy_names(apps, schema_editor):
    from api.validators import clean_fish_name

    FishSpecies = apps.get_model("api", "FishSpecies")
    for fish in FishSpecies.objects.all():
        tidy = clean_fish_name(fish.name)[:100]
        if not tidy or tidy == fish.name:
            continue
        if FishSpecies.objects.filter(name__iexact=tidy).exclude(pk=fish.pk).exists():
            continue
        fish.name = tidy
        fish.save(update_fields=["name"])


class Migration(migrations.Migration):
    dependencies = [("api", "0035_price_market")]
    operations = [migrations.RunPython(tidy_names, migrations.RunPython.noop)]
