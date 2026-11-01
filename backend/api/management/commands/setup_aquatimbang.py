"""
First-time setup for a new AquaTimbang database:

    python manage.py setup_aquatimbang --admin-username admin --admin-email you@example.com

Creates the three roles and, if asked, the first Administrator account.
Safe to run again: existing roles and accounts are left as they are.
"""
from getpass import getpass

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import Role, UserProfile

ROLES = ["Administrator", "LGU Officer", "Fish Vendor"]


class Command(BaseCommand):
    help = "Create the AquaTimbang roles and the first Administrator account."

    def add_arguments(self, parser):
        parser.add_argument("--admin-username", help="Username for the first Administrator.")
        parser.add_argument("--admin-email", default="", help="Email of the first Administrator.")
        parser.add_argument("--admin-password", help="Password (asked for when left out).")

    @transaction.atomic
    def handle(self, *args, **options):
        for name in ROLES:
            _, created = Role.objects.get_or_create(name=name)
            self.stdout.write(f"Role {name}: {'created' if created else 'already exists'}")

        username = options.get("admin_username")
        if not username:
            self.stdout.write("No --admin-username given; skipped creating an Administrator.")
            return
        if User.objects.filter(username__iexact=username).exists():
            self.stdout.write(f"User {username} already exists; left unchanged.")
            return

        password = options.get("admin_password")
        if not password:
            password = getpass("Password for the Administrator: ")
            if password != getpass("Password again: "):
                raise CommandError("The passwords don't match.")
        user = User(username=username, email=options.get("admin_email", ""), is_staff=True, is_superuser=True)
        try:
            validate_password(password, user)
        except ValidationError as error:
            raise CommandError(" ".join(error.messages))
        user.set_password(password)
        user.save()
        UserProfile.objects.create(
            user=user,
            role=Role.objects.get(name="Administrator"),
            account_status=UserProfile.STATUS_APPROVED,
            is_active=True,
        )
        self.stdout.write(self.style.SUCCESS(f"Administrator {username} created. You can now log in."))
