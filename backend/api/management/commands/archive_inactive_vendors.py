from django.core.management.base import BaseCommand

from api.archiving import ARCHIVE_AFTER_YEARS, archive_inactive_vendors


class Command(BaseCommand):
    help = f"Archive Fish Vendor accounts with no login for {ARCHIVE_AFTER_YEARS} years (runs daily on its own too)."

    def handle(self, *args, **options):
        count = archive_inactive_vendors()
        self.stdout.write(self.style.SUCCESS(f"Archived {count} vendor account(s) unused for {ARCHIVE_AFTER_YEARS} years."))
