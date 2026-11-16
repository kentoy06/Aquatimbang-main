"""
Automatic publishing now needs at least 100 agreeing vendors by default (the
Administrator can set 2 to 200). A setting still at the old default of 3 is
raised to 100; a value the Administrator chose is kept.
"""

from django.db import migrations, models


def raise_default(apps, schema_editor):
    SystemSetting = apps.get_model("api", "SystemSetting")
    SystemSetting.objects.filter(auto_publish_min_vendors=3).update(auto_publish_min_vendors=100)


def lower_default(apps, schema_editor):
    SystemSetting = apps.get_model("api", "SystemSetting")
    SystemSetting.objects.filter(auto_publish_min_vendors=100).update(auto_publish_min_vendors=3)


class Migration(migrations.Migration):
    dependencies = [("api", "0046_remove_non_fish")]
    operations = [
        migrations.AlterField(
            model_name="systemsetting",
            name="auto_publish_min_vendors",
            field=models.PositiveSmallIntegerField(default=100),
        ),
        migrations.RunPython(raise_default, lower_default),
    ]
