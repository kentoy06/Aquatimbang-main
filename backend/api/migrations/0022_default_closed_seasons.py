from django.db import migrations


def add_defaults(apps, schema_editor):
    from api.closed_seasons import seed_closed_seasons
    seed_closed_seasons(apps.get_model("api", "ClosedFishingSeason"), apps.get_model("api", "FishSpecies"))


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0021_closed_fishing_seasons"),
    ]

    operations = [
        migrations.RunPython(add_defaults, migrations.RunPython.noop),
    ]
