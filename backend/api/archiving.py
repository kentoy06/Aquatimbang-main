"""
Automatic archiving of unused Fish Vendor accounts.

A vendor account with no login for ARCHIVE_AFTER_YEARS (or, if it never
logged in, that long after registering) is archived: it can no longer log
in, but nothing is deleted. Prices, suggestions and logs stay. An
Administrator can reactivate it from User Management.

The check runs at most once a day, started by the first login of the day,
so no scheduled job is needed. `python manage.py archive_inactive_vendors`
runs it on demand.
"""

from datetime import timedelta

from django.core.cache import cache
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

ARCHIVE_AFTER_YEARS = 5


def archive_inactive_vendors(now=None):
    """Archive vendor accounts unused for 5 years. Returns how many were archived."""
    from rest_framework.authtoken.models import Token

    from .models import ActivityLog, UserProfile

    now = now or timezone.now()
    cutoff = now - timedelta(days=round(365.25 * ARCHIVE_AFTER_YEARS))
    profiles = (
        UserProfile.objects.select_related("user")
        .filter(role__name="Fish Vendor", account_status=UserProfile.STATUS_APPROVED, is_active=True)
        .filter(
            Q(user__last_login__lt=cutoff)
            | Q(user__last_login__isnull=True, user__date_joined__lt=cutoff)
        )
    )
    archived = 0
    for profile in profiles:
        user = profile.user
        last_used = user.last_login or user.date_joined
        with transaction.atomic():
            profile.is_active = False
            profile.archived_at = now
            profile.save(update_fields=["is_active", "archived_at", "updated_at"])
            user.is_active = False
            user.save(update_fields=["is_active"])
            Token.objects.filter(user=user).delete()
            ActivityLog.objects.create(
                actor=None,
                actor_username="System",
                actor_role="System",
                action="archived",
                target_type="UserAccount",
                target_id=user.pk,
                target_name=user.username,
                details={
                    "reason": f"No login for {ARCHIVE_AFTER_YEARS} years",
                    "last_login": last_used.isoformat() if last_used else None,
                },
            )
        archived += 1
    return archived


def archive_once_a_day():
    """Run the check at most once per day (cheap to call on every login)."""
    key = f"aquatimbang-archive-check-{timezone.localdate().isoformat()}"
    if cache.add(key, True, timeout=60 * 60 * 26):
        return archive_inactive_vendors()
    return 0
