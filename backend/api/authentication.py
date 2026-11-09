"""
Token authentication that ends idle sessions.

A login token stops working after SESSION_IDLE_MINUTES without any API
request (Tables 24 and 41: automatic expiration after inactivity).
"""

from datetime import timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import TokenActivity, UserProfile

# Save the "last seen" time at most this often, to avoid a database
# write on every request.
ACTIVITY_WRITE_INTERVAL = timedelta(seconds=60)

SESSION_EXPIRED_MESSAGE = "Your session expired after {minutes} minutes of inactivity. Please log in again."


class ExpiringTokenAuthentication(TokenAuthentication):
    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)

        now = timezone.now()
        idle_limit = timedelta(minutes=settings.SESSION_IDLE_MINUTES)
        activity, created = TokenActivity.objects.get_or_create(token=token, defaults={"last_seen": now})

        if not created and now - activity.last_seen > idle_limit:
            token.delete()
            raise AuthenticationFailed(SESSION_EXPIRED_MESSAGE.format(minutes=settings.SESSION_IDLE_MINUTES))

        if not created and now - activity.last_seen > ACTIVITY_WRITE_INTERVAL:
            activity.last_seen = now
            activity.save(update_fields=["last_seen"])

        # For Online / Offline in the user lists (at most once a minute).
        UserProfile.objects.filter(user=user).filter(
            Q(last_seen__isnull=True) | Q(last_seen__lt=now - ACTIVITY_WRITE_INTERVAL)
        ).update(last_seen=now)

        return user, token


# A user counts as online when they used AquaTimbang within this time
# and are still logged in. Open pages send a heartbeat every minute.
ONLINE_WINDOW = timedelta(minutes=3)


def logged_in_user_ids():
    """Users with at least one login token that has not been ended."""
    from rest_framework.authtoken.models import Token
    return set(Token.objects.values_list("user_id", flat=True))


def presence(profile, logged_in_ids=None):
    """{"is_online": bool, "last_seen": iso or None} for one account."""
    if logged_in_ids is None:
        logged_in_ids = logged_in_user_ids()
    # Accounts not seen since this feature was added fall back to last login.
    last_seen = profile.last_seen or profile.user.last_login
    online = bool(
        profile.last_seen
        and profile.user_id in logged_in_ids
        and timezone.now() - last_seen <= ONLINE_WINDOW
    )
    return {"is_online": online, "last_seen": last_seen.isoformat() if last_seen else None}
