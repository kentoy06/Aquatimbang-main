# ============================================================
# AQUATIMBANG API VIEWS
# ============================================================
# Django authentication function.
from django.http import FileResponse, Http404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from .models import FishVendorVerification, LGUOfficerVerification
from .permissions import IsAquaTimbangAdministrator
from django.contrib.auth import authenticate
# Django's built-in user model.
from django.contrib.auth.models import User
# Database transaction support.
from django.db import transaction
# Used for saving review and publishing timestamps.
from django.utils import timezone
# Django REST Framework tools.
from rest_framework import status, viewsets
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.decorators import (
    action,
    api_view,
    parser_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
# Import AquaTimbang database models.
from .models import (
    FishSpecies,
    ActivityLog,
    Municipality,
    PriceRecord,
    Role,
    UserProfile,
)
# Import AquaTimbang permissions.
from .permissions import (
    IsAdministratorOrReadOnly,
    CanManagePriceRecords,
    CanManageFishSpecies,
)
# Import AquaTimbang serializers.
from .serializers import (
    FishSpeciesSerializer,
    ActivityLogSerializer,
    MunicipalitySerializer,
    PriceRecordSerializer,
    RegisterSerializer,
)
# ============================================================
# LOGIN
# ============================================================
@api_view(["POST"])
@permission_classes([AllowAny])
def login_user(request):
    """
    Authenticate an AquaTimbang user and return a login token.
    """
    username = request.data.get("username")
    password = request.data.get("password")
    # Require both login credentials.
    if not username or not password:
        return Response(
            {"message": "Username and password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # Authenticate using Django.
    user = authenticate(
        username=username,
        password=password,
    )
    if user is None:
        return Response(
            {"message": "Invalid username or password."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    # Retrieve the user's AquaTimbang profile.
    try:
        profile = user.aquatimbang_profile
    except UserProfile.DoesNotExist:
        return Response(
            {"message": "This account has no AquaTimbang profile."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # Reject inactive accounts.
    if not user.is_active or not profile.is_active:
        return Response(
            {"message": "This AquaTimbang account is inactive."},
            status=status.HTTP_403_FORBIDDEN,
        )
    # Record the login time (token logins do not do this automatically).
    from django.contrib.auth.models import update_last_login
    update_last_login(None, user)
    # Create or retrieve the authentication token.
    token, _ = Token.objects.get_or_create(user=user)
    return Response(
        {
            "message": "Login successful.",
            "token": token.key,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role": profile.role.name,
                "municipality": (
                    profile.municipality.name
                    if profile.municipality
                    else None
                ),
                "municipality_id": (
                    profile.municipality.id
                    if profile.municipality
                    else None
                ),
            },
        },
        status=status.HTTP_200_OK,
    )
# ============================================================
# REGISTRATION
# ============================================================
@api_view(["POST"])
@permission_classes([AllowAny])
def register_user(request):
    """
    Create a new AquaTimbang account.
    """
    # Validate the registration information.
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        # Create the Django User and UserProfile.
        user = serializer.save()
        return Response(
            {
                "message": "Account registered successfully.",
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                }
            },
            status=status.HTTP_201_CREATED
        )
    # Return validation errors.
    return Response(
        serializer.errors,
        status=status.HTTP_400_BAD_REQUEST
    )
# ============================================================
# PRICE RECORD API
# ============================================================
class PriceRecordViewSet(viewsets.ModelViewSet):
    """
    API for AquaTimbang fish price records.
    Workflow:
    Draft
        ↓
    Submit for Review
        ↓
    Pending Review
        ↓
    Published / Flagged / Rejected
    """
    # Load related database information efficiently.
    queryset = PriceRecord.objects.select_related(
        "fish_species",
        "municipality",
        "recorded_by",
        "reviewed_by",
        "published_by",
    ).all()
    # Serializer used for JSON conversion.
    serializer_class = PriceRecordSerializer
    # ========================================================
    # PREVIOUS PUBLISHED PRICE
    # ========================================================
    def get_previous_published_price(self, price_record):
        """
        Find the most recent earlier published price
        for the same fish species and municipality.
        """
        # Compare only records for the same fish and location.
        previous_record = (
            PriceRecord.objects.filter(
                fish_species=price_record.fish_species,
                municipality=price_record.municipality,
                status=PriceRecord.STATUS_PUBLISHED,
                recorded_date__lt=price_record.recorded_date,
            )
            .order_by("-recorded_date", "-id")
            .first()
        )
        # Return None when no earlier published price exists.
        if previous_record is None:
            return None
        return previous_record.price_per_kg
    # Require AquaTimbang token authentication.
    authentication_classes = [TokenAuthentication]
    # Apply AquaTimbang price permissions.
    permission_classes = [CanManagePriceRecords]
    def _log_price(self, action, record, details=None):
        user = self.request.user
        profile = getattr(user, "aquatimbang_profile", None)
        ActivityLog.objects.create(
            actor=user,
            actor_username=user.username,
            actor_role=profile.role.name if profile else "Unknown",
            action=action,
            target_type="PriceRecord",
            target_id=record.pk,
            target_name=f"{record.fish_species.name} - {record.municipality.name}",
            details=details or {},
        )

    @transaction.atomic
    def perform_update(self, serializer):
        record = serializer.instance
        fields = ("fish_species_id", "municipality_id", "price_per_kg", "recorded_date", "source", "remarks", "status")
        previous = {field: str(getattr(record, field)) for field in fields}
        updated = serializer.save()
        changes = {
            field: {"from": previous[field], "to": str(getattr(updated, field))}
            for field in fields if previous[field] != str(getattr(updated, field))
        }
        if changes:
            self._log_price("updated", updated, {"changes": changes})

    @transaction.atomic
    def perform_destroy(self, instance):
        self._log_price("deleted", instance, {
            "price_per_kg": str(instance.price_per_kg),
            "recorded_date": instance.recorded_date.isoformat(),
            "status": instance.status,
        })
        instance.delete()

    # --------------------------------------------------------
    # CREATE PRICE RECORD
    # --------------------------------------------------------
    @transaction.atomic
    def perform_create(self, serializer):
        """
        Create a new price record.
        New records are saved as Draft by default.
        """
        # The logged-in user is automatically stored as
        # the person who created the price record.
        record = serializer.save(
            recorded_by=self.request.user,
            status=PriceRecord.STATUS_DRAFT
        )
        self._log_price("created", record, {
            "price_per_kg": str(record.price_per_kg),
            "recorded_date": record.recorded_date.isoformat(),
            "status": record.status,
        })
    # ========================================================
    # DRAFT RECORDS
    # ========================================================
    @action(
        detail=False,
        methods=["get"],
        url_path="drafts"
    )
    def draft_records(self, request):
        """
        Return price records currently saved as drafts.
        """
        # Get only draft records.
        records = self.get_queryset().filter(
            status=PriceRecord.STATUS_DRAFT
        )
        # Convert database records to JSON.
        serializer = self.get_serializer(
            records,
            many=True
        )
        return Response(serializer.data)
    # ========================================================
    # SUBMIT ONE RECORD FOR REVIEW
    # ========================================================
    @action(
        detail=True,
        methods=["post"],
        url_path="submit-review"
    )
    @transaction.atomic
    def submit_for_review(self, request, pk=None):
        """
        Submit one draft price record for LGU review.
        """
        # Get the selected price record.
        price_record = self.get_object()
        # Only Draft records can be submitted.
        if price_record.status != PriceRecord.STATUS_DRAFT:
            return Response(
                {
                    "message": (
                        "Only draft price records can be "
                        "submitted for review."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        # Change Draft to Pending Review.
        price_record.status = PriceRecord.STATUS_PENDING
        # Clear old review information.
        price_record.reviewed_by = None
        price_record.reviewed_at = None
        # Clear old flag/rejection information.
        price_record.flag_reason = ""
        price_record.rejection_reason = ""
        # Save the updated record.
        price_record.save()
        self._log_price("submitted", price_record, {"status": price_record.status})
        # Return the updated record.
        serializer = self.get_serializer(price_record)
        return Response(
            {
                "message": "Price record submitted for review.",
                "record": serializer.data
            },
            status=status.HTTP_200_OK
        )
    # ========================================================
    # SUBMIT ALL DRAFTS FOR REVIEW
    # ========================================================
    @action(
        detail=False,
        methods=["post"],
        url_path="submit-all-review"
    )
    @transaction.atomic
    def submit_all_for_review(self, request):
        """
        Submit all draft price records created by the
        logged-in user for review.
        """
        # Find the user's draft records.
        drafts = self.get_queryset().filter(
            status=PriceRecord.STATUS_DRAFT,
            recorded_by=request.user
        )
        # Count how many records will be submitted.
        draft_count = drafts.count()
        # Stop if there are no drafts.
        if draft_count == 0:
            return Response(
                {
                    "message": "There are no draft records to submit."
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        # Change all matching drafts to Pending Review.
        affected = list(drafts)
        drafts.update(
            status=PriceRecord.STATUS_PENDING,
            flag_reason="",
            rejection_reason=""
        )
        for record in affected:
            self._log_price("submitted", record, {"status": PriceRecord.STATUS_PENDING})
        return Response(
            {
                "message": (
                    f"{draft_count} price record(s) "
                    "submitted for review."
                ),
                "submitted_count": draft_count
            },
            status=status.HTTP_200_OK
        )
    # ========================================================
    # PENDING REVIEW
    # ========================================================
    @action(
        detail=False,
        methods=["get"],
        url_path="pending"
    )
    def pending_records(self, request):
        """
        Return all records waiting for review.
        """
        # Filter records with Pending Review status.
        records = self.get_queryset().filter(
            status=PriceRecord.STATUS_PENDING
        )
        # Convert records to JSON.
        serializer = self.get_serializer(
            records,
            many=True
        )
        return Response(serializer.data)
    # ========================================================
    # PUBLISHED RECORDS
    # ========================================================
    @action(
        detail=False,
        methods=["get"],
        url_path="published"
    )
    def published_records(self, request):
        """
        Return published official fish prices.
        """
        # Get only published records.
        records = self.get_queryset().filter(
            status=PriceRecord.STATUS_PUBLISHED
        )
        serializer = self.get_serializer(
            records,
            many=True
        )
        return Response(serializer.data)
    # ========================================================
    # FLAGGED RECORDS
    # ========================================================
    @action(
        detail=False,
        methods=["get"],
        url_path="flagged"
    )
    def flagged_records(self, request):
        """
        Return all flagged price records.
        """
        # Get only flagged records.
        records = self.get_queryset().filter(
            status=PriceRecord.STATUS_FLAGGED
        )
        serializer = self.get_serializer(
            records,
            many=True
        )
        return Response(serializer.data)
    # ========================================================
    # REJECTED RECORDS
    # ========================================================
    @action(
        detail=False,
        methods=["get"],
        url_path="rejected"
    )
    def rejected_records(self, request):
        """
        Return all rejected price records.
        """
        # Get only rejected records.
        records = self.get_queryset().filter(
            status=PriceRecord.STATUS_REJECTED
        )
        serializer = self.get_serializer(
            records,
            many=True
        )
        return Response(serializer.data)
    # ========================================================
    # APPROVE PRICE
    # ========================================================
    @action(
        detail=True,
        methods=["post"],
        url_path="approve"
    )
    @transaction.atomic
    def approve_record(self, request, pk=None):
        """
        Approve a pending or flagged fish price.
        """
        # Get the selected price record.
        price_record = self.get_object()
        # Only pending or flagged records can be approved.
        if price_record.status not in [
            PriceRecord.STATUS_PENDING,
            PriceRecord.STATUS_FLAGGED,
        ]:
            return Response(
                {
                    "message": (
                        "Only pending or flagged price records "
                        "can be approved."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        # Move the record into the Approved state.
        price_record.status = PriceRecord.STATUS_APPROVED
        # Save who reviewed the record and when.
        price_record.reviewed_by = request.user
        price_record.reviewed_at = timezone.now()
        # Clear old flag/rejection information.
        price_record.flag_reason = ""
        price_record.rejection_reason = ""
        # Approval is separate from publication.
        price_record.published_by = None
        price_record.published_at = None
        # Save the updated record.
        price_record.save()
        self._log_price("approved", price_record, {"status": price_record.status})
        # Return the updated record to React.
        serializer = self.get_serializer(price_record)
        return Response(
            {
                "message": "Price record approved successfully.",
                "record": serializer.data
            },
            status=status.HTTP_200_OK
        )
    # ========================================================
    # PUBLISH PRICE
    # ========================================================
    @action(
        detail=True,
        methods=["post"],
        url_path="publish"
    )
    @transaction.atomic
    def publish_record(self, request, pk=None):
        """
        Publish a validated fish price.
        """
        # Get the selected price record.
        price_record = self.get_object()
        # Only approved records can be published.
        if price_record.status != PriceRecord.STATUS_APPROVED:
            return Response(
                {
                    "message": (
                        "Only approved price records "
                        "can be published."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        # Mark the record as published.
        price_record.status = PriceRecord.STATUS_PUBLISHED
        # Record who reviewed it.
        price_record.reviewed_by = request.user
        price_record.reviewed_at = timezone.now()
        # Record who published it.
        price_record.published_by = request.user
        price_record.published_at = timezone.now()
        # Remove previous flag/rejection information.
        price_record.flag_reason = ""
        price_record.rejection_reason = ""
        # Save the changes.
        price_record.save()
        self._log_price("published", price_record, {"status": price_record.status})
        # Return the updated record.
        serializer = self.get_serializer(price_record)
        return Response(
            {
                "message": "Price record published successfully.",
                "record": serializer.data
            },
            status=status.HTTP_200_OK
        )
    # ========================================================
    # FLAG PRICE
    # ========================================================
    @action(
        detail=True,
        methods=["post"],
        url_path="flag"
    )
    @transaction.atomic
    def flag_record(self, request, pk=None):
        """
        Flag a suspicious or unusual fish price.
        """
        # Get the selected price record.
        price_record = self.get_object()
        # Only Pending records should be reviewed.
        if price_record.status != PriceRecord.STATUS_PENDING:
            return Response(
                {
                    "message": (
                        "Only records pending review "
                        "can be flagged."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        # Get the explanation supplied by the reviewer.
        flag_reason = request.data.get(
            "flag_reason",
            ""
        ).strip()
        # Require a reason.
        if not flag_reason:
            return Response(
                {
                    "message": "A flag reason is required."
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        # Mark the record as flagged.
        price_record.status = PriceRecord.STATUS_FLAGGED
        # Store the reason.
        price_record.flag_reason = flag_reason
        # Remove any old rejection reason.
        price_record.rejection_reason = ""
        # Record who reviewed it.
        price_record.reviewed_by = request.user
        price_record.reviewed_at = timezone.now()
        # A flagged record has not been published.
        price_record.published_by = None
        price_record.published_at = None
        # Save changes.
        price_record.save()
        self._log_price("flagged", price_record, {"status": price_record.status, "reason": flag_reason})
        serializer = self.get_serializer(price_record)
        return Response(
            {
                "message": "Price record flagged successfully.",
                "record": serializer.data
            },
            status=status.HTTP_200_OK
        )
    # ========================================================
    # REJECT PRICE
    # ========================================================
    @action(
        detail=True,
        methods=["post"],
        url_path="reject"
    )
    @transaction.atomic
    def reject_record(self, request, pk=None):
        """
        Reject an invalid fish price submission.
        """
        # Get the selected price record.
        price_record = self.get_object()
        # Only Pending records can be rejected.
        if price_record.status != PriceRecord.STATUS_PENDING:
            return Response(
                {
                    "message": (
                        "Only records pending review "
                        "can be rejected."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        # Get the rejection explanation.
        rejection_reason = request.data.get(
            "rejection_reason",
            ""
        ).strip()
        # Require an explanation.
        if not rejection_reason:
            return Response(
                {
                    "message": (
                        "A rejection reason is required "
                        "when rejecting a price."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        # Mark the record as rejected.
        price_record.status = PriceRecord.STATUS_REJECTED
        # Store rejection information.
        price_record.rejection_reason = rejection_reason
        # Clear any previous flag reason.
        price_record.flag_reason = ""
        # Record who reviewed the record.
        price_record.reviewed_by = request.user
        price_record.reviewed_at = timezone.now()
        # A rejected record cannot be published.
        price_record.published_by = None
        price_record.published_at = None
        # Save changes.
        price_record.save()
        self._log_price("rejected", price_record, {"status": price_record.status, "reason": rejection_reason})
        serializer = self.get_serializer(price_record)
        return Response(
            {
                "message": "Price record rejected successfully.",
                "record": serializer.data
            },
            status=status.HTTP_200_OK
        )
# ============================================================
# MUNICIPALITY API
# ============================================================
class MunicipalityViewSet(viewsets.ModelViewSet):
    """
    CRUD API for AquaTimbang municipalities.
    """
    # Return municipalities alphabetically.
    queryset = Municipality.objects.all().order_by("name")
    # Serializer for Municipality JSON data.
    serializer_class = MunicipalitySerializer
    # Require login token.
    authentication_classes = [TokenAuthentication]
    # Logged-in users can read municipalities,
    # but only administrators can modify them.
    permission_classes = [IsAdministratorOrReadOnly]
# ============================================================
# FISH SPECIES API
# ============================================================
class FishSpeciesViewSet(viewsets.ModelViewSet):
    """Fish species CRUD with server-side, transaction-safe audit logging."""
    queryset = FishSpecies.objects.all().order_by("name")
    serializer_class = FishSpeciesSerializer
    authentication_classes = [TokenAuthentication]
    permission_classes = [CanManageFishSpecies]
    def _log(self, action, instance, details=None):
        user = self.request.user
        profile = getattr(user, "aquatimbang_profile", None)
        ActivityLog.objects.create(
            actor=user,
            actor_username=user.username,
            actor_role=profile.role.name if profile else "Unknown",
            action=action,
            target_type="FishSpecies",
            target_id=instance.pk,
            target_name=instance.name,
            details=details or {},
        )
    @transaction.atomic
    def perform_create(self, serializer):
        instance = serializer.save()
        self._log("created", instance, {
            "name": instance.name,
            "scientific_name": instance.scientific_name,
            "is_active": instance.is_active,
        })
    @transaction.atomic
    def perform_update(self, serializer):
        before = self.get_object()
        previous = {
            "name": before.name,
            "scientific_name": before.scientific_name,
            "description": before.description,
            "is_active": before.is_active,
        }
        instance = serializer.save()
        current = {
            "name": instance.name,
            "scientific_name": instance.scientific_name,
            "description": instance.description,
            "is_active": instance.is_active,
        }
        changes = {
            field: {"from": previous[field], "to": value}
            for field, value in current.items()
            if previous[field] != value
        }
        if changes:
            if "is_active" in changes:
                action = "activated" if instance.is_active else "deactivated"
            else:
                action = "updated"
            self._log(action, instance, {"changes": changes})
    @transaction.atomic
    def perform_destroy(self, instance):
        from django.db.models.deletion import ProtectedError
        from rest_framework.exceptions import ValidationError
        target_id, target_name = instance.pk, instance.name
        # The audit entry and deletion commit together; a protected
        # deletion rolls back the audit entry as well.
        self._log("deleted", instance, {"deleted_id": target_id, "deleted_name": target_name})
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError({
                "detail": (
                    "This fish species cannot be deleted because it has "
                    "existing price records. Please deactivate it instead "
                    "to preserve historical price data."
                )
            })
class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Administrators see all logs; other approved users see their own."""
    serializer_class = ActivityLogSerializer
    authentication_classes = [TokenAuthentication]
    def get_permissions(self):
        return [IsAuthenticated()]
    def get_queryset(self):
        user = self.request.user
        profile = getattr(user, "aquatimbang_profile", None)
        if (
            not user.is_active or profile is None
            or not profile.is_active or profile.account_status != "approved"
        ):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("An approved account is required.")
        role = profile.role.name.strip().lower()
        if role in ("administrator", "system administrator"):
            return ActivityLog.objects.all()
        return ActivityLog.objects.filter(actor=user)
# ============================================================
# HEALTH CHECK
# ============================================================
@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    """
    Simple endpoint used to confirm that Django is running.
    """
    # Return a basic success response.
    return Response(
        {
            "status": "success",
            "system": "AquaTimbang",
            "message": "AquaTimbang backend API is running."
        },
        status=status.HTTP_200_OK
    )
# ============================================================
# CURRENT USER PROFILE
# ============================================================
def serialize_own_profile(user, profile):
    """Profile details shown on each dashboard's profile page."""
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": profile.role.name,
        "municipality": profile.municipality.name if profile.municipality else None,
        "municipality_id": profile.municipality_id,
        "contact_number": profile.contact_number,
        "account_status": profile.account_status,
        "date_joined": user.date_joined.isoformat(),
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "verification": get_account_verification(profile),
    }
@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def my_profile(request):
    """
    Read or update the logged-in user's own profile.
    Only names, email and contact number can be changed here.
    """
    user = request.user
    profile = getattr(user, "aquatimbang_profile", None)
    if profile is None or not profile.is_active:
        return Response(
            {"message": "An active AquaTimbang account is required."},
            status=status.HTTP_403_FORBIDDEN,
        )
    if request.method == "PATCH":
        errors = {}
        for field in ("first_name", "last_name", "email", "contact_number"):
            value = request.data.get(field)
            if value is None:
                continue
            if not isinstance(value, str):
                errors[field] = "Must be text."
                continue
            value = value.strip()
            if field in ("first_name", "email") and not value:
                errors[field] = "This field is required."
            elif field == "email":
                from django.core.validators import validate_email
                from django.core.exceptions import ValidationError as DjangoValidationError
                try:
                    validate_email(value)
                except DjangoValidationError:
                    errors[field] = "Enter a valid email address."
                    continue
                if User.objects.filter(email__iexact=value).exclude(pk=user.pk).exists():
                    errors[field] = "This email address is already registered."
                    continue
                user.email = value
            elif field == "contact_number":
                if len(value) > 20:
                    errors[field] = "Must be at most 20 characters."
                    continue
                profile.contact_number = value
            else:
                if len(value) > 150:
                    errors[field] = "Must be at most 150 characters."
                    continue
                setattr(user, field, value)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        user.save(update_fields=["first_name", "last_name", "email"])
        profile.save(update_fields=["contact_number", "updated_at"])
    return Response(serialize_own_profile(user, profile), status=status.HTTP_200_OK)
# ============================================================
# LGU OFFICER - FISHERFOLK (FISH VENDOR) ACCOUNTS
# ============================================================
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_fisherfolk(request):
    """
    Return Fish Vendor accounts with their suggestion activity.
    LGU Officers see vendors in their own municipality;
    Administrators see every vendor.
    """
    from django.db.models import Count, Max
    profile = getattr(request.user, "aquatimbang_profile", None)
    role = profile.role.name if profile else ""
    if (
        profile is None
        or not profile.is_active
        or profile.account_status != UserProfile.STATUS_APPROVED
        or role not in ("LGU Officer", "Administrator")
    ):
        return Response(
            {"message": "LGU Officer or Administrator access required."},
            status=status.HTTP_403_FORBIDDEN,
        )
    vendors = (
        UserProfile.objects.filter(role__name="Fish Vendor")
        .select_related("user", "municipality", "vendor_verification")
        .annotate(
            suggestion_count=Count("user__fish_price_suggestions"),
            last_submission=Max("user__fish_price_suggestions__created_at"),
        )
        .order_by("user__first_name", "user__last_name", "user__username")
    )
    if role == "LGU Officer":
        vendors = vendors.filter(municipality_id=profile.municipality_id)
    results = []
    for vendor in vendors:
        verification = getattr(vendor, "vendor_verification", None)
        results.append({
            "id": vendor.user.id,
            "username": vendor.user.username,
            "name": vendor.user.get_full_name() or vendor.user.username,
            "municipality": vendor.municipality.name if vendor.municipality else None,
            "account_status": vendor.account_status,
            "is_active": vendor.is_active,
            "date_joined": vendor.user.date_joined.isoformat(),
            "last_login": vendor.user.last_login.isoformat() if vendor.user.last_login else None,
            "market_name": verification.market_name if verification else "",
            "stall_number": verification.stall_number if verification else "",
            "suggestion_count": vendor.suggestion_count,
            "last_submission": vendor.last_submission.isoformat() if vendor.last_submission else None,
        })
    return Response(results, status=status.HTTP_200_OK)
# ============================================================
# PUBLIC SUMMARY (LANDING PAGE)
# ============================================================
@api_view(["GET"])
@permission_classes([AllowAny])
def public_summary(request):
    """
    Return live counts shown on the public landing page.
    """
    latest = (
        PriceRecord.objects.filter(status=PriceRecord.STATUS_PUBLISHED)
        .order_by("-recorded_date")
        .values_list("recorded_date", flat=True)
        .first()
    )
    # Two most recent published prices, with the change from a week earlier.
    featured = []
    if latest:
        from datetime import timedelta
        published = PriceRecord.objects.filter(status=PriceRecord.STATUS_PUBLISHED)
        for record in (
            published.filter(recorded_date=latest)
            .select_related("fish_species", "municipality")
            .order_by("fish_species__name", "municipality__name")[:2]
        ):
            week_ago = (
                published.filter(
                    fish_species_id=record.fish_species_id,
                    municipality_id=record.municipality_id,
                    recorded_date__lte=record.recorded_date - timedelta(days=7),
                )
                .order_by("-recorded_date", "-id")
                .first()
            )
            change = None
            if week_ago and week_ago.price_per_kg:
                change = round(
                    float((record.price_per_kg - week_ago.price_per_kg) / week_ago.price_per_kg * 100), 1
                )
            featured.append({
                "fish_name": record.fish_species.name,
                "municipality_name": record.municipality.name,
                "price_per_kg": record.price_per_kg,
                "recorded_date": record.recorded_date,
                "weekly_change_percent": change,
            })
    return Response(
        {
            "featured_prices": featured,
            "species_count": FishSpecies.objects.filter(is_active=True).count(),
            "municipality_count": Municipality.objects.filter(is_active=True).count(),
            "published_price_count": PriceRecord.objects.filter(
                status=PriceRecord.STATUS_PUBLISHED
            ).count(),
            "latest_published_date": latest,
        },
        status=status.HTTP_200_OK,
    )
# ============================================================
# ADMINISTRATOR - APPROVE USER ACCOUNT
# ============================================================
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def approve_user(request, user_id):
    """Approve a pending AquaTimbang registration."""
    admin_profile = getattr(
        request.user, "aquatimbang_profile", None
    )
    if (
        admin_profile is None
        or not request.user.is_active
        or not admin_profile.is_active
        or admin_profile.role.name != "Administrator"
    ):
        return Response(
            {"message": "Administrator access required."},
            status=status.HTTP_403_FORBIDDEN,
        )
    try:
        user = User.objects.select_for_update().get(id=user_id)
        profile = UserProfile.objects.select_for_update().get(user=user)
    except (User.DoesNotExist, UserProfile.DoesNotExist):
        return Response(
            {"message": "Account not found."},
            status=status.HTTP_404_NOT_FOUND,
        )
    if profile.account_status != "pending":
        return Response(
            {"message": "Only pending registrations can be approved."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # Require explicit confirmation from the Administrator.
    if request.data.get("verification_confirmed") is not True:
        return Response(
            {"message": "Please confirm that you reviewed the registration details and supporting documents."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # Do not allow an existing inactive Administrator
    # to be approved through the public registration workflow.
    if profile.role.name == "Administrator":
        return Response(
            {"message": "Administrator accounts cannot be approved through this workflow."},
            status=status.HTTP_403_FORBIDDEN,
        )
    from django.utils import timezone
    profile.account_status = "approved"
    profile.is_active = True
    profile.reviewed_by = request.user
    profile.reviewed_at = timezone.now()
    profile.rejection_reason = ""
    profile.save(update_fields=[
        "account_status",
        "is_active",
        "reviewed_by",
        "reviewed_at",
        "rejection_reason",
        "updated_at",
    ])
    # Also activate Django's built-in account if needed.
    if not user.is_active:
        user.is_active = True
        user.save(update_fields=["is_active"])
    ActivityLog.objects.create(
        actor=request.user,
        actor_username=request.user.username,
        actor_role=admin_profile.role.name,
        action="approved",
        target_type="UserAccount",
        target_id=user.id,
        target_name=user.username,
        details={
            "role": profile.role.name,
            "changes": {
                "account_status": {"from": "pending", "to": "approved"},
                "is_active": {"from": False, "to": True},
            },
        },
    )
    return Response(
        {
            "message": "Account approved successfully.",
            "user_id": user.id,
            "username": user.username,
            "account_status": profile.account_status,
            "is_active": profile.is_active,
            "reviewed_at": profile.reviewed_at.isoformat(),
        },
        status=status.HTTP_200_OK,
    )
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def reject_user(request, user_id):
    """Reject a pending registration with a required reason."""
    admin_profile = getattr(
        request.user, "aquatimbang_profile", None
    )
    if (
        admin_profile is None
        or not request.user.is_active
        or not admin_profile.is_active
        or admin_profile.role.name != "Administrator"
    ):
        return Response(
            {"message": "Administrator access required."},
            status=status.HTTP_403_FORBIDDEN,
        )
    reason = request.data.get("reason", "")
    if not isinstance(reason, str) or not reason.strip():
        return Response(
            {"message": "A rejection reason is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    reason = reason.strip()
    if len(reason) > 2000:
        return Response(
            {"message": "Rejection reason must not exceed 2000 characters."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        user = User.objects.select_for_update().get(id=user_id)
        profile = UserProfile.objects.select_for_update().get(user=user)
    except (User.DoesNotExist, UserProfile.DoesNotExist):
        return Response(
            {"message": "Account not found."},
            status=status.HTTP_404_NOT_FOUND,
        )
    if profile.account_status != "pending":
        return Response(
            {"message": "Only pending registrations can be rejected."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if profile.role.name == "Administrator":
        return Response(
            {"message": "Administrator accounts cannot be rejected through this workflow."},
            status=status.HTTP_403_FORBIDDEN,
        )
    from django.utils import timezone
    profile.account_status = "rejected"
    profile.is_active = False
    profile.reviewed_by = request.user
    profile.reviewed_at = timezone.now()
    profile.rejection_reason = reason
    profile.save(update_fields=[
        "account_status",
        "is_active",
        "reviewed_by",
        "reviewed_at",
        "rejection_reason",
        "updated_at",
    ])
    # Disable Django authentication for the rejected account.
    if user.is_active:
        user.is_active = False
        user.save(update_fields=["is_active"])
    ActivityLog.objects.create(
        actor=request.user,
        actor_username=request.user.username,
        actor_role=admin_profile.role.name,
        action="rejected",
        target_type="UserAccount",
        target_id=user.id,
        target_name=user.username,
        details={
            "role": profile.role.name,
            "reason": reason,
            "changes": {
                "account_status": {"from": "pending", "to": "rejected"},
                "is_active": {"from": False, "to": False},
            },
        },
    )
    return Response(
        {
            "message": "Registration rejected successfully.",
            "user_id": user.id,
            "username": user.username,
            "account_status": profile.account_status,
            "rejection_reason": profile.rejection_reason,
            "reviewed_at": profile.reviewed_at.isoformat(),
        },
        status=status.HTTP_200_OK,
    )
# ============================================================
# ADMINISTRATOR - VIEW PENDING REGISTRATIONS
# ============================================================
def get_account_verification(profile):
    """
    Return role-specific verification information.
    Never expose direct uploaded-file URLs.
    Administrators access documents through
    the protected verification endpoint.
    """
    verification = {
        "type": None,
        "details": {},
        "documents": {},
    }
    if profile.role.name == "Fish Vendor":
        vendor = FishVendorVerification.objects.filter(
            profile=profile
        ).first()
        if vendor:
            verification["type"] = "Fish Vendor"
            verification["details"] = {
                "market_name": vendor.market_name,
                "stall_number": vendor.stall_number,
                "permit_number": vendor.permit_number,
            }
            verification["documents"] = {
                "permit": bool(vendor.permit_document),
                "stall_photo": bool(vendor.stall_photo),
            }
    elif profile.role.name == "LGU Officer":
        officer = LGUOfficerVerification.objects.filter(
            profile=profile
        ).first()
        if officer:
            verification["type"] = "LGU Officer"
            verification["details"] = {
                "department": officer.department,
                "position": officer.position,
                "official_email": officer.official_email,
                "employee_id": officer.employee_id,
            }
            verification["documents"] = {
                "authorization": bool(
                    officer.authorization_document
                ),
            }
    return verification
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def pending_registrations(request):
    """
    Return accounts awaiting Administrator approval.
    Only active AquaTimbang Administrators can access
    this information.
    """
    # Retrieve the logged-in user's AquaTimbang profile.
    admin_profile = getattr(
        request.user,
        "aquatimbang_profile",
        None
    )
    # Verify Administrator permissions.
    if (
        admin_profile is None
        or not request.user.is_active
        or not admin_profile.is_active
        or admin_profile.role.name != "Administrator"
    ):
        return Response(
            {"message": "Administrator access required."},
            status=status.HTTP_403_FORBIDDEN
        )
    # Retrieve all inactive AquaTimbang profiles.
    pending_profiles = UserProfile.objects.filter(
    account_status="pending",
    is_active=False,
    ).select_related(
        "user",
        "role",
        "municipality"
    ).order_by("created_at")
    # Prepare account information for the frontend.
    accounts = []
    for profile in pending_profiles:
        accounts.append({
            "id": profile.user.id,
            "username": profile.user.username,
            "first_name": profile.user.first_name,
            "last_name": profile.user.last_name,
            "email": profile.user.email,
            "role": profile.role.name,
            "municipality": (
                profile.municipality.name
                if profile.municipality
                else None
            ),
            "contact_number": profile.contact_number,
            "registered_at": profile.created_at,
            "is_active": profile.is_active,
            "verification": get_account_verification(profile),
        })
    return Response(
        {
            "count": len(accounts),
            "results": accounts
        },
        status=status.HTTP_200_OK
    )
# ============================================================
# PUBLIC REGISTRATION OPTIONS
# ============================================================
@api_view(["GET"])
@permission_classes([AllowAny])
def registration_options(request):
    """
    Return roles and municipalities available for registration.
    """
    allowed_roles = Role.objects.filter(
        name__in=["Fish Vendor", "LGU Officer"]
    ).order_by("name")
    municipalities = Municipality.objects.filter(
        is_active=True
    ).order_by("name")
    return Response({
        "roles": [
            {
                "id": role.id,
                "name": role.name
            }
            for role in allowed_roles
        ],
        "municipalities": [
            {
                "id": municipality.id,
                "name": municipality.name
            }
            for municipality in municipalities
        ]
    })
# ============================================================
# ADMINISTRATOR - LIST REGISTERED USERS
# ============================================================
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_users(request):
    """
    Return registered AquaTimbang users.
    Only active Administrators can access this endpoint.
    """
    # Verify Administrator permissions.
    admin_profile = getattr(
        request.user,
        "aquatimbang_profile",
        None
    )
    if (
        admin_profile is None
        or not request.user.is_active
        or not admin_profile.is_active
        or admin_profile.role.name != "Administrator"
    ):
        return Response(
            {"message": "Administrator access required."},
            status=status.HTTP_403_FORBIDDEN
        )
    # Retrieve registered accounts and their profiles.
    profiles = UserProfile.objects.select_related(
        "user",
        "role",
        "municipality"
    ).order_by("-user__date_joined")
    users = []
    for profile in profiles:
        users.append({
            "id": profile.user.id,
            "first_name": profile.user.first_name,
            "last_name": profile.user.last_name,
            "username": profile.user.username,
            "email": profile.user.email,
            "role": profile.role.name,
            "municipality": (
                profile.municipality.name
                if profile.municipality
                else ""
            ),
            "contact_number": profile.contact_number,
            "is_active": profile.is_active,
            "account_status": profile.account_status,
            "reviewed_at": (
            profile.reviewed_at.isoformat()
            if profile.reviewed_at
            else None
            ),
            "reviewed_by": (
                profile.reviewed_by.username
                if profile.reviewed_by
                else None
            ),
            "rejection_reason": profile.rejection_reason,
            "date_joined": profile.user.date_joined.isoformat(),
            "registered_at": profile.created_at,
            "last_login": (
                profile.user.last_login.isoformat()
                if profile.user.last_login
                else None
            ),
            "verification": get_account_verification(profile),
        })
    return Response(
        users,
        status=status.HTTP_200_OK
    )
# ============================================================
# PROTECTED VERIFICATION DOCUMENT ACCESS
# ============================================================
@api_view(["GET"])
@permission_classes([IsAquaTimbangAdministrator])
def view_verification_document(request, user_id, document_type):
    """
    Allow active AquaTimbang Administrators to view
    registration verification documents.
    """
    # Supported document types and their corresponding models.
    document_fields = {
        "vendor-permit": (
            FishVendorVerification,
            "permit_document",
        ),
        "vendor-stall": (
            FishVendorVerification,
            "stall_photo",
        ),
        "lgu-authorization": (
            LGUOfficerVerification,
            "authorization_document",
        ),
    } 
    # Reject unsupported document types.
    if document_type not in document_fields:
        raise Http404("Document type not found.")
    model, field_name = document_fields[document_type]
    # Find the verification record belonging to the user.
    try:
        verification = model.objects.get(
            profile__user_id=user_id
        )
    except model.DoesNotExist:
        raise Http404("Verification record not found.")
    document = getattr(verification, field_name)
    # Reject missing documents.
    if not document:
        raise Http404("No document was uploaded.")
    # Open the document using Django's configured storage.
    try:
        document.open("rb")
    except (FileNotFoundError, OSError):
        raise Http404("Document file not found.")
    # Return the document without exposing a public media URL.
    return FileResponse(
        document,
        as_attachment=False,
        filename=document.name.split("/")[-1],
    )

    from .models import VendorPriceSuggestion
from .serializers import VendorPriceSuggestionSerializer
from rest_framework.exceptions import PermissionDenied
from .models import VendorPriceSuggestion

class VendorPriceSuggestionViewSet(viewsets.ModelViewSet):
    serializer_class = VendorPriceSuggestionSerializer
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_role(self):
        user = self.request.user
        profile = getattr(user, "aquatimbang_profile", None)

        if (
            not user.is_active
            or profile is None
            or not profile.is_active
            or profile.account_status != "approved"
        ):
            raise PermissionDenied("An approved account is required.")

        return profile.role.name

    def get_queryset(self):
        role = self.get_role()

        queryset = VendorPriceSuggestion.objects.select_related(
            "vendor",
            "fish_species",
            "municipality",
            "reviewed_by",
        )

        if role == "Fish Vendor":
            return queryset.filter(vendor=self.request.user)

        if role in ("LGU Officer", "Administrator"):
            return queryset.all()

        raise PermissionDenied("You cannot access suggestions.")

    @transaction.atomic
    def perform_create(self, serializer):
        if self.get_role() != "Fish Vendor":
            raise PermissionDenied(
                "Only Fish Vendors can submit suggested prices."
            )

        profile = self.request.user.aquatimbang_profile
        municipality = profile.municipality

        if municipality is None:
            raise PermissionDenied(
                "Your account has no assigned municipality."
            )

        if not municipality.is_active:
            raise PermissionDenied(
                "Your assigned municipality is inactive."
            )

        suggestion = serializer.save(
            vendor=self.request.user,
            municipality=municipality,
        )

        ActivityLog.objects.create(
            actor=self.request.user,
            actor_username=self.request.user.username,
            actor_role="Fish Vendor",
            action="submitted",
            target_type="VendorPriceSuggestion",
            target_id=suggestion.pk,
            target_name=suggestion.fish_species.name,
            details={
                "suggested_price": str(suggestion.suggested_price),
                "municipality": municipality.name,
            },
        )

    @action(detail=False, methods=["get"], url_path="community-average")
    def community_average(self, request):
        """Aggregate LGU-reviewed vendor suggestions without exposing vendor identities."""
        self.get_role()  # Require an approved AquaTimbang account.
        from django.db.models import Avg, Count
        rows = (
            VendorPriceSuggestion.objects
            .filter(status__in=["reviewed", "adopted"], suggested_price__gt=0)
            .values("municipality_id", "municipality__name", "fish_species_id", "fish_species__name")
            .annotate(average_price=Avg("suggested_price"), submission_count=Count("id"))
            .order_by("municipality__name", "fish_species__name")
        )
        return Response([
            {
                "municipality_id": row["municipality_id"],
                "municipality_name": row["municipality__name"],
                "fish_species": row["fish_species_id"],
                "fish_name": row["fish_species__name"],
                "average_price": round(row["average_price"], 2),
                "submission_count": row["submission_count"],
            }
            for row in rows
        ])

    @action(detail=True, methods=["post"], url_path="review")
    @transaction.atomic
    def review_suggestion(self, request, pk=None):
        if self.get_role() not in ("LGU Officer", "Administrator"):
            raise PermissionDenied(
                "Only LGU Officers and Administrators can review suggestions."
            )

        suggestion = self.get_object()

        if suggestion.status != VendorPriceSuggestion.STATUS_PENDING:
            return Response(
                {"message": "Only pending suggestions can be reviewed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        decision = request.data.get("status")
        feedback = request.data.get("lgu_feedback", "")

        if decision not in ("reviewed", "adopted", "rejected"):
            return Response(
                {"message": "Invalid review status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(feedback, str):
            return Response(
                {"message": "Feedback must be text."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if decision == "rejected" and not feedback.strip():
            return Response(
                {"message": "Feedback is required when rejecting."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        suggestion.status = decision
        suggestion.lgu_feedback = feedback.strip()
        suggestion.reviewed_by = request.user
        suggestion.reviewed_at = timezone.now()
        suggestion.save()

        ActivityLog.objects.create(
            actor=request.user,
            actor_username=request.user.username,
            actor_role=self.get_role(),
            action=decision,
            target_type="VendorPriceSuggestion",
            target_id=suggestion.pk,
            target_name=suggestion.fish_species.name,
            details={
                "vendor": suggestion.vendor.username,
                "suggested_price": str(suggestion.suggested_price),
                "feedback": suggestion.lgu_feedback,
            },
        )

        return Response(self.get_serializer(suggestion).data)
