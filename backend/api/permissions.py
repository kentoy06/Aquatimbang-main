# Import Django REST Framework's permission system.
from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAdministratorOrReadOnly(BasePermission):
    """
    Allow all authenticated AquaTimbang users to read data.

    Only Administrators can create, update, or delete
    protected reference data such as fish species and
    municipalities.
    """

    def has_permission(self, request, view):
        # The user must be logged in.
        if not request.user or not request.user.is_authenticated:
            return False

        # GET, HEAD, and OPTIONS requests are read-only.
        if request.method in SAFE_METHODS:
            return True

        # Get the AquaTimbang profile connected to the user.
        profile = getattr(
            request.user,
            "aquatimbang_profile",
            None
        )

        
        # Reject accounts without an AquaTimbang profile.
        if profile is None:
            return False

        # Reject deactivated AquaTimbang accounts.
        if not profile.is_active:
            return False

        # Reject accounts disabled through Django's User model.
        if not request.user.is_active:
            return False

        # Only Administrators may modify protected data.
        return profile.role.name == "Administrator"

        # Only Administrators may modify protected data.
        return profile.role.name == "Administrator"


class CanManagePriceRecords(BasePermission):
    """
    AquaTimbang price-record permissions.

    Administrator:
        - Can view all records.
        - Can create records.
        - Can edit/delete records.
        - Can review records.
        - Can publish, flag, and reject records.

    LGU Officer:
        - Can view all records.
        - Can create price records.
        - Can edit/delete records.
        - Can submit records for review.
        - Can review records.
        - Can publish, flag, and reject records.

    Fish Vendor:
        - Can view price records.
        - Can create price submissions.
        - Can edit/delete their own records.
        - Can submit their own drafts for review.
        - Cannot publish, flag, or reject records.
    """

    def has_permission(self, request, view):
        # The user must be authenticated.
        if not request.user or not request.user.is_authenticated:
            return False

        # Get the AquaTimbang profile.
        profile = getattr(
            request.user,
            "aquatimbang_profile",
            None
        )

        # Reject accounts without a profile.
        if profile is None:
            return False

        # Prevent deactivated users from accessing price records.
        if not profile.is_active:
            return False

        # Prevent disabled Django users from accessing records.
        if not request.user.is_active:
            return False

        # Get the user's role.
        role = profile.role.name

        # All authenticated AquaTimbang users may read records.
        if request.method in SAFE_METHODS:
            return True

        # Administrators have full access.
        if role == "Administrator":
            return True

        # LGU Officers have full price-record workflow access.
        if role == "LGU Officer":
            return True

        # ----------------------------------------------------
        # FISH VENDOR PERMISSIONS
        # ----------------------------------------------------

        if role == "Fish Vendor":

            # Vendors may create new price submissions.
            if request.method == "POST":

                # Get the current ViewSet action.
                action = getattr(view, "action", None)

                # Vendors may create normal records.
                if action == "create":
                    return True

                # Vendors may submit a single draft for review.
                if action == "submit_for_review":
                    return True

                # Vendors may submit their drafts together.
                if action == "submit_all_for_review":
                    return True

                # Vendors cannot publish, flag, or reject.
                return False

            # Allow update/delete requests to continue to the
            # object-level ownership check below.
            if request.method in [
                "PUT",
                "PATCH",
                "DELETE",
            ]:
                return True

        # Deny anything not explicitly allowed above.
        return False

    def has_object_permission(self, request, view, obj):
        # Get the AquaTimbang profile.
        profile = getattr(
            request.user,
            "aquatimbang_profile",
            None
        )

        # Reject accounts without a profile.
        if profile is None:
            return False

        # Prevent deactivated users from accessing price records.
        if not profile.is_active:
            return False

        # Prevent disabled Django users from accessing records.
        if not request.user.is_active:
            return False

        # Get the user's role.
        role = profile.role.name

        # Everyone authenticated may read records.
        if request.method in SAFE_METHODS:
            return True

        # Administrators and LGU Officers may manage
        # any price record.
        if role in [
            "Administrator",
            "LGU Officer",
        ]:
            return True

        # ----------------------------------------------------
        # FISH VENDOR OBJECT PERMISSIONS
        # ----------------------------------------------------

        if role == "Fish Vendor":

            # The record must belong to this vendor.
            owns_record = (
                obj.recorded_by_id == request.user.id
            )

            if not owns_record:
                return False

            # Get the ViewSet action currently being executed.
            action = getattr(view, "action", None)

            # Vendor may submit their own draft for review.
            if action == "submit_for_review":
                return True

            # Vendor may edit/delete only their own records.
            if request.method in [
                "PUT",
                "PATCH",
                "DELETE",
            ]:
                return True

        # Deny all other operations.
        return False

class IsAquaTimbangAdministrator(BasePermission):
    """
    Allow access only to active AquaTimbang Administrators.

    Intended for sensitive operations such as reviewing
    registration verification documents.
    """

    def has_permission(self, request, view):

        # Require an authenticated Django user.
        if not request.user or not request.user.is_authenticated:
            return False

        # Reject disabled Django accounts.
        if not request.user.is_active:
            return False

        # Retrieve the AquaTimbang profile.
        profile = getattr(
            request.user,
            "aquatimbang_profile",
            None
        )

        # Reject users without an AquaTimbang profile.
        if profile is None:
            return False

        # Reject inactive AquaTimbang accounts.
        if not profile.is_active:
            return False

        # Allow only Administrators.
        return profile.role.name == "Administrator"

        from rest_framework.permissions import BasePermission, SAFE_METHODS


class CanManageFishSpecies(BasePermission):
    """
    Fish Species permissions:
    - Authenticated users: read
    - Approved LGU Officers: create and update
    - Administrators: full CRUD
    - Fish Vendors: read only
    """

    message = "You do not have permission to perform this fish species action."

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated or not user.is_active:
            return False

        # Every authenticated, active user can read species.
        if request.method in SAFE_METHODS:
            return True

        try:
            profile = user.aquatimbang_profile
            role = profile.role.name.strip().lower()
        except (AttributeError, TypeError):
            return False

        # Administrators have full management permissions.
        if role in ("administrator", "system administrator"):
            return profile.account_status == "approved"

        # LGU Officers may create and update, but not delete.
        if role == "lgu officer":
            return (
                profile.account_status == "approved"
                and request.method in ("POST", "PUT", "PATCH")
            )

        # Fish Vendors cannot modify species.
        return False