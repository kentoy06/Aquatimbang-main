"""
Token authentication that ends idle sessions.

A login token stops working after SESSION_IDLE_MINUTES without any API
request (Tables 24 and 41: automatic expiration after inactivity).
"""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import TokenActivity

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

        return user, token
