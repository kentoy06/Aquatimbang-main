from django.db import migrations


def copy_vendor_markets(apps, schema_editor):
    """Start the market list with the markets vendors named at registration."""
    Market = apps.get_model("api", "Market")
    FishVendorVerification = apps.get_model("api", "FishVendorVerification")
    seen = set()
    rows = FishVendorVerification.objects.exclude(market_name="").values_list(
        "market_name", "profile__municipality_id"
    )
    for name, municipality_id in rows:
        name = " ".join((name or "").split())
        key = (name.lower(), municipality_id)
        if not name or municipality_id is None or key in seen:
            continue
        seen.add(key)
        if not Market.objects.filter(name__iexact=name, municipality_id=municipality_id).exists():
            Market.objects.create(name=name, municipality_id=municipality_id)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0019_announcements_and_markets"),
    ]

    operations = [
        migrations.RunPython(copy_vendor_markets, migrations.RunPython.noop),
    ]
