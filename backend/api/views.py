# ============================================================
# AQUATIMBANG API VIEWS
# ============================================================
# Django authentication function.
from django.http import FileResponse, Http404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from .models import FishVendorVerification, LGUOfficerVerification
from django.contrib.auth import authenticate
# Django's built-in user model.
from django.contrib.auth.models import User
# Database transaction support.
from django.db import transaction
# Used for saving review and publishing timestamps.
from django.utils import timezone
# Django REST Framework tools.
from rest_framework import status, viewsets
from .authentication import ExpiringTokenAuthentication
from .models import PriceCorrection
from .serializers import check_price_bounds
from decimal import Decimal, InvalidOperation
from rest_framework import serializers
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
    # UC-1 3d: a locked username cannot log in, even with the right password.
    lock = login_lock(username)
    if lock is not None:
        return lock
    # Authenticate using Django.
    user = authenticate(
        username=username,
        password=password,
    )
    if user is None:
        # Django refuses inactive accounts; explain why when the password is right.
        candidate = User.objects.filter(username=username).select_related("aquatimbang_profile").first()
        if candidate is not None and not candidate.is_active and candidate.check_password(password):
            candidate_profile = getattr(candidate, "aquatimbang_profile", None)
            if candidate_profile is not None and candidate_profile.account_status == UserProfile.STATUS_REJECTED:
                message = "Your registration was rejected. Contact your LGU office."
            else:
                message = "Account disabled. Contact administrator."
            return Response({"message": message}, status=status.HTTP_403_FORBIDDEN)
        locked = record_failed_login(username)
        if locked is not None:
            return locked
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
    # Reject accounts that are not approved and active (UC-1 3b, 3c, E2).
    if not user.is_active or not profile.is_active:
        if profile.account_status == UserProfile.STATUS_PENDING:
            message = "Your account is pending approval. Please wait for LGU confirmation."
        elif profile.account_status == UserProfile.STATUS_REJECTED:
            message = "Your registration was rejected. Contact your LGU office."
        else:
            message = "Account disabled. Contact administrator."
        return Response({"message": message}, status=status.HTTP_403_FORBIDDEN)
    # Record the login time (token logins do not do this automatically).
    from django.contrib.auth.models import update_last_login
    update_last_login(None, user)
    LoginLockout.objects.filter(username=username.lower()).delete()
    # Create or retrieve the authentication token; the session starts now.
    token, _ = Token.objects.get_or_create(user=user)
    TokenActivity.objects.update_or_create(token=token, defaults={"last_seen": timezone.now()})
    log_activity(user, "logged in", "Authentication", user.pk, user.username)
    return Response(
        {
            "message": "Login successful.",
            "token": token.key,
            "session_idle_minutes": settings.SESSION_IDLE_MINUTES,
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
    ).prefetch_related("corrections__corrected_by").all()
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
    authentication_classes = [ExpiringTokenAuthentication]
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

    # --------------------------------------------------------
    # CORRECT A PUBLISHED PRICE (keeps the original — Table 19)
    # --------------------------------------------------------
    @action(detail=True, methods=["post"], url_path="correct")
    @transaction.atomic
    def correct_price(self, request, pk=None):
        """
        Change a published price with a required reason. The previous and
        new price are kept in the correction history.
        """
        if approved_role(request.user) not in ("LGU Officer", "Administrator"):
            raise PermissionDenied("Only LGU Officers and Administrators can correct prices.")
        record = self.get_object()
        if record.status != PriceRecord.STATUS_PUBLISHED:
            return Response(
                {"message": "Only published prices are corrected. Edit unpublished prices directly."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = request.data.get("reason")
        if not isinstance(reason, str) or not reason.strip():
            return Response({"reason": "Give a reason for the correction."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            new_price = Decimal(str(request.data.get("price_per_kg"))).quantize(Decimal("0.01"))
        except (InvalidOperation, ValueError, TypeError):
            return Response({"price_per_kg": "Enter a valid price."}, status=status.HTTP_400_BAD_REQUEST)
        if new_price <= 0:
            return Response({"price_per_kg": "Price per kilogram must be greater than zero."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            check_price_bounds(new_price)
        except serializers.ValidationError as error:
            return Response({"price_per_kg": error.detail[0]}, status=status.HTTP_400_BAD_REQUEST)
        if new_price == record.price_per_kg:
            return Response({"price_per_kg": "The new price is the same as the current one."}, status=status.HTTP_400_BAD_REQUEST)

        previous = record.price_per_kg
        PriceCorrection.objects.create(
            price_record=record,
            previous_price=previous,
            new_price=new_price,
            reason=reason.strip(),
            corrected_by=request.user,
        )
        record.price_per_kg = new_price
        record.is_correction = True
        record.save(update_fields=["price_per_kg", "is_correction", "updated_at"])
        self._log_price("corrected", record, {
            "changes": {"price_per_kg": {"from": str(previous), "to": str(new_price)}},
            "reason": reason.strip(),
        })
        record = self.get_queryset().get(pk=record.pk)
        return Response(
            {"message": "Price corrected. The original price is kept in the history.", "record": self.get_serializer(record).data},
            status=status.HTTP_200_OK,
        )

    @transaction.atomic
    def perform_update(self, serializer):
        record = serializer.instance
        # Published prices keep an audit trail: use the "correct" action.
        if record.status == PriceRecord.STATUS_PUBLISHED:
            raise PermissionDenied("Published prices cannot be edited. Use Correct Price and give a reason.")
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
        if instance.status == PriceRecord.STATUS_PUBLISHED:
            raise PermissionDenied("Published prices cannot be deleted. Correct the price instead so the history is kept.")
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
    authentication_classes = [ExpiringTokenAuthentication]
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
    authentication_classes = [ExpiringTokenAuthentication]
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
    authentication_classes = [ExpiringTokenAuthentication]
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
    # Administrators and LGU Officers can review registrations.
    admin_profile = getattr(
        request.user, "aquatimbang_profile", None
    )
    if approved_role(request.user) not in ("Administrator", "LGU Officer"):
        return Response(
            {"message": "Administrator or LGU Officer access required."},
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
    denied = registration_review_denied(admin_profile, profile)
    if denied:
        return Response({"message": denied}, status=status.HTTP_403_FORBIDDEN)
    # UC-7 3.1: an account needs a municipality before it can be approved.
    if profile.municipality_id is None:
        return Response(
            {"message": "User missing required fields (no municipality assigned). Assign a municipality before approving."},
            status=status.HTTP_400_BAD_REQUEST,
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
    # Administrators and LGU Officers can review registrations.
    admin_profile = getattr(
        request.user, "aquatimbang_profile", None
    )
    if approved_role(request.user) not in ("Administrator", "LGU Officer"):
        return Response(
            {"message": "Administrator or LGU Officer access required."},
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
    denied = registration_review_denied(admin_profile, profile)
    if denied:
        return Response({"message": denied}, status=status.HTTP_403_FORBIDDEN)
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
    Return accounts awaiting approval. Administrators see every pending
    account; LGU Officers see Fish Vendors in their own municipality.
    """
    reviewer_role = approved_role(request.user)
    if reviewer_role not in ("Administrator", "LGU Officer"):
        return Response(
            {"message": "Administrator or LGU Officer access required."},
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
    if reviewer_role == "LGU Officer":
        pending_profiles = pending_profiles.filter(
            role__name="Fish Vendor",
            municipality_id=request.user.aquatimbang_profile.municipality_id,
        )
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
# ============================================================
# PROTECTED VERIFICATION DOCUMENT ACCESS
# ============================================================
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def view_verification_document(request, user_id, document_type):
    """
    Allow Administrators, and LGU Officers reviewing Fish Vendors in
    their municipality, to view registration verification documents.
    """
    reviewer_role = approved_role(request.user)
    if reviewer_role == "LGU Officer":
        target = UserProfile.objects.filter(user_id=user_id).select_related("role").first()
        if (
            target is None
            or target.role.name != "Fish Vendor"
            or target.municipality_id != request.user.aquatimbang_profile.municipality_id
        ):
            raise Http404("Verification record not found.")
    elif reviewer_role != "Administrator":
        return Response({"message": "Administrator access required."}, status=status.HTTP_403_FORBIDDEN)
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
    authentication_classes = [ExpiringTokenAuthentication]
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


# ============================================================
# PREDICTIVE ANALYTICS (SARIMAX) — EXTERNAL FACTORS AND FORECASTS
# ============================================================
from .forecasting import NotEnoughData, data_signature, daily_series, generate_forecast
from .models import ExternalFactor, ForecastRun, Prediction
from .serializers import ExternalFactorSerializer, ForecastRunSerializer

# Longest forecast a user can request, in days.
MAX_FORECAST_HORIZON = 30
# Days of price history returned with a forecast for the chart.
FORECAST_HISTORY_DAYS = 60


def approved_role(user):
    """Role name of an approved, active account, otherwise None."""
    profile = getattr(user, "aquatimbang_profile", None)
    if (
        not user.is_active
        or profile is None
        or not profile.is_active
        or profile.account_status != UserProfile.STATUS_APPROVED
    ):
        return None
    return profile.role.name


def log_activity(user, action, target_type, target_id, target_name, details=None):
    ActivityLog.objects.create(
        actor=user,
        actor_username=user.username,
        actor_role=approved_role(user) or "Unknown",
        action=action,
        target_type=target_type,
        target_id=target_id,
        target_name=target_name,
        details=details or {},
    )


class ExternalFactorViewSet(viewsets.ModelViewSet):
    """
    Daily fuel price, weather and holiday records.
    Every approved user can read them; LGU Officers and Administrators
    can add, edit and delete them.
    """

    serializer_class = ExternalFactorSerializer
    authentication_classes = [ExpiringTokenAuthentication]
    permission_classes = [IsAuthenticated]
    queryset = ExternalFactor.objects.select_related("recorded_by").all()

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        role = approved_role(request.user)
        if role is None:
            raise PermissionDenied("An approved account is required.")
        if request.method not in ("GET", "HEAD", "OPTIONS") and role not in ("LGU Officer", "Administrator"):
            raise PermissionDenied("Only LGU Officers and Administrators can change external factors.")

    def get_queryset(self):
        queryset = super().get_queryset()
        start = self.request.query_params.get("from")
        end = self.request.query_params.get("to")
        if start:
            queryset = queryset.filter(date__gte=start)
        if end:
            queryset = queryset.filter(date__lte=end)
        return queryset

    def _details(self, factor):
        return {
            "fuel_price": str(factor.fuel_price) if factor.fuel_price is not None else None,
            "weather": factor.get_weather_display(),
            "is_holiday": factor.is_holiday,
        }

    @transaction.atomic
    def perform_create(self, serializer):
        factor = serializer.save(recorded_by=self.request.user)
        log_activity(self.request.user, "created", "ExternalFactor", factor.pk, str(factor.date), self._details(factor))

    @transaction.atomic
    def perform_update(self, serializer):
        factor = serializer.save()
        log_activity(self.request.user, "updated", "ExternalFactor", factor.pk, str(factor.date), self._details(factor))

    @transaction.atomic
    def perform_destroy(self, instance):
        log_activity(self.request.user, "deleted", "ExternalFactor", instance.pk, str(instance.date), self._details(instance))
        instance.delete()


def forecast_response(run, species_id, municipality_id, cached):
    series, _ = daily_series(species_id, municipality_id)
    history = [
        {"date": day.date(), "price": round(float(price), 2)}
        for day, price in series.tail(FORECAST_HISTORY_DAYS).items()
    ]
    data = ForecastRunSerializer(run).data
    data["history"] = history
    data["confidence_level"] = 95
    data["cached"] = cached
    return data


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def price_forecast(request):
    """
    Forecast prices for ?species=<id>[&municipality=<id>][&horizon=<days>].
    A saved forecast is reused until new prices or external factors are
    recorded.
    """
    if approved_role(request.user) is None:
        return Response({"message": "An approved account is required."}, status=status.HTTP_403_FORBIDDEN)

    try:
        species = FishSpecies.objects.get(pk=int(request.query_params.get("species", "")))
    except (ValueError, FishSpecies.DoesNotExist):
        return Response({"message": "Choose a valid fish species."}, status=status.HTTP_400_BAD_REQUEST)

    municipality = None
    if request.query_params.get("municipality"):
        try:
            municipality = Municipality.objects.get(pk=int(request.query_params["municipality"]))
        except (ValueError, Municipality.DoesNotExist):
            return Response({"message": "Choose a valid municipality."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        horizon = int(request.query_params.get("horizon", 7))
    except ValueError:
        horizon = 0
    if not 1 <= horizon <= MAX_FORECAST_HORIZON:
        return Response(
            {"message": f"Forecast period must be between 1 and {MAX_FORECAST_HORIZON} days."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    municipality_id = municipality.pk if municipality else None
    signature = data_signature(species.pk, municipality_id)
    run = (
        ForecastRun.objects.filter(
            fish_species=species,
            municipality=municipality,
            horizon_days=horizon,
            data_signature=signature,
        )
        .select_related("fish_species", "municipality", "created_by")
        .prefetch_related("predictions")
        .first()
    )
    if run:
        return Response(forecast_response(run, species.pk, municipality_id, cached=True))

    try:
        result = generate_forecast(species.pk, municipality_id, horizon)
    except NotEnoughData as error:
        return Response({"message": str(error), "not_enough_data": True}, status=status.HTTP_200_OK)

    with transaction.atomic():
        run = ForecastRun.objects.create(
            fish_species=species,
            municipality=municipality,
            horizon_days=horizon,
            model_type=result["model_type"],
            model_used=result["model_used"],
            exogenous=result["exogenous"],
            coefficients=result["coefficients"],
            mape=result["mape"],
            rmse=result["rmse"],
            holdout_days=result["holdout_days"],
            training_start=result["training_start"],
            training_end=result["training_end"],
            observations=result["observations"],
            warnings=result["warnings"],
            data_signature=signature,
            created_by=request.user,
        )
        Prediction.objects.bulk_create([
            Prediction(
                run=run,
                fish_species=species,
                municipality=municipality,
                forecast_date=point["date"],
                forecast_price=round(point["price"], 2),
                lower_bound=round(point["lower"], 2),
                upper_bound=round(point["upper"], 2),
                model_used=result["model_used"],
            )
            for point in result["forecast"]
        ])
        log_activity(
            request.user, "generated", "ForecastRun", run.pk, species.name,
            {"model": run.model_used, "days": horizon, "municipality": municipality.name if municipality else "All"},
        )

    run = ForecastRun.objects.prefetch_related("predictions").select_related(
        "fish_species", "municipality", "created_by"
    ).get(pk=run.pk)
    return Response(forecast_response(run, species.pk, municipality_id, cached=False))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def forecast_history(request):
    """The 30 most recently generated forecasts."""
    if approved_role(request.user) is None:
        return Response({"message": "An approved account is required."}, status=status.HTTP_403_FORBIDDEN)
    runs = (
        ForecastRun.objects.select_related("fish_species", "municipality", "created_by")
        .prefetch_related("predictions")[:30]
    )
    return Response(ForecastRunSerializer(runs, many=True).data)


# ============================================================
# USER MANAGEMENT (UC-7) — CREATE, EDIT, ROLES, STATUS, PASSWORDS
# ============================================================
import secrets

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models.deletion import ProtectedError

ROLE_NAMES = ("Administrator", "LGU Officer", "Fish Vendor")


def registration_review_denied(reviewer_profile, target_profile):
    """
    Reason the reviewer may not approve/reject this registration, or None.
    Administrators review every non-administrator account; LGU Officers
    review Fish Vendors in their own municipality (UC-1).
    """
    if target_profile.role.name == "Administrator":
        return "Administrator accounts cannot be approved or rejected through this workflow."
    if reviewer_profile.role.name == "Administrator":
        return None
    if target_profile.role.name != "Fish Vendor":
        return "LGU Officers can only review Fish Vendor registrations."
    if target_profile.municipality_id != reviewer_profile.municipality_id:
        return "You can only review Fish Vendors registered in your municipality."
    return None


def user_row(profile):
    """One account as shown in the Administrator's user list."""
    user = profile.user
    return {
        "id": user.id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "username": user.username,
        "email": user.email,
        "role": profile.role.name,
        "municipality": profile.municipality.name if profile.municipality else "",
        "municipality_id": profile.municipality_id,
        "contact_number": profile.contact_number,
        "is_active": profile.is_active and user.is_active,
        "account_status": profile.account_status,
        "reviewed_at": profile.reviewed_at.isoformat() if profile.reviewed_at else None,
        "reviewed_by": profile.reviewed_by.username if profile.reviewed_by else None,
        "rejection_reason": profile.rejection_reason,
        "date_joined": user.date_joined.isoformat(),
        "registered_at": profile.created_at,
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "verification": get_account_verification(profile),
    }


def require_admin(request):
    """Response refusing non-administrators, or None for an administrator."""
    if approved_role(request.user) != "Administrator":
        return Response({"message": "Administrator access required."}, status=status.HTTP_403_FORBIDDEN)
    return None


def active_admin_count(exclude_user_id=None):
    admins = UserProfile.objects.filter(
        role__name="Administrator",
        account_status=UserProfile.STATUS_APPROVED,
        is_active=True,
        user__is_active=True,
    )
    if exclude_user_id is not None:
        admins = admins.exclude(user_id=exclude_user_id)
    return admins.count()


def end_sessions(user):
    """Log the user out everywhere by deleting their API token."""
    Token.objects.filter(user=user).delete()


def clean_account_fields(data, user=None, creating=False):
    """
    Validate account fields from an Administrator.
    Returns (values, errors); only fields present in data are returned.
    """
    values, errors = {}, {}

    def text(field, max_length, required=False):
        if field not in data:
            if creating and required:
                errors[field] = "This field is required."
            return
        value = data.get(field)
        if value is None:
            value = ""
        if not isinstance(value, str):
            errors[field] = "Must be text."
            return
        value = value.strip()
        if required and not value:
            errors[field] = "This field is required."
        elif len(value) > max_length:
            errors[field] = f"Must be at most {max_length} characters."
        else:
            values[field] = value

    text("username", 150, required=True)
    text("first_name", 150, required=True)
    text("last_name", 150)
    text("email", 254, required=True)
    text("contact_number", 20)

    if "username" in values:
        taken = User.objects.filter(username__iexact=values["username"])
        if user is not None:
            taken = taken.exclude(pk=user.pk)
        if taken.exists():
            errors["username"] = "This username is already taken."

    if "email" in values:
        from django.core.validators import validate_email
        try:
            validate_email(values["email"])
        except DjangoValidationError:
            errors["email"] = "Enter a valid email address."
        else:
            taken = User.objects.filter(email__iexact=values["email"])
            if user is not None:
                taken = taken.exclude(pk=user.pk)
            if taken.exists():
                errors["email"] = "This email address is already registered."

    if "role" in data or creating:
        role = Role.objects.filter(name=data.get("role")).first() if data.get("role") in ROLE_NAMES else None
        if role is None:
            errors["role"] = f"Choose one role: {', '.join(ROLE_NAMES)}."
        else:
            values["role"] = role

    if "municipality" in data or creating:
        municipality_id = data.get("municipality")
        if municipality_id in (None, ""):
            values["municipality"] = None
        else:
            municipality = Municipality.objects.filter(pk=municipality_id).first() if str(municipality_id).isdigit() else None
            if municipality is None:
                errors["municipality"] = "Choose a valid municipality."
            else:
                values["municipality"] = municipality

    if creating:
        password = data.get("password")
        if not isinstance(password, str) or not password:
            errors["password"] = "Set an initial password."
        else:
            try:
                validate_password(password)
            except DjangoValidationError as error:
                errors["password"] = " ".join(error.messages)
            else:
                values["password"] = password

    # Fish Vendors and LGU Officers work in a municipality.
    final_role = values.get("role") or (user.aquatimbang_profile.role if user else None)
    final_municipality = values["municipality"] if "municipality" in values else (
        user.aquatimbang_profile.municipality if user else None
    )
    if final_role is not None and final_role.name != "Administrator" and final_municipality is None and "municipality" not in errors:
        errors["municipality"] = "Fish Vendors and LGU Officers need a municipality."

    return values, errors


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def list_users(request):
    """
    GET: every AquaTimbang account. POST: create an active account
    (Administrators create LGU Officer and Administrator accounts, UC-1).
    """
    refused = require_admin(request)
    if refused:
        return refused

    if request.method == "GET":
        profiles = UserProfile.objects.select_related(
            "user", "role", "municipality", "reviewed_by"
        ).order_by("-user__date_joined")
        return Response([user_row(profile) for profile in profiles], status=status.HTTP_200_OK)

    values, errors = clean_account_fields(request.data, creating=True)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        user = User.objects.create_user(
            username=values["username"],
            email=values["email"],
            password=values["password"],
            first_name=values["first_name"],
            last_name=values.get("last_name", ""),
        )
        profile = UserProfile.objects.create(
            user=user,
            role=values["role"],
            municipality=values.get("municipality"),
            contact_number=values.get("contact_number", ""),
            account_status=UserProfile.STATUS_APPROVED,
            is_active=True,
            reviewed_by=request.user,
            reviewed_at=timezone.now(),
        )
        log_activity(request.user, "created", "UserAccount", user.id, user.username, {
            "role": profile.role.name,
            "municipality": profile.municipality.name if profile.municipality else None,
        })
    return Response(user_row(profile), status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def manage_user(request, user_id):
    """PATCH: edit details, municipality or role. DELETE: remove the account."""
    refused = require_admin(request)
    if refused:
        return refused

    profile = UserProfile.objects.select_related("user", "role", "municipality").filter(user_id=user_id).first()
    if profile is None:
        return Response({"message": "Account not found."}, status=status.HTTP_404_NOT_FOUND)
    user = profile.user
    is_self = user.pk == request.user.pk
    is_active_admin = profile.role.name == "Administrator" and profile.is_active and user.is_active

    if request.method == "DELETE":
        if is_self:
            return Response({"message": "You cannot delete your own account."}, status=status.HTTP_400_BAD_REQUEST)
        if is_active_admin and active_admin_count(exclude_user_id=user.pk) == 0:
            return Response({"message": "You cannot delete the last active Administrator."}, status=status.HTTP_400_BAD_REQUEST)
        username, role = user.username, profile.role.name
        try:
            with transaction.atomic():
                log_activity(request.user, "deleted", "UserAccount", user.pk, username, {"role": role})
                user.delete()
        except ProtectedError:
            return Response(
                {"message": f"{username} has price suggestions on record and cannot be deleted. Deactivate the account instead to keep the history."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"message": f"{username} deleted."}, status=status.HTTP_200_OK)

    values, errors = clean_account_fields(request.data, user=user)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)

    new_role = values.get("role")
    if new_role is not None and new_role.pk != profile.role_id:
        if is_self:
            return Response({"role": "You cannot change your own role."}, status=status.HTTP_400_BAD_REQUEST)
        if is_active_admin and active_admin_count(exclude_user_id=user.pk) == 0:
            return Response({"role": "Keep at least one active Administrator."}, status=status.HTTP_400_BAD_REQUEST)

    changes = {}
    with transaction.atomic():
        for field in ("username", "first_name", "last_name", "email"):
            if field in values and getattr(user, field) != values[field]:
                changes[field] = {"from": getattr(user, field), "to": values[field]}
                setattr(user, field, values[field])
        if "contact_number" in values and profile.contact_number != values["contact_number"]:
            changes["contact_number"] = {"from": profile.contact_number, "to": values["contact_number"]}
            profile.contact_number = values["contact_number"]
        if "municipality" in values and profile.municipality != values["municipality"]:
            changes["municipality"] = {
                "from": profile.municipality.name if profile.municipality else None,
                "to": values["municipality"].name if values["municipality"] else None,
            }
            profile.municipality = values["municipality"]
        if new_role is not None and new_role.pk != profile.role_id:
            changes["role"] = {"from": profile.role.name, "to": new_role.name}
            profile.role = new_role
        user.save()
        profile.save()
        if "role" in changes:
            # A new role takes effect at the next login.
            end_sessions(user)
        if changes:
            log_activity(
                request.user,
                "role changed" if "role" in changes else "updated",
                "UserAccount", user.pk, user.username, {"changes": changes},
            )

    profile.refresh_from_db()
    return Response(user_row(profile), status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def set_user_status(request, user_id):
    """Deactivate ({"active": false}) or reactivate ({"active": true}) an approved account."""
    refused = require_admin(request)
    if refused:
        return refused

    active = request.data.get("active")
    if not isinstance(active, bool):
        return Response({"message": 'Send {"active": true} or {"active": false}.'}, status=status.HTTP_400_BAD_REQUEST)

    profile = UserProfile.objects.select_related("user", "role").filter(user_id=user_id).first()
    if profile is None:
        return Response({"message": "Account not found."}, status=status.HTTP_404_NOT_FOUND)
    user = profile.user
    if profile.account_status != UserProfile.STATUS_APPROVED:
        return Response(
            {"message": "Only approved accounts can be activated or deactivated. Review pending registrations instead."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not active:
        if user.pk == request.user.pk:
            return Response({"message": "You cannot deactivate your own account."}, status=status.HTTP_400_BAD_REQUEST)
        if profile.role.name == "Administrator" and active_admin_count(exclude_user_id=user.pk) == 0:
            return Response({"message": "You cannot deactivate the last active Administrator."}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        profile.is_active = active
        profile.save(update_fields=["is_active", "updated_at"])
        user.is_active = active
        user.save(update_fields=["is_active"])
        if not active:
            end_sessions(user)
        log_activity(request.user, "activated" if active else "deactivated", "UserAccount", user.pk, user.username, {
            "role": profile.role.name,
        })
    profile.refresh_from_db()
    return Response(user_row(profile), status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def reset_user_password(request, user_id):
    """
    Give the account a new temporary password (shown once to the
    Administrator) and log it out everywhere.
    """
    refused = require_admin(request)
    if refused:
        return refused

    user = User.objects.filter(pk=user_id).first()
    if user is None:
        return Response({"message": "Account not found."}, status=status.HTTP_404_NOT_FOUND)
    if user.pk == request.user.pk:
        return Response({"message": "Use My Profile to change your own password."}, status=status.HTTP_400_BAD_REQUEST)

    # e.g. "AT-k3Jd9-Qm2Xp" — easy to read aloud, hard to guess.
    temporary = f"AT-{secrets.token_urlsafe(4)}-{secrets.token_urlsafe(4)}"
    with transaction.atomic():
        user.set_password(temporary)
        user.save(update_fields=["password"])
        end_sessions(user)
        log_activity(request.user, "password reset", "UserAccount", user.pk, user.username)
    return Response(
        {
            "message": f"Password reset for {user.username}. Give them this temporary password and ask them to change it from My Profile.",
            "temporary_password": temporary,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_my_password(request):
    """Change your own password. Returns a new login token."""
    if approved_role(request.user) is None:
        return Response({"message": "An approved account is required."}, status=status.HTTP_403_FORBIDDEN)

    current = request.data.get("current_password")
    new = request.data.get("new_password")
    if not isinstance(current, str) or not request.user.check_password(current):
        return Response({"current_password": "Your current password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)
    if not isinstance(new, str) or not new:
        return Response({"new_password": "Enter a new password."}, status=status.HTTP_400_BAD_REQUEST)
    if new == current:
        return Response({"new_password": "Choose a password different from the current one."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        validate_password(new, user=request.user)
    except DjangoValidationError as error:
        return Response({"new_password": " ".join(error.messages)}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        request.user.set_password(new)
        request.user.save(update_fields=["password"])
        # Log out other sessions; this browser gets a fresh token.
        end_sessions(request.user)
        token = Token.objects.create(user=request.user)
        log_activity(request.user, "password changed", "UserAccount", request.user.pk, request.user.username)
    return Response({"message": "Password changed.", "token": token.key}, status=status.HTTP_200_OK)


# ============================================================
# LOGIN SECURITY — LOCKOUT AND LOGOUT (UC-1)
# ============================================================
from datetime import timedelta

from django.conf import settings

from .models import LoginLockout, TokenActivity


def lockout_response(locked_until):
    minutes = max(1, int((locked_until - timezone.now()).total_seconds() // 60) + 1)
    return Response(
        {
            "message": (
                f"Too many failed login attempts. This account is locked for {minutes} more "
                f"minute{'s' if minutes != 1 else ''}. Try again later or contact your administrator."
            ),
            "locked_until": locked_until.isoformat(),
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


def login_lock(username):
    """Response refusing a locked username, or None."""
    record = LoginLockout.objects.filter(username=username.lower()).first()
    if record and record.locked_until and record.locked_until > timezone.now():
        return lockout_response(record.locked_until)
    return None


@transaction.atomic
def record_failed_login(username):
    """
    Count a wrong password. Locks the username after LOGIN_MAX_ATTEMPTS
    failures and returns the lock response; otherwise returns None.
    """
    now = timezone.now()
    record, _ = LoginLockout.objects.select_for_update().get_or_create(username=username.lower())
    if record.locked_until and record.locked_until <= now:
        # The previous lock has expired; start counting again.
        record.failed_attempts = 0
        record.locked_until = None
    record.failed_attempts += 1
    record.last_failed_at = now

    user = User.objects.filter(username__iexact=username).first()
    if user is not None:
        log_activity(user, "login failed", "Authentication", user.pk, user.username,
                     {"attempt": record.failed_attempts})

    if record.failed_attempts >= settings.LOGIN_MAX_ATTEMPTS:
        record.locked_until = now + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
        record.save()
        if user is not None:
            log_activity(user, "locked", "Authentication", user.pk, user.username,
                         {"minutes": settings.LOGIN_LOCKOUT_MINUTES})
        return lockout_response(record.locked_until)
    record.save()
    return None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_user(request):
    """End this session on the server by deleting its token."""
    log_activity(request.user, "logged out", "Authentication", request.user.pk, request.user.username)
    if request.auth is not None:
        request.auth.delete()
    return Response({"message": "Logged out."}, status=status.HTTP_200_OK)



# ============================================================
# SYSTEM CONFIGURATION (Administrator)
# ============================================================
from .models import SystemSetting
from .serializers import SystemSettingSerializer


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def system_settings(request):
    """GET: current settings (any approved user). PATCH: change them (Administrator)."""
    role = approved_role(request.user)
    if role is None:
        return Response({"message": "An approved account is required."}, status=status.HTTP_403_FORBIDDEN)
    settings_row = SystemSetting.load()
    if request.method == "GET":
        return Response(SystemSettingSerializer(settings_row).data)
    if role != "Administrator":
        return Response({"message": "Administrator access required."}, status=status.HTTP_403_FORBIDDEN)

    before = SystemSettingSerializer(settings_row).data
    serializer = SystemSettingSerializer(settings_row, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    with transaction.atomic():
        settings_row = serializer.save(updated_by=request.user)
        after = SystemSettingSerializer(settings_row).data
        changes = {
            field: {"from": before[field], "to": after[field]}
            for field in ("min_price_per_kg", "max_price_per_kg")
            if before[field] != after[field]
        }
        if changes:
            log_activity(request.user, "updated", "SystemSetting", 1, "Price range", {"changes": changes})
    return Response(after)
