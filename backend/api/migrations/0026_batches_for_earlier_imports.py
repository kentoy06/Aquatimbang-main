"""
Imports made before import batches existed were not linked to a batch, so
they could not be undone. Group their prices (same person, same source,
saved in the same minute) into batches so they appear in Recent Imports.
"""

from django.db import migrations


def group_earlier_imports(apps, schema_editor):
    PriceRecord = apps.get_model("api", "PriceRecord")
    PriceImportBatch = apps.get_model("api", "PriceImportBatch")
    records = (
        PriceRecord.objects.filter(import_batch__isnull=True, remarks="Imported price history")
        .order_by("created_at")
        .only("id", "recorded_by_id", "source", "created_at", "recorded_date")
    )
    groups = {}
    for record in records.iterator():
        minute = record.created_at.replace(second=0, microsecond=0)
        groups.setdefault((record.recorded_by_id, record.source, minute), []).append(record)
    for number, ((user_id, source, minute), rows) in enumerate(groups.items(), start=1):
        dates = [r.recorded_date for r in rows]
        batch = PriceImportBatch.objects.create(
            batch_key=f"earlier-{number}-{int(minute.timestamp())}",
            file_name="Earlier import (file name not recorded)",
            source=source or "",
            imported_by_id=user_id,
            record_count=len(rows),
            first_date=min(dates),
            last_date=max(dates),
        )
        # created_at is auto_now_add; set it to the original import time.
        PriceImportBatch.objects.filter(pk=batch.pk).update(created_at=minute)
        PriceRecord.objects.filter(pk__in=[r.pk for r in rows]).update(import_batch=batch)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0025_price_import_batches"),
    ]

    operations = [
        migrations.RunPython(group_earlier_imports, migrations.RunPython.noop),
    ]
