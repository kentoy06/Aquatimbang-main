"""
Private messages between AquaTimbang accounts.

Allowed pairs:
  Fish Vendor  <-> LGU Officer   (same municipality only)
  LGU Officer  <-> Administrator
  Fish Vendor  <-> Administrator
Vendors cannot message other vendors (to prevent price coordination and
to keep vendors anonymous to each other).
"""

from .models import UserProfile

VENDOR, LGU, ADMIN = "Fish Vendor", "LGU Officer", "Administrator"


def _approved(user):
    profile = getattr(user, "aquatimbang_profile", None)
    if (
        not user.is_active or profile is None or not profile.is_active
        or profile.account_status != UserProfile.STATUS_APPROVED
    ):
        return None
    return profile


def can_message(sender, recipient):
    """True when these two accounts may message each other."""
    if sender.pk == recipient.pk:
        return False
    a, b = _approved(sender), _approved(recipient)
    if a is None or b is None:
        return False
    roles = {a.role.name, b.role.name}
    if roles == {VENDOR, LGU}:
        return a.municipality_id is not None and a.municipality_id == b.municipality_id
    return roles in ({LGU, ADMIN}, {VENDOR, ADMIN})


def contacts_for(user):
    """Profiles this user may start a conversation with."""
    me = _approved(user)
    if me is None:
        return UserProfile.objects.none()
    base = UserProfile.objects.filter(
        is_active=True, user__is_active=True, account_status=UserProfile.STATUS_APPROVED,
    ).exclude(user=user).select_related("user", "role", "municipality")
    role = me.role.name
    if role == VENDOR:
        lgu = base.filter(role__name=LGU, municipality_id=me.municipality_id) if me.municipality_id else base.none()
        return lgu | base.filter(role__name=ADMIN)
    if role == LGU:
        vendors = base.filter(role__name=VENDOR, municipality_id=me.municipality_id) if me.municipality_id else base.none()
        return vendors | base.filter(role__name=ADMIN)
    if role == ADMIN:
        return base.filter(role__name__in=[VENDOR, LGU])
    return base.none()
