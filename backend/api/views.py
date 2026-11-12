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
from .models import PriceCorrection, PriceImportBatch
import uuid
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

def rejected_message(profile):
    """Login message for a rejected registration, with the reviewer's reason."""
    reason = (profile.rejection_reason or "").strip()
    if reason:
        return f"Your registration was rejected: {reason} Contact your LGU office if you have questions."
    return "Your registration was rejected. Contact your LGU office."

@api_view(["POST"])
@permission_classes([AllowAny])
def login_user(request):
    """
    Authenticate an AquaTimbang user and return a login token.
    """
    # Once a day, archive vendor accounts unused for 5 years.
    from .archiving import archive_once_a_day
    archive_once_a_day()
    # Spaces typed before or after the username are ignored.
    username = str(request.data.get("username") or "").strip()
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
                message = rejected_message(candidate_profile)
            elif candidate_profile is not None and candidate_profile.archived_at:
                message = (
                    "Your account was archived because it was not used for 5 years. "
                    "Ask the Administrator to reactivate it."
                )
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
            reviewer = (
                "an LGU Officer of your municipality"
                if profile.role and profile.role.name == "Fish Vendor"
                else "an Administrator"
            )
            message = f"Your account is pending approval. Please wait for {reviewer} to review it."
        elif profile.account_status == UserProfile.STATUS_REJECTED:
            message = rejected_message(profile)
        elif profile.archived_at:
            message = (
                "Your account was archived because it was not used for 5 years. "
                "Ask the Administrator to reactivate it."
            )
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
            "must_change_password": profile.must_change_password,
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
        "market",
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

    def get_queryset(self):
        """
        ?since=YYYY-MM-DD and ?until=YYYY-MM-DD limit which *published*
        prices are returned, so dashboards need not download years of
        history. Drafts and records under review are always included.
        """
        from datetime import date as _date
        from django.db.models import Q
        from rest_framework.exceptions import ValidationError as DRFValidationError

        queryset = super().get_queryset()
        for name, lookup in (("since", "recorded_date__gte"), ("until", "recorded_date__lte")):
            value = self.request.query_params.get(name)
            if not value:
                continue
            try:
                day = _date.fromisoformat(value)
            except ValueError:
                raise DRFValidationError({name: "Use the date format YYYY-MM-DD."})
            queryset = queryset.filter(Q(**{lookup: day}) | ~Q(status=PriceRecord.STATUS_PUBLISHED))
        market = self.request.query_params.get("market")
        if market:
            queryset = queryset.filter(market_id=market)
        return queryset

    # --------------------------------------------------------
    # REMOVE A PRICE PUBLISHED BY MISTAKE TODAY
    # --------------------------------------------------------
    @action(detail=True, methods=["post"], url_path="withdraw")
    @transaction.atomic
    def withdraw_price(self, request, pk=None):
        """
        Remove a price that was encoded and published today by mistake.
        It is marked Withdrawn (not deleted), so the audit trail keeps it;
        older published prices can only be corrected.
        """
        if approved_role(request.user) not in ("LGU Officer", "Administrator"):
            raise PermissionDenied("Only LGU Officers and Administrators can remove prices.")
        record = self.get_object()
        if record.status != PriceRecord.STATUS_PUBLISHED:
            return Response(
                {"message": "Only published prices are withdrawn. Delete unpublished entries instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if timezone.localtime(record.created_at).date() != timezone.localdate():
            return Response(
                {"message": "Only prices encoded today can be removed. Older official prices can only be corrected, so their history stays."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = str(request.data.get("reason") or "").strip()
        if len(reason) < 5:
            return Response({"reason": "Write why this price is being removed."}, status=status.HTTP_400_BAD_REQUEST)
        record.status = PriceRecord.STATUS_WITHDRAWN
        record.rejection_reason = reason[:500]
        record.reviewed_by = request.user
        record.reviewed_at = timezone.now()
        record.save(update_fields=["status", "rejection_reason", "reviewed_by", "reviewed_at", "updated_at"])
        self._log_price("withdrawn", record, {"reason": reason[:500], "status": PriceRecord.STATUS_WITHDRAWN})
        return Response({"message": f"{record.fish_species.name} price removed. It no longer shows as an official price; the record and reason stay in the Audit Log."})

    # --------------------------------------------------------
    # PAST IMPORTS AND UNDO
    # --------------------------------------------------------
    def _import_batches(self, request):
        role = approved_role(request.user)
        if role not in ("LGU Officer", "Administrator"):
            raise PermissionDenied("Only LGU Officers and Administrators can manage imports.")
        batches = PriceImportBatch.objects.select_related("imported_by", "undone_by")
        return batches if role == "Administrator" else batches.filter(imported_by=request.user)

    @action(detail=False, methods=["get"], url_path="import-batches")
    def import_batches(self, request):
        """Recent imports (an LGU Officer sees their own; Administrators see all)."""
        from django.db.models import Count
        rows = self._import_batches(request).annotate(remaining=Count("records")).order_by("-created_at")[:30]
        return Response([
            {
                "id": b.pk,
                "file_name": b.file_name,
                "source": b.source,
                "imported_by": b.imported_by.username if b.imported_by else "Deleted account",
                "sent_to_review": b.sent_to_review,
                "record_count": b.record_count,
                "remaining": b.remaining,
                "first_date": b.first_date,
                "last_date": b.last_date,
                "created_at": b.created_at,
                "undone_at": b.undone_at,
                "undone_by": b.undone_by.username if b.undone_by else None,
            }
            for b in rows
        ])

    @action(detail=False, methods=["post"], url_path=r"import-batches/(?P<batch_id>\d+)/undo")
    def undo_import(self, request, batch_id=None):
        """
        Remove the prices that came from one import (a wrong file).
        With "fish_species", only that fish's prices from the file are
        removed; the rest of the import stays.
        """
        batch = self._import_batches(request).filter(pk=batch_id).first()
        if batch is None:
            return Response({"message": "Import not found."}, status=status.HTTP_404_NOT_FOUND)
        if batch.undone_at:
            return Response({"message": "This import was already undone."}, status=status.HTTP_400_BAD_REQUEST)
        fish = None
        if request.data.get("fish_species") not in (None, ""):
            try:
                fish = FishSpecies.objects.get(pk=int(request.data["fish_species"]))
            except (ValueError, TypeError, FishSpecies.DoesNotExist):
                return Response({"fish_species": "Choose a fish from this import."}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            records = batch.records.all()
            if fish is not None:
                records = records.filter(fish_species=fish)
            dates = list(records.values_list("recorded_date", flat=True))
            removed = len(dates)
            if fish is not None and removed == 0:
                return Response({"fish_species": f"{fish.name} has no prices left in this import."}, status=status.HTTP_400_BAD_REQUEST)
            records.delete()
            # The whole import counts as undone once nothing from it is left.
            if not batch.records.exists():
                batch.undone_at = timezone.now()
                batch.undone_by = request.user
                batch.save(update_fields=["undone_at", "undone_by"])
            what = f"{removed:,} {fish.name} prices" if fish else f"{removed:,} imported prices"
            log_activity(request.user, "undid import", "PriceRecord", 0, f"{what} removed", {
                "file": batch.file_name,
                "source": batch.source,
                "import_id": batch.pk,
                "fish": fish.name if fish else "all fish",
                "removed": removed,
                "from": str(min(dates)) if dates else None,
                "to": str(max(dates)) if dates else None,
            })
        label = batch.file_name or batch.source
        message = (
            f"{removed:,} {fish.name} prices from {label} were removed. The other fish stay."
            if fish else f"Import undone: {removed:,} prices from {label} were removed."
        )
        return Response({"message": message, "removed": removed})

    @action(detail=False, methods=["get"], url_path=r"import-batches/(?P<batch_id>\d+)/fish")
    def import_batch_fish(self, request, batch_id=None):
        """Fish in one import, with how many prices and which dates are left."""
        from django.db.models import Count, Max, Min
        batch = self._import_batches(request).filter(pk=batch_id).first()
        if batch is None:
            return Response({"message": "Import not found."}, status=status.HTTP_404_NOT_FOUND)
        rows = (
            batch.records.values("fish_species_id", "fish_species__name")
            .annotate(prices=Count("id"), first=Min("recorded_date"), last=Max("recorded_date"),
                      low=Min("price_per_kg"), high=Max("price_per_kg"))
            .order_by("fish_species__name")
        )
        municipalities = sorted(set(batch.records.values_list("municipality__name", flat=True)))
        return Response({
            "municipalities": municipalities,
            "fish": [
                {
                    "id": r["fish_species_id"], "name": r["fish_species__name"], "prices": r["prices"],
                    "first_date": r["first"], "last_date": r["last"],
                    "low": str(r["low"]), "high": str(r["high"]),
                }
                for r in rows
            ],
        })

    # --------------------------------------------------------
    # IMPORT PRICE HISTORY (e.g. a DVFM spreadsheet saved as CSV)
    # --------------------------------------------------------
    IMPORT_MAX_ROWS = 5000

    @action(detail=False, methods=["post"], url_path="import")
    def import_history(self, request):
        """
        Import historical prices as published records.

        Body: {"rows": [{"row": 2, "date": "2024-01-05", "fish": "Bangus",
               "municipality": "Cebu City", "price": "180.50"}, ...],
               "source": "DVFM historical data", "dry_run": true}

        Every row is checked first. With dry_run the rows are only checked;
        otherwise the valid rows are saved and the others are reported.
        Prices already recorded for that fish, municipality and day are
        skipped, never overwritten.
        """
        from datetime import date as _date
        from .models import SystemSetting

        if approved_role(request.user) not in ("LGU Officer", "Administrator"):
            raise PermissionDenied("Only LGU Officers and Administrators can import prices.")
        rows = request.data.get("rows")
        if not isinstance(rows, list) or not rows:
            return Response({"message": "No rows to import."}, status=status.HTTP_400_BAD_REQUEST)
        if len(rows) > self.IMPORT_MAX_ROWS:
            return Response(
                {"message": f"Send at most {self.IMPORT_MAX_ROWS:,} rows at a time."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        source = str(request.data.get("source") or "Imported price history").strip()[:150]
        dry_run = bool(request.data.get("dry_run"))
        # Old official records are published at once; new or unsure data can
        # go to Review & Publish first.
        send_to_review = bool(request.data.get("send_to_review"))

        from .validators import clean_fish_name
        from .species_tools import known_scientific_name, name_key as plain_key

        # Match names after tidying them, ignoring capitals, spaces and
        # hyphens: "lapu lapu", "Lapu-lapu", "LAPULAPU" and "lapu2x" are all
        # the same fish.
        def name_key(value):
            return plain_key(clean_fish_name(value))

        species = {name_key(fish.name): fish for fish in FishSpecies.objects.all()}
        # Fish not in AquaTimbang yet are added with a tidy name ("bangus" -> "Bangus").
        new_fish = {}

        def find_fish(raw):
            key = name_key(raw)
            if not key:
                return None
            if key in species:
                return species[key]
            if key not in new_fish:
                name = clean_fish_name(raw)[:100]
                if len(name) < 2 or not any(ch.isalpha() for ch in name):
                    return None
                if dry_run:
                    fish = FishSpecies(name=name, scientific_name=known_scientific_name(name))
                    fish.id = -(len(new_fish) + 1)  # placeholder until it is saved
                else:
                    fish, created = FishSpecies.objects.get_or_create(
                        name=name, defaults={"scientific_name": known_scientific_name(name)},
                    )
                    if created:
                        log_activity(request.user, "created", "FishSpecies", fish.pk, fish.name,
                                     {"reason": "Added automatically from an imported file"})
                new_fish[key] = fish
            return new_fish[key]
        places = {place.name.strip().lower(): place for place in Municipality.objects.all()}
        # Markets by municipality and lower-case name; a market chosen on the
        # page is used for rows without a Market column.
        from .models import Market
        markets = {(m.municipality_id, m.name.strip().lower()): m for m in Market.objects.filter(is_active=True)}
        chosen_market = None
        if str(request.data.get("market") or "").isdigit():
            chosen_market = Market.objects.filter(pk=int(request.data.get("market")), is_active=True).first()
        bounds = SystemSetting.load()
        today = timezone.localdate()

        errors, candidates, seen = [], [], set()
        for index, row in enumerate(rows):
            row_number = row.get("row", index + 1) if isinstance(row, dict) else index + 1
            if not isinstance(row, dict):
                errors.append({"row": row_number, "message": "Not a valid row."})
                continue
            problems = []
            try:
                day = _date.fromisoformat(str(row.get("date", "")).strip())
                if day > today:
                    problems.append("date is in the future")
            except ValueError:
                day = None
                problems.append(f"unreadable date \"{row.get('date', '')}\"")
            fish = find_fish(row.get("fish", ""))
            if fish is None:
                problems.append(f"missing or unreadable fish name \"{row.get('fish', '')}\"")
            place = places.get(str(row.get("municipality", "")).strip().lower())
            if place is None:
                problems.append(f"unknown municipality \"{row.get('municipality', '')}\"")
            market = None
            market_name = " ".join(str(row.get("market") or "").split())
            if place is not None and market_name:
                market = markets.get((place.id, market_name.lower()))
                if market is None:
                    problems.append(f"unknown market \"{market_name}\" in {place.name} (add it in Municipality & Market)")
            elif place is not None and chosen_market is not None:
                if chosen_market.municipality_id == place.id:
                    market = chosen_market
                else:
                    problems.append(f"{chosen_market.name} is not in {place.name}")
            try:
                price = Decimal(str(row.get("price", "")).replace(",", "").replace("₱", "").strip())
                if not price.is_finite():
                    raise InvalidOperation
                price = price.quantize(Decimal("0.01"))
                low, high, label = bounds.bounds_for(fish)
                if price < low or price > high:
                    problems.append(
                        f"price ₱{price:,.2f} is outside the allowed ₱{low:,.2f}–₱{high:,.2f} "
                        f"for {label} (System Configuration)"
                    )
            except (InvalidOperation, ValueError):
                price = None
                problems.append(f"unreadable price \"{row.get('price', '')}\"")
            if not problems:
                key = (fish.id, place.id, market.id if market else None, day)
                if key in seen:
                    problems.append("same fish, market and date appears earlier in the file")
                seen.add(key)
            if problems:
                errors.append({"row": row_number, "message": "; ".join(problems)})
            else:
                candidates.append((row_number, fish, place, day, price, market))

        # Prices already in AquaTimbang are kept; the file's row is skipped.
        existing = set()
        if candidates:
            days = [c[3] for c in candidates]
            existing = set(
                PriceRecord.objects.filter(
                    fish_species_id__in={c[1].id for c in candidates},
                    municipality_id__in={c[2].id for c in candidates},
                    recorded_date__gte=min(days),
                    recorded_date__lte=max(days),
                ).exclude(
                    status__in=[PriceRecord.STATUS_REJECTED, PriceRecord.STATUS_WITHDRAWN]
                ).values_list("fish_species_id", "municipality_id", "market_id", "recorded_date")
            )
        new_rows = [c for c in candidates if (c[1].id, c[2].id, c[5].id if c[5] else None, c[3]) not in existing]

        imported = 0
        batch = None
        if new_rows and not dry_run:
            now = timezone.now()
            with transaction.atomic():
                # Every chunk of one file shares the batch key sent by the browser.
                batch_key = str(request.data.get("batch_id") or uuid.uuid4().hex)[:40]
                batch, _ = PriceImportBatch.objects.get_or_create(
                    batch_key=batch_key,
                    defaults={
                        "file_name": str(request.data.get("file_name") or "")[:200],
                        "source": source,
                        "imported_by": request.user,
                        "sent_to_review": send_to_review,
                    },
                )
                if batch.imported_by_id != request.user.pk or batch.undone_at:
                    raise PermissionDenied("This import cannot be added to.")
                published = not batch.sent_to_review
                PriceRecord.objects.bulk_create(
                    [
                        PriceRecord(
                            fish_species=fish,
                            municipality=place,
                            market=market,
                            recorded_date=day,
                            price_per_kg=price,
                            source=source,
                            remarks="Imported price history",
                            status=PriceRecord.STATUS_PUBLISHED if published else PriceRecord.STATUS_PENDING,
                            recorded_by=request.user,
                            reviewed_by=request.user if published else None,
                            reviewed_at=now if published else None,
                            published_by=request.user if published else None,
                            published_at=now if published else None,
                            import_batch=batch,
                        )
                        for _, fish, place, day, price, market in new_rows
                    ],
                    batch_size=1000,
                )
                chunk_dates = [c[3] for c in new_rows]
                batch.record_count += len(new_rows)
                batch.first_date = min([d for d in (batch.first_date, min(chunk_dates)) if d])
                batch.last_date = max([d for d in (batch.last_date, max(chunk_dates)) if d])
                batch.save(update_fields=["record_count", "first_date", "last_date"])
                imported = len(new_rows)
                dates = [c[3] for c in new_rows]
                ActivityLog.objects.create(
                    actor=request.user,
                    actor_username=request.user.username,
                    actor_role=approved_role(request.user),
                    action="imported",
                    target_type="PriceRecord",
                    target_id=0,  # one entry for the whole import, not a single record
                    target_name=f"{imported:,} historical prices",
                    details={
                        "source": source,
                        "file": batch.file_name,
                        "import_id": batch.pk,
                        "sent_to_review": batch.sent_to_review,
                        "imported": imported,
                        "from": min(dates).isoformat(),
                        "to": max(dates).isoformat(),
                    },
                )

        all_dates = [c[3] for c in new_rows]
        return Response({
            "dry_run": dry_run,
            "import_id": batch.pk if batch else None,
            "rows": len(rows),
            "ready": len(new_rows),
            "imported": imported,
            "already_recorded": len(candidates) - len(new_rows),
            "error_count": len(errors),
            "errors": errors[:300],
            "first_date": min(all_dates).isoformat() if all_dates else None,
            "last_date": max(all_dates).isoformat() if all_dates else None,
            # Fish that were not in AquaTimbang: added (or, on a check, will be added).
            "new_fish": sorted(f.name for f in new_fish.values()),
        })
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
            # The record's fish, municipality and price are kept separately
            # so logs can show them in their own columns.
            details={
                "fish": record.fish_species.name,
                "fish_id": record.fish_species_id,
                "municipality": record.municipality.name,
                "price_per_kg": str(record.price_per_kg),
                "recorded_date": str(record.recorded_date),
                **(details or {}),
            },
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

        # The price, the fish species, or both can be corrected.
        new_price = record.price_per_kg
        if request.data.get("price_per_kg") not in (None, ""):
            try:
                new_price = Decimal(str(request.data.get("price_per_kg"))).quantize(Decimal("0.01"))
            except (InvalidOperation, ValueError, TypeError):
                return Response({"price_per_kg": "Enter a valid price."}, status=status.HTTP_400_BAD_REQUEST)
            if new_price <= 0:
                return Response({"price_per_kg": "Price per kilogram must be greater than zero."}, status=status.HTTP_400_BAD_REQUEST)

        new_species = record.fish_species
        if request.data.get("fish_species") not in (None, ""):
            try:
                new_species = FishSpecies.objects.get(pk=int(request.data.get("fish_species")), is_active=True)
            except (ValueError, TypeError, FishSpecies.DoesNotExist):
                return Response({"fish_species": "Choose an active fish species."}, status=status.HTTP_400_BAD_REQUEST)
            if new_species.pk != record.fish_species_id and PriceRecord.objects.filter(
                fish_species=new_species,
                municipality_id=record.municipality_id,
                market_id=record.market_id,
                recorded_date=record.recorded_date,
            ).exclude(status__in=[PriceRecord.STATUS_REJECTED, PriceRecord.STATUS_WITHDRAWN]).exclude(pk=record.pk).exists():
                return Response(
                    {"fish_species": f"{new_species.name} already has a price in {record.municipality.name} for "
                                     f"{record.recorded_date:%b %d, %Y}. Correct that record instead."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # The corrected price must fit the range for the (possibly new) fish's class.
        try:
            check_price_bounds(new_price, new_species)
        except serializers.ValidationError as error:
            return Response({"price_per_kg": error.detail[0]}, status=status.HTTP_400_BAD_REQUEST)

        species_changed = new_species.pk != record.fish_species_id
        if new_price == record.price_per_kg and not species_changed:
            return Response(
                {"price_per_kg": "Nothing changed. Enter a different price or choose a different fish."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        previous_price = record.price_per_kg
        previous_species = record.fish_species
        PriceCorrection.objects.create(
            price_record=record,
            previous_price=previous_price,
            new_price=new_price,
            previous_species=previous_species if species_changed else None,
            new_species=new_species if species_changed else None,
            reason=reason.strip(),
            corrected_by=request.user,
        )
        record.price_per_kg = new_price
        record.fish_species = new_species
        record.is_correction = True
        record.save(update_fields=["price_per_kg", "fish_species", "is_correction", "updated_at"])
        changes = {}
        if new_price != previous_price:
            changes["price_per_kg"] = {"from": str(previous_price), "to": str(new_price)}
        if species_changed:
            changes["fish_species"] = {"from": previous_species.name, "to": new_species.name}
        self._log_price("corrected", record, {"changes": changes, "reason": reason.strip()})
        record = self.get_queryset().get(pk=record.pk)
        return Response(
            {"message": "Price corrected. The original is kept in the history.", "record": self.get_serializer(record).data},
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
        previous["photo"] = before.photo.name or ""
        instance = serializer.save()
        current = {
            "name": instance.name,
            "scientific_name": instance.scientific_name,
            "description": instance.description,
            "is_active": instance.is_active,
            "photo": instance.photo.name or "",
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
                    "This fish has prices or other records, so it cannot simply be deleted. "
                    "If it was added by mistake, merge it into the correct fish instead; "
                    "otherwise deactivate it to keep its price history."
                )
            })
    @action(detail=True, methods=["get"], url_path="usage")
    def usage(self, request, pk=None):
        """How much is recorded under this fish (shown before removing it)."""
        from .models import VendorPriceSuggestion, WeightEntry
        fish = self.get_object()
        return Response({
            "prices": PriceRecord.objects.filter(fish_species=fish).count(),
            "suggestions": VendorPriceSuggestion.objects.filter(fish_species=fish).count(),
            "calculations": WeightEntry.objects.filter(fish_species=fish).count(),
        })

    @action(detail=True, methods=["post"], url_path="merge")
    def merge(self, request, pk=None):
        """
        Fix a fish added by mistake (e.g. "Anduhao" for "Anduhaw"): move its
        prices, suggestions, calculations, scanner photos, vendor lists and
        closed seasons to the correct fish, then delete it. When both fish have
        a price for the same municipality, market and day, the correct fish's
        price is kept and the duplicate is removed.
        """
        from .models import ClosedFishingSeason, FishScanPhoto, FishVendorVerification, VendorPriceSuggestion, WeightEntry
        from .species_tools import merge_species
        source = self.get_object()
        try:
            target = FishSpecies.objects.get(pk=int(request.data.get("into")))
        except (TypeError, ValueError, FishSpecies.DoesNotExist):
            return Response({"into": "Choose the correct fish."}, status=status.HTTP_400_BAD_REQUEST)
        if target.pk == source.pk:
            return Response({"into": "Choose a different fish."}, status=status.HTTP_400_BAD_REQUEST)
        reason = str(request.data.get("reason") or "").strip()[:300]

        with transaction.atomic():
            counts = merge_species(
                source, target, PriceRecord, VendorPriceSuggestion, WeightEntry,
                FishScanPhoto, FishVendorVerification, ClosedFishingSeason,
            )
            details = {"merged_into": target.name, "merged_into_id": target.pk, **counts, "reason": reason}
            self._log("merged", source, details)
            source.delete()
        return Response({"message": f"{source.name} was merged into {target.name}.", **details})

    @action(detail=True, methods=["post"], url_path="delete-everything")
    def delete_everything(self, request, pk=None):
        """
        Delete a fish together with everything recorded under it (prices,
        their corrections, vendor suggestions, saved calculations, scanner
        photos and forecasts). For a fish that should not be in the system at
        all, e.g. a non-fish item imported by mistake. The fish's exact name
        must be typed to confirm. The audit log keeps what was removed.
        """
        from .models import FishScanPhoto, VendorPriceSuggestion, WeightEntry
        fish = self.get_object()
        typed = str(request.data.get("confirm_name") or "").strip()
        if typed.lower() != fish.name.strip().lower():
            return Response(
                {"confirm_name": f'Type "{fish.name}" to confirm.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = str(request.data.get("reason") or "").strip()[:300]
        with transaction.atomic():
            prices = PriceRecord.objects.filter(fish_species=fish)
            published = prices.filter(status=PriceRecord.STATUS_PUBLISHED).count()
            details = {
                "deleted_id": fish.pk,
                "deleted_name": fish.name,
                "prices_deleted": prices.count(),
                "published_prices_deleted": published,
                "suggestions_deleted": VendorPriceSuggestion.objects.filter(fish_species=fish).count(),
                "calculations_deleted": WeightEntry.objects.filter(fish_species=fish).count(),
                "reason": reason,
            }
            self._log("deleted with all records", fish, details)
            prices.delete()
            VendorPriceSuggestion.objects.filter(fish_species=fish).delete()
            WeightEntry.objects.filter(fish_species=fish).delete()
            FishScanPhoto.objects.filter(fish_species=fish).delete()
            fish.delete()
        return Response({"message": f"{fish.name} and all its records were deleted.", **details})

    @action(detail=True, methods=["get"], authentication_classes=[], permission_classes=[AllowAny])
    def photo(self, request, pk=None):
        """
        The species picture. Public, like the species names on the
        registration page, so it can be shown as a plain <img>.
        """
        fish = self.get_object()
        if not fish.photo:
            raise Http404("No photo for this species.")
        try:
            fish.photo.open("rb")
        except (FileNotFoundError, OSError):
            raise Http404("Photo file not found.")
        response = FileResponse(fish.photo, filename=fish.photo.name.split("/")[-1])
        response["Cache-Control"] = "public, max-age=86400"
        return response


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
        "has_photo": bool(profile.profile_photo),
        # Changes whenever the profile is saved, so browsers reload a new photo.
        "photo_version": profile.updated_at.isoformat() if profile.updated_at else "",
        "registration_reason": profile.registration_reason,
        "date_of_birth": profile.date_of_birth.isoformat() if profile.date_of_birth else None,
        "sex": profile.sex,
        "reviewed_at": profile.reviewed_at.isoformat() if profile.reviewed_at else None,
        "verification": get_account_verification(profile),
    }


def update_species_sold(profile, value):
    """
    Replace the fish species a vendor sells. Returns an error message,
    or None when saved.
    """
    vendor = FishVendorVerification.objects.filter(profile=profile).first()
    if profile.role.name != "Fish Vendor" or vendor is None:
        return "Only Fish Vendors can choose the fish they sell."
    if not isinstance(value, list) or not value:
        return "Select at least one fish species that you sell."
    try:
        ids = {int(item) for item in value}
    except (TypeError, ValueError):
        return "Invalid fish species."
    species = list(FishSpecies.objects.filter(id__in=ids, is_active=True))
    if len(species) != len(ids):
        return "One of the selected fish species is not available."
    vendor.species_sold.set(species)
    return None


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
@transaction.atomic
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
        if "species_sold" in request.data:
            error = update_species_sold(profile, request.data.get("species_sold"))
            if error:
                errors["species_sold"] = error
        if errors:
            transaction.set_rollback(True)
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        user.save(update_fields=["first_name", "last_name", "email"])
        profile.save(update_fields=["contact_number", "updated_at"])
    return Response(serialize_own_profile(user, profile), status=status.HTTP_200_OK)
@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAuthenticated])
def my_photo(request):
    """
    The logged-in user's own profile photo.
    GET shows it, POST (multipart "photo") replaces it, DELETE removes it.
    """
    from .validators import validate_image_upload
    from django.core.exceptions import ValidationError as DjangoValidationError

    profile = getattr(request.user, "aquatimbang_profile", None)
    if profile is None:
        raise Http404("No profile.")

    if request.method == "POST":
        upload = request.FILES.get("photo")
        if upload is None:
            return Response({"photo": "Choose a photo to upload."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_image_upload(upload)
        except DjangoValidationError as error:
            return Response({"photo": " ".join(error.messages)}, status=status.HTTP_400_BAD_REQUEST)
        old = profile.profile_photo.name if profile.profile_photo else ""
        profile.profile_photo = upload
        profile.save(update_fields=["profile_photo", "updated_at"])
        if old and old != profile.profile_photo.name:
            profile.profile_photo.storage.delete(old)
        log_activity(request.user, "updated", "Profile photo", request.user.pk, request.user.username)
        return Response(serialize_own_profile(request.user, profile))

    if request.method == "DELETE":
        if profile.profile_photo:
            profile.profile_photo.delete(save=False)
            profile.profile_photo = None
            profile.save(update_fields=["profile_photo", "updated_at"])
            log_activity(request.user, "deleted", "Profile photo", request.user.pk, request.user.username)
        return Response(serialize_own_profile(request.user, profile))

    if not profile.profile_photo:
        raise Http404("No profile photo.")
    try:
        profile.profile_photo.open("rb")
    except (FileNotFoundError, OSError):
        raise Http404("Profile photo not found.")
    return FileResponse(profile.profile_photo, filename=profile.profile_photo.name.split("/")[-1])


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
    from .authentication import logged_in_user_ids, presence
    logged_in = logged_in_user_ids()
    results = []
    for vendor in vendors:
        verification = getattr(vendor, "vendor_verification", None)
        results.append({
            **presence(vendor, logged_in),
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
def _market_label(source):
    """The market name from a price's source, or "" for generic sources."""
    text = (source or "").strip()
    generic = {"", "lgu price entry", "imported price history", "dvfm historical data", "demo data"}
    if text.lower() in generic or text.lower().startswith(("imported", "simulated", "demo")):
        return ""
    return text[:80]


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
    # Latest official price per fish and municipality, for the public
    # "Today's Prices" board. Every active fish with a published price is
    # shown (with its date), however old the price is.
    today_prices = []
    if latest:
        from datetime import timedelta
        seen = set()
        recent = (
            PriceRecord.objects.filter(
                status=PriceRecord.STATUS_PUBLISHED,
                fish_species__is_active=True,
            )
            .select_related("fish_species", "municipality", "market")
            .order_by("-recorded_date", "-id")
        )
        for record in recent:
            key = (record.fish_species_id, record.municipality_id, record.market_id)
            if key in seen:
                continue
            seen.add(key)
            fish = record.fish_species
            today_prices.append({
                "fish_id": fish.id,
                "fish_name": fish.name,
                "scientific_name": fish.scientific_name,
                "has_photo": bool(fish.photo),
                "updated_at": fish.updated_at.isoformat(),
                "municipality_id": record.municipality_id,
                "municipality_name": record.municipality.name,
                "price_per_kg": record.price_per_kg,
                "recorded_date": record.recorded_date,
                # Market the LGU checked (e.g. Pasil Fish Market), when one was given.
                "market": record.market.name if record.market_id else _market_label(record.source),
                "stalls_checked": len(record.sampled_prices or []),
            })
            if len(today_prices) >= 500:
                break
        today_prices.sort(key=lambda row: (row["fish_name"], row["municipality_name"]))
    return Response(
        {
            "featured_prices": featured,
            "today_prices": today_prices,
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
# DATA MINING: LEARNED ANOMALY DETECTION AND MARKET INSIGHTS
# ============================================================
def _lgu_or_admin(request):
    if approved_role(request.user) not in ("LGU Officer", "Administrator"):
        raise PermissionDenied("Only LGU Officers and Administrators can use price insights.")


def _species_and_place(request, required=True):
    from django.core.exceptions import ObjectDoesNotExist
    from rest_framework.exceptions import ValidationError as DRFValidationError
    try:
        species = FishSpecies.objects.get(pk=int(request.query_params.get("species", ""))) if (
            required or request.query_params.get("species")) else None
    except (ValueError, ObjectDoesNotExist):
        raise DRFValidationError({"species": "Choose a valid fish species."})
    try:
        place = Municipality.objects.get(pk=int(request.query_params.get("municipality", ""))) if (
            required or request.query_params.get("municipality")) else None
    except (ValueError, ObjectDoesNotExist):
        raise DRFValidationError({"municipality": "Choose a valid municipality."})
    return species, place


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def price_check(request):
    """
    Is a price unusual? GET /api/insights/price-check/?species=&municipality=&price=&date=
    Compares it with the normal range learned from past published prices.
    """
    from datetime import date as _date
    from .insights import check_price
    _lgu_or_admin(request)
    species, place = _species_and_place(request)
    try:
        price = Decimal(str(request.query_params.get("price", "")))
        if not price.is_finite() or price <= 0:
            raise InvalidOperation
    except (InvalidOperation, ValueError):
        return Response({"price": "Enter a valid price."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        day = _date.fromisoformat(request.query_params.get("date") or timezone.localdate().isoformat())
    except ValueError:
        return Response({"date": "Use the date format YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
    from .models import Market
    market = Market.objects.filter(pk=request.query_params.get("market") or 0, municipality=place).first() \
        if str(request.query_params.get("market") or "").isdigit() else None
    return Response(check_price(species, place, price, day, market=market))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def price_outliers(request):
    """Prices of the last ?days= (default 30) that are unusual for their fish and municipality."""
    from datetime import timedelta
    from .insights import current_params, find_outliers
    _lgu_or_admin(request)
    try:
        days = max(1, min(365, int(request.query_params.get("days", 30))))
    except ValueError:
        days = 30
    since = timezone.localdate() - timedelta(days=days)
    records = PriceRecord.objects.filter(recorded_date__gte=since).exclude(
        status__in=[PriceRecord.STATUS_REJECTED, PriceRecord.STATUS_WITHDRAWN]
    )
    params = current_params()
    return Response({"days": days, "window_days": params["window_days"], "outliers": find_outliers(records, params)[:100]})


def _cached_rules(species_id, place_id, days, params):
    """mine_rules, reused until prices, external factors or the cut-offs change."""
    import hashlib
    from django.core.cache import cache
    from django.db.models import Max
    from .insights import mine_rules
    stamp = (
        PriceRecord.objects.aggregate(m=Max("updated_at"))["m"],
        ExternalFactor.objects.aggregate(m=Max("updated_at"))["m"],
    )
    raw = (
        f"{species_id or 0}|{place_id or 0}|{days}|"
        + "|".join(v.isoformat() if v else "-" for v in stamp)
        + "|" + "|".join(f"{k}={params[k]}" for k in sorted(params))
    )
    key = "market-insights:" + hashlib.sha1(raw.encode()).hexdigest()
    result = cache.get(key)
    if result is None:
        result = mine_rules(species_id, place_id, days, params)
        cache.set(key, result, 60 * 30)
    return result


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def market_insights(request):
    """Association rules: which conditions go with prices above/below usual."""
    from .insights import CONDITION_LABELS, current_params
    _lgu_or_admin(request)
    species, place = _species_and_place(request, required=False)
    try:
        days = max(60, min(1500, int(request.query_params.get("days", 730))))
    except ValueError:
        days = 730
    result = _cached_rules(species.pk if species else None, place.pk if place else None, days, current_params())
    return Response({**result, "condition_labels": CONDITION_LABELS,
                     "fish": species.name if species else None, "municipality": place.name if place else None})


def _insight_settings_payload(row):
    from .insights import PARAM_LIMITS, UNUSUAL_Z, VERY_UNUSUAL_Z
    from .models import InsightSetting
    return {
        "values": row.values(),
        "defaults": InsightSetting.DEFAULTS,
        "limits": {k: {"min": lo, "max": hi, "label": label} for k, (lo, hi, label) in PARAM_LIMITS.items()},
        "fixed": {"unusual_z": UNUSUAL_Z, "very_unusual_z": VERY_UNUSUAL_Z},
        "last_reason": row.last_reason,
        "updated_by": row.updated_by.username if row.updated_by else None,
        "updated_at": row.updated_at,
    }


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def insight_settings(request):
    """
    GET: the cut-offs used by price checks and Market Insights.
    PUT: apply new cut-offs (LGU Officer or Administrator), with a reason.
    """
    from .insights import PARAM_LIMITS, clean_params
    from .models import InsightSetting
    _lgu_or_admin(request)
    row = InsightSetting.load()
    if request.method == "GET":
        return Response(_insight_settings_payload(row))

    reason = str(request.data.get("reason", "")).strip()
    if not reason:
        return Response({"reason": "Give a short reason for this change."}, status=status.HTTP_400_BAD_REQUEST)
    values, errors = clean_params(request.data)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    before = row.values()
    changes = {
        PARAM_LIMITS[k][2]: {"from": before[k], "to": values[k]}
        for k in values if values[k] != before[k]
    }
    if not changes:
        return Response({"message": "Nothing changed."}, status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        for key, value in values.items():
            setattr(row, key, value)
        row.last_reason = reason[:300]
        row.updated_by = request.user
        row.save()
        log_activity(request.user, "updated", "InsightSetting", 1, "Insight settings",
                     {"changes": changes, "reason": reason[:300]})
    row.refresh_from_db()
    return Response(_insight_settings_payload(row))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def insight_settings_preview(request):
    """
    Try new cut-offs on the saved prices without applying them: how many
    prices of the last 30 days would be flagged, and which patterns
    Market Insights would show, now versus with the new values.
    """
    from datetime import timedelta
    from .insights import clean_params, current_params, find_outliers
    _lgu_or_admin(request)
    proposed, errors = clean_params(request.data)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    current = current_params()

    since = timezone.localdate() - timedelta(days=30)
    records = PriceRecord.objects.filter(recorded_date__gte=since).exclude(
        status__in=[PriceRecord.STATUS_REJECTED, PriceRecord.STATUS_WITHDRAWN]
    )
    now_list = {row["id"]: row for row in find_outliers(records, current)}
    new_list = {row["id"]: row for row in find_outliers(records, proposed)}

    def brief(row):
        return {k: row[k] for k in ("id", "fish", "municipality", "date", "price", "usual_median", "percent_from_usual", "level")}

    def level_count(rows, level):
        return sum(1 for r in rows.values() if r["level"] == level)

    now_rules = _cached_rules(None, None, 730, current)
    new_rules = _cached_rules(None, None, 730, proposed)
    key = lambda r: (tuple(r["conditions"]), r["outcome"])
    now_keys = {key(r): r for r in now_rules["rules"]}
    new_keys = {key(r): r for r in new_rules["rules"]}

    return Response({
        "current": current,
        "proposed": proposed,
        "outliers": {
            "days": 30,
            "current": {"total": len(now_list), "unusual": level_count(now_list, "unusual"), "very_unusual": level_count(now_list, "very_unusual")},
            "proposed": {"total": len(new_list), "unusual": level_count(new_list, "unusual"), "very_unusual": level_count(new_list, "very_unusual")},
            "no_longer_flagged": [brief(r) for i, r in now_list.items() if i not in new_list][:50],
            "newly_flagged": [brief(r) for i, r in new_list.items() if i not in now_list][:50],
        },
        "rules": {
            "current": len(now_rules["rules"]),
            "proposed": len(new_rules["rules"]),
            "removed": [r["text"] for k, r in now_keys.items() if k not in new_keys],
            "added": [r["text"] for k, r in new_keys.items() if k not in now_keys],
        },
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def public_fish_profile(request, fish_id):
    """
    Public "fish profile" for the landing page: the fish, its latest
    official price in one municipality, the change from a week earlier,
    the last 30 days of published prices, and any closed season now.
    Only published prices are shown.
    """
    from datetime import timedelta
    from .models import ClosedFishingSeason

    fish = FishSpecies.objects.filter(pk=fish_id, is_active=True).first()
    if fish is None:
        return Response({"message": "Fish not found."}, status=status.HTTP_404_NOT_FOUND)
    published = PriceRecord.objects.filter(status=PriceRecord.STATUS_PUBLISHED, fish_species=fish)
    municipality = None
    if request.query_params.get("municipality"):
        try:
            municipality = Municipality.objects.get(pk=int(request.query_params["municipality"]))
        except (ValueError, Municipality.DoesNotExist):
            return Response({"message": "Municipality not found."}, status=status.HTTP_404_NOT_FOUND)
        published = published.filter(municipality=municipality)

    latest = published.select_related("municipality").order_by("-recorded_date", "-id").first()
    if latest is None:
        return Response({"message": f"No official price for {fish.name} yet."}, status=status.HTTP_404_NOT_FOUND)
    municipality = municipality or latest.municipality
    published = published.filter(municipality=municipality)

    week_ago = published.filter(recorded_date__lte=latest.recorded_date - timedelta(days=7)).order_by("-recorded_date", "-id").first()
    change = None
    if week_ago and week_ago.price_per_kg:
        change = round(float((latest.price_per_kg - week_ago.price_per_kg) / week_ago.price_per_kg * 100), 1)

    start = latest.recorded_date - timedelta(days=29)
    history = list(
        published.filter(recorded_date__gte=start)
        .order_by("recorded_date", "id")
        .values_list("recorded_date", "price_per_kg")
    )
    by_day = {}
    for day, price in history:
        by_day[day] = float(price)  # one price per day (latest wins)
    prices = list(by_day.values())

    today = timezone.localdate()
    seasons = [
        {"name": s.name, "area": s.area, "dates": f"{s.start_month}/{s.start_day} - {s.end_month}/{s.end_day}", "notes": s.notes}
        for s in ClosedFishingSeason.objects.filter(is_active=True, species=fish)
        if s.covers(today)
    ]
    other_places = list(
        PriceRecord.objects.filter(status=PriceRecord.STATUS_PUBLISHED, fish_species=fish)
        .exclude(municipality=municipality)
        .order_by("municipality__name")
        .values_list("municipality__name", flat=True)
        .distinct()[:10]
    )

    return Response({
        "fish": {
            "id": fish.id,
            "name": fish.name,
            "scientific_name": fish.scientific_name,
            "description": fish.description,
            "has_photo": bool(fish.photo),
            "photo_credit": fish.photo_credit,
            "updated_at": fish.updated_at.isoformat(),
        },
        "municipality": {"id": municipality.id, "name": municipality.name, "province": municipality.province},
        "latest": {
            "price_per_kg": float(latest.price_per_kg),
            "recorded_date": latest.recorded_date,
            "published_at": latest.published_at,
            "is_correction": latest.is_correction,
        },
        "week_ago": (
            {"price_per_kg": float(week_ago.price_per_kg), "recorded_date": week_ago.recorded_date} if week_ago else None
        ),
        "weekly_change_percent": change,
        "history": [{"date": day, "price": price} for day, price in by_day.items()],
        "stats_30_days": (
            {"low": min(prices), "high": max(prices), "average": round(sum(prices) / len(prices), 2), "days": len(prices)}
            if prices else None
        ),
        "closed_seasons_now": seasons,
        "also_priced_in": other_places,
    })


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
        "documents": {"profile_photo": bool(profile.profile_photo)},
        "registration_reason": profile.registration_reason,
        "species_sold": [],
        # Personal details from the registration form, for the reviewer.
        "personal": {
            "date_of_birth": profile.date_of_birth.isoformat() if profile.date_of_birth else None,
            "sex": profile.sex,
            "contact_number": profile.contact_number,
            "email": profile.user.email,
        },
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
            verification["documents"].update({
                "permit": bool(vendor.permit_document),
                "stall_photo": bool(vendor.stall_photo),
            })
            verification["species_sold"] = [
                {
                    "id": fish.id,
                    "name": fish.name,
                    "has_photo": bool(fish.photo),
                    "updated_at": fish.updated_at.isoformat(),
                }
                for fish in vendor.species_sold.order_by("name")
            ]
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
            verification["documents"].update({
                "authorization": bool(
                    officer.authorization_document
                ),
            })
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
    species = FishSpecies.objects.filter(is_active=True).order_by("name")
    markets = Market.objects.filter(is_active=True, municipality__is_active=True).order_by("name")
    return Response({
        "markets": [
            {"id": market.id, "name": market.name, "municipality": market.municipality_id}
            for market in markets
        ],
        "fish_species": [
            {
                "id": fish.id,
                "name": fish.name,
                "has_photo": bool(fish.photo),
                "updated_at": fish.updated_at.isoformat(),
            }
            for fish in species
        ],
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
    Allow Administrators, LGU Officers reviewing Fish Vendors in their
    municipality, and the account owner to view registration documents.
    """
    reviewer_role = approved_role(request.user)
    if request.user.pk == user_id:
        pass  # Anyone may view the documents they uploaded themselves.
    elif reviewer_role == "LGU Officer":
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
        "profile-photo": (
            UserProfile,
            "profile_photo",
        ),
    } 
    # Reject unsupported document types.
    if document_type not in document_fields:
        raise Http404("Document type not found.")
    model, field_name = document_fields[document_type]
    # Find the verification record belonging to the user.
    lookup = {"user_id": user_id} if model is UserProfile else {"profile__user_id": user_id}
    try:
        verification = model.objects.get(**lookup)
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
    http_method_names = ["get", "post", "patch", "head", "options"]

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

    def own_pending_suggestion(self):
        """The vendor's own suggestion, if it is still waiting for review."""
        if self.get_role() != "Fish Vendor":
            raise PermissionDenied("Only the Fish Vendor who submitted a suggestion can change it.")
        suggestion = self.get_object()
        if suggestion.status != VendorPriceSuggestion.STATUS_PENDING:
            raise PermissionDenied("Only suggestions that are still pending review can be changed.")
        return suggestion

    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        """A vendor edits the price or comment of their own pending suggestion."""
        suggestion = self.own_pending_suggestion()
        changes = {key: request.data[key] for key in ("suggested_price", "comment") if key in request.data}
        if not changes:
            return Response({"message": "Nothing to change."}, status=status.HTTP_400_BAD_REQUEST)
        before = {"suggested_price": str(suggestion.suggested_price), "comment": suggestion.comment}
        serializer = self.get_serializer(suggestion, data=changes, partial=True)
        serializer.is_valid(raise_exception=True)
        suggestion = serializer.save()
        after = {"suggested_price": str(suggestion.suggested_price), "comment": suggestion.comment}
        ActivityLog.objects.create(
            actor=request.user,
            actor_username=request.user.username,
            actor_role="Fish Vendor",
            action="updated",
            target_type="VendorPriceSuggestion",
            target_id=suggestion.pk,
            target_name=suggestion.fish_species.name,
            details={"changes": {
                field: {"from": before[field], "to": after[field]}
                for field in after if before[field] != after[field]
            }},
        )
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def withdraw(self, request, pk=None):
        """A vendor withdraws their own pending suggestion; it is kept as Withdrawn."""
        suggestion = self.own_pending_suggestion()
        suggestion.status = VendorPriceSuggestion.STATUS_WITHDRAWN
        suggestion.save(update_fields=["status", "updated_at"])
        ActivityLog.objects.create(
            actor=request.user,
            actor_username=request.user.username,
            actor_role="Fish Vendor",
            action="withdrawn",
            target_type="VendorPriceSuggestion",
            target_id=suggestion.pk,
            target_name=suggestion.fish_species.name,
            details={"suggested_price": str(suggestion.suggested_price)},
        )
        return Response(self.get_serializer(suggestion).data)

    @action(detail=False, methods=["get"], url_path="community-average")
    def community_average(self, request):
        """
        Average of LGU-reviewed and adopted vendor suggestions per fish and
        municipality, from the last ?days= (default 30). Vendor names are
        never included.
        """
        self.get_role()  # Require an approved AquaTimbang account.
        from datetime import timedelta
        from django.db.models import Avg, Count, Max, Q
        try:
            days = max(7, min(365, int(request.query_params.get("days", 30))))
        except ValueError:
            days = 30
        adopted = Q(status=VendorPriceSuggestion.STATUS_ADOPTED)
        rows = (
            VendorPriceSuggestion.objects
            .filter(
                status__in=[VendorPriceSuggestion.STATUS_REVIEWED, VendorPriceSuggestion.STATUS_ADOPTED],
                suggested_price__gt=0,
                created_at__gte=timezone.now() - timedelta(days=days),
            )
            .values("municipality_id", "municipality__name", "fish_species_id", "fish_species__name")
            .annotate(
                average_price=Avg("suggested_price"),
                submission_count=Count("id"),
                adopted_count=Count("id", filter=adopted),
                adopted_average=Avg("suggested_price", filter=adopted),
                latest_adopted_at=Max("reviewed_at", filter=adopted),
            )
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
                "adopted_count": row["adopted_count"],
                "reviewed_count": row["submission_count"] - row["adopted_count"],
                "adopted_average": round(row["adopted_average"], 2) if row["adopted_average"] is not None else None,
                "latest_adopted_at": row["latest_adopted_at"],
                "days": days,
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
from .models import ClosedFishingSeason, ExternalFactor, ForecastRun, Prediction
from .serializers import ClosedFishingSeasonSerializer, ExternalFactorSerializer, ForecastRunSerializer
from .explanations import explain_price

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


class ClosedFishingSeasonViewSet(viewsets.ModelViewSet):
    """
    BFAR closed fishing seasons. Every approved user can read them;
    LGU Officers and Administrators can add, edit and delete them.
    """

    serializer_class = ClosedFishingSeasonSerializer
    authentication_classes = [ExpiringTokenAuthentication]
    permission_classes = [IsAuthenticated]
    queryset = ClosedFishingSeason.objects.prefetch_related("species").all()

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        role = approved_role(request.user)
        if role is None:
            raise PermissionDenied("An approved account is required.")
        if request.method not in ("GET", "HEAD", "OPTIONS") and role not in ("LGU Officer", "Administrator"):
            raise PermissionDenied("Only LGU Officers and Administrators can change closed fishing seasons.")

    def _details(self, season):
        return {
            "area": season.area,
            "dates": f"{season.start_month}/{season.start_day} - {season.end_month}/{season.end_day}",
            "species": [fish.name for fish in season.species.all()],
            "is_active": season.is_active,
        }

    @transaction.atomic
    def perform_create(self, serializer):
        season = serializer.save()
        log_activity(self.request.user, "created", "ClosedFishingSeason", season.pk, season.name, self._details(season))

    @transaction.atomic
    def perform_update(self, serializer):
        season = serializer.save()
        log_activity(self.request.user, "updated", "ClosedFishingSeason", season.pk, season.name, self._details(season))

    @transaction.atomic
    def perform_destroy(self, instance):
        log_activity(self.request.user, "deleted", "ClosedFishingSeason", instance.pk, instance.name, self._details(instance))
        instance.delete()


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def price_explanation(request):
    """
    Explain this week's price change for ?species=<id>[&municipality=<id>]
    using weather, fuel, holidays, closed seasons and monthly patterns.
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
    return Response(explain_price(species, municipality))


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


def user_row(profile, logged_in_ids=None):
    """One account as shown in the Administrator's user list."""
    from .authentication import presence
    user = profile.user
    return {
        **presence(profile, logged_in_ids),
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
        "archived_at": profile.archived_at.isoformat() if profile.archived_at else None,
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
    from .archiving import archive_once_a_day
    archive_once_a_day()

    if request.method == "GET":
        profiles = UserProfile.objects.select_related(
            "user", "role", "municipality", "reviewed_by"
        ).order_by("-user__date_joined")
        from .authentication import logged_in_user_ids
        logged_in = logged_in_user_ids()
        return Response([user_row(profile, logged_in) for profile in profiles], status=status.HTTP_200_OK)

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
            # The Administrator chose this first password, so the user replaces it at first login.
            must_change_password=True,
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
    role_reason = str(request.data.get("role_change_reason") or "").strip()[:300]
    if new_role is not None and new_role.pk != profile.role_id:
        if is_self:
            return Response({"role": "You cannot change your own role."}, status=status.HTTP_400_BAD_REQUEST)
        if is_active_admin and active_admin_count(exclude_user_id=user.pk) == 0:
            return Response({"role": "Keep at least one active Administrator."}, status=status.HTTP_400_BAD_REQUEST)
        # A role change is verified and explained first, so the log says why.
        if len(role_reason) < 10:
            return Response(
                {"role_change_reason": "Write why the role is changing (at least 10 characters)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
            details = {"changes": changes}
            if "role" in changes:
                details["reason"] = role_reason
            log_activity(
                request.user,
                "role changed" if "role" in changes else "updated",
                "UserAccount", user.pk, user.username, details,
            )
    if "role" in changes:
        send_account_email(
            user,
            "AquaTimbang: your role was changed",
            f"Hello {user.get_full_name() or user.username},\n\n"
            f"An Administrator changed your AquaTimbang role from {changes['role']['from']} to {changes['role']['to']}.\n"
            f"Reason: {role_reason}\n\n"
            f"Log in again to use your new access. If you did not expect this, contact your Administrator.\n\n— AquaTimbang",
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
        was_archived = profile.archived_at is not None
        profile.is_active = active
        if active:
            profile.archived_at = None
        profile.save(update_fields=["is_active", "archived_at", "updated_at"])
        user.is_active = active
        user.save(update_fields=["is_active"])
        if not active:
            end_sessions(user)
        log_activity(request.user, "activated" if active else "deactivated", "UserAccount", user.pk, user.username, {
            "role": profile.role.name,
            **({"was_archived": True} if active and was_archived else {}),
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

    temporary = make_temporary_password()
    with transaction.atomic():
        user.set_password(temporary)
        user.save(update_fields=["password"])
        UserProfile.objects.filter(user=user).update(must_change_password=True)
        end_sessions(user)
        log_activity(request.user, "password reset", "UserAccount", user.pk, user.username, {"method": "temporary password"})
    return Response(
        {
            "message": f"Password reset for {user.username}. Give them this temporary password; they must choose a new one when they log in.",
            "temporary_password": temporary,
        },
        status=status.HTTP_200_OK,
    )


# Simple words for temporary passwords: easy to read aloud and type.
TEMPORARY_PASSWORD_WORDS = [
    "Bangus", "Tilapia", "Tamban", "Tulingan", "Alumahan", "Galunggong", "Danggit", "Dilis",
    "Espada", "Hito", "Dalag", "Sapsap", "Bisugo", "Pampano", "Tanigue", "Matambaka",
    "Banca", "Pantalan", "Lambat", "Timbang", "Merkado", "Dagat", "Isla", "Baybay",
]


def make_temporary_password():
    """e.g. "Bangus-Lambat-4821": two words and four digits, no look-alike letters."""
    first, second = secrets.SystemRandom().sample(TEMPORARY_PASSWORD_WORDS, 2)
    return f"{first}-{second}-{secrets.randbelow(9000) + 1000}"


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send_user_reset_link(request, user_id):
    """
    Administrator: email the user a link to choose a new password
    themselves, so nobody has to pass a password around.
    """
    refused = require_admin(request)
    if refused:
        return refused
    user = User.objects.filter(pk=user_id).select_related("aquatimbang_profile").first()
    if user is None:
        return Response({"message": "Account not found."}, status=status.HTTP_404_NOT_FOUND)
    if user.pk == request.user.pk:
        return Response({"message": "Use My Profile to change your own password."}, status=status.HTTP_400_BAD_REQUEST)
    if not user.email:
        return Response(
            {"message": f"{user.username} has no email address. Add one, or give a temporary password instead."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    sent = send_password_reset_email(user)
    if not sent:
        return Response(
            {"message": "The email could not be sent. Check the email settings, or give a temporary password instead."},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    log_activity(request.user, "password reset", "UserAccount", user.pk, user.username, {"method": "email link", "email": user.email})
    return Response({"message": f"A reset link was emailed to {user.email}. It works for 1 hour."})


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
        UserProfile.objects.filter(user=request.user).update(must_change_password=False)
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
            # Email the owner once the lock is saved (UC-1 3d).
            locked_until = record.locked_until
            transaction.on_commit(lambda: send_lockout_notice(user, locked_until))
        return lockout_response(record.locked_until)
    record.save()
    return None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def presence_heartbeat(request):
    """Open pages call this every minute; authentication records last_seen."""
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_user(request):
    """End this session on the server by deleting its token."""
    log_activity(request.user, "logged out", "Authentication", request.user.pk, request.user.username)
    if request.auth is not None:
        request.auth.delete()
    UserProfile.objects.filter(user=request.user).update(last_seen=timezone.now())
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
            for field in ("min_price_per_kg", "max_price_per_kg", "first_class_min_price_per_kg", "first_class_max_price_per_kg")
            if before[field] != after[field]
        }
        if changes:
            log_activity(request.user, "updated", "SystemSetting", 1, "Price range", {"changes": changes})
    return Response(after)


# ============================================================
# FAIR PRICE CALCULATOR HISTORY (UC-3, Table 20)
# ============================================================
from .models import ReportLog, WeightEntry

# Largest weight accepted in one calculation, in kilograms.
MAX_WEIGHT_KG = Decimal("10000")


def weight_entry_row(entry):
    return {
        "id": entry.id,
        "fish_species": entry.fish_species_id,
        "fish_name": entry.fish_species.name,
        "municipality": entry.municipality_id,
        "municipality_name": entry.municipality.name,
        "weight_kg": str(entry.weight_kg),
        "price_per_kg": str(entry.price_per_kg),
        "computed_price": str(entry.computed_price),
        "price_date": entry.price_record.recorded_date.isoformat() if entry.price_record else None,
        "created_at": entry.created_at.isoformat(),
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def weight_entries(request):
    """
    GET: your saved calculations. POST {fish_species, municipality, weight_kg}:
    compute weight × the latest published price and save it.
    """
    if approved_role(request.user) is None:
        return Response({"message": "An approved account is required."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        entries = WeightEntry.objects.filter(user=request.user).select_related(
            "fish_species", "municipality", "price_record"
        )[:200]
        return Response([weight_entry_row(e) for e in entries])

    try:
        weight = Decimal(str(request.data.get("weight_kg"))).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError):
        return Response({"weight_kg": "Enter the weight in kilograms."}, status=status.HTTP_400_BAD_REQUEST)
    if weight <= 0:
        return Response({"weight_kg": "Weight must be greater than zero."}, status=status.HTTP_400_BAD_REQUEST)
    if weight > MAX_WEIGHT_KG:
        return Response({"weight_kg": f"Weight must be at most {MAX_WEIGHT_KG:,} kg."}, status=status.HTTP_400_BAD_REQUEST)

    species = FishSpecies.objects.filter(pk=request.data.get("fish_species")).first() if str(request.data.get("fish_species", "")).isdigit() else None
    municipality = Municipality.objects.filter(pk=request.data.get("municipality")).first() if str(request.data.get("municipality", "")).isdigit() else None
    if species is None or municipality is None:
        return Response({"message": "Choose a fish species and municipality."}, status=status.HTTP_400_BAD_REQUEST)

    # UC-3 step 4: the latest LGU-validated (published) price per kg.
    latest = (
        PriceRecord.objects.filter(fish_species=species, municipality=municipality, status=PriceRecord.STATUS_PUBLISHED)
        .order_by("-recorded_date", "-id")
        .first()
    )
    if latest is None:
        return Response(
            {"message": "No current price found for this species. Please select another."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    entry = WeightEntry.objects.create(
        user=request.user,
        fish_species=species,
        municipality=municipality,
        price_record=latest,
        weight_kg=weight,
        price_per_kg=latest.price_per_kg,
        computed_price=(weight * latest.price_per_kg).quantize(Decimal("0.01")),
    )
    return Response(weight_entry_row(entry), status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_weight_entry(request, entry_id):
    """Remove one of your saved calculations."""
    deleted, _ = WeightEntry.objects.filter(pk=entry_id, user=request.user).delete()
    if not deleted:
        return Response({"message": "Calculation not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response({"message": "Calculation removed."})


# ============================================================
# GENERATED REPORTS LOG (UC-5, Table 22)
# ============================================================

def report_row(report):
    user = report.generated_by
    return {
        "id": report.id,
        "report_type": report.report_type,
        "parameters": report.parameters,
        "format": report.format,
        "row_count": report.row_count,
        "generated_by": user.username if user else None,
        "generated_by_name": (user.get_full_name() or user.username) if user else None,
        "generated_by_role": approved_role(user) if user else None,
        "generated_at": report.generated_at.isoformat(),
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def reports(request):
    """
    GET: generated reports (Administrators see all, LGU Officers their own).
    POST {report_type, parameters, format, row_count}: record an export.
    """
    role = approved_role(request.user)
    if role not in ("LGU Officer", "Administrator"):
        return Response({"message": "LGU Officer or Administrator access required."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        logs = ReportLog.objects.select_related("generated_by")
        if role == "LGU Officer":
            logs = logs.filter(generated_by=request.user)
        return Response([report_row(r) for r in logs[:200]])

    report_type = request.data.get("report_type")
    fmt = str(request.data.get("format", "")).upper()
    parameters = request.data.get("parameters") or {}
    try:
        row_count = max(0, int(request.data.get("row_count", 0)))
    except (TypeError, ValueError):
        row_count = 0
    if not isinstance(report_type, str) or not report_type.strip() or len(report_type) > 100:
        return Response({"report_type": "Give the report type."}, status=status.HTTP_400_BAD_REQUEST)
    if fmt not in (ReportLog.FORMAT_PDF, ReportLog.FORMAT_CSV):
        return Response({"format": "Format must be PDF or CSV."}, status=status.HTTP_400_BAD_REQUEST)
    if not isinstance(parameters, dict):
        return Response({"parameters": "Parameters must be an object."}, status=status.HTTP_400_BAD_REQUEST)

    report = ReportLog.objects.create(
        generated_by=request.user,
        report_type=report_type.strip(),
        parameters=parameters,
        format=fmt,
        row_count=row_count,
    )
    return Response(report_row(report), status=status.HTTP_201_CREATED)


# ============================================================
# SYSTEM ANNOUNCEMENTS AND MARKETS
# ============================================================
from .models import Announcement, Market
from .serializers import AnnouncementSerializer, MarketSerializer

AUDIENCE_FOR_ROLE = {
    "Fish Vendor": Announcement.AUDIENCE_VENDORS,
    "LGU Officer": Announcement.AUDIENCE_LGU,
}


def log_admin_change(user, action, target_type, instance, name, details=None):
    ActivityLog.objects.create(
        actor=user,
        actor_username=user.username,
        actor_role="Administrator",
        action=action,
        target_type=target_type,
        target_id=instance.pk,
        target_name=name,
        details=details or {},
    )


class AdminWritableViewSet(viewsets.ModelViewSet):
    """Approved users may read; only Administrators may change."""
    authentication_classes = [ExpiringTokenAuthentication]
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def role(self):
        role = approved_role(self.request.user)
        if role is None:
            raise PermissionDenied("An approved account is required.")
        return role

    def check_admin(self):
        if self.role() != "Administrator":
            raise PermissionDenied("Only Administrators can change this.")


class AnnouncementViewSet(AdminWritableViewSet):
    """
    Administrators manage announcements. Other users see the active
    announcements meant for everyone or for their role.
    """
    serializer_class = AnnouncementSerializer

    def get_queryset(self):
        role = self.role()
        queryset = Announcement.objects.select_related("created_by")
        if role == "Administrator":
            return queryset
        return queryset.filter(
            is_active=True,
            audience__in=[Announcement.AUDIENCE_ALL, AUDIENCE_FOR_ROLE.get(role, "")],
        )

    @transaction.atomic
    def perform_create(self, serializer):
        self.check_admin()
        item = serializer.save(created_by=self.request.user)
        log_admin_change(self.request.user, "created", "Announcement", item, item.title, {"audience": item.audience})

    @transaction.atomic
    def perform_update(self, serializer):
        self.check_admin()
        item = serializer.save()
        action = "updated"
        if set(serializer.validated_data) == {"is_active"}:
            action = "activated" if item.is_active else "deactivated"
        log_admin_change(self.request.user, action, "Announcement", item, item.title)

    @transaction.atomic
    def perform_destroy(self, instance):
        self.check_admin()
        log_admin_change(self.request.user, "deleted", "Announcement", instance, instance.title)
        instance.delete()


class MarketViewSet(AdminWritableViewSet):
    """
    Public markets per municipality. Administrators manage the list;
    other users see the active markets.
    """
    serializer_class = MarketSerializer

    def get_queryset(self):
        queryset = Market.objects.select_related("municipality")
        if self.role() != "Administrator":
            queryset = queryset.filter(is_active=True)
        municipality = self.request.query_params.get("municipality")
        if municipality:
            queryset = queryset.filter(municipality_id=municipality)
        return queryset

    def get_serializer_context(self):
        # How many registered vendors named each market.
        counts = {}
        rows = FishVendorVerification.objects.values_list("market_name", "profile__municipality_id")
        for name, municipality_id in rows:
            key = (" ".join((name or "").split()).lower(), municipality_id)
            counts[key] = counts.get(key, 0) + 1
        return {**super().get_serializer_context(), "vendor_counts": counts}

    @transaction.atomic
    def perform_create(self, serializer):
        self.check_admin()
        item = serializer.save()
        log_admin_change(self.request.user, "created", "Market", item, item.name, {"municipality": item.municipality.name})

    @transaction.atomic
    def perform_update(self, serializer):
        self.check_admin()
        item = serializer.save()
        action = "updated"
        if set(serializer.validated_data) == {"is_active"}:
            action = "activated" if item.is_active else "deactivated"
        log_admin_change(self.request.user, action, "Market", item, item.name)

    @transaction.atomic
    def perform_destroy(self, instance):
        self.check_admin()
        log_admin_change(self.request.user, "deleted", "Market", instance, instance.name)
        instance.delete()


# ============================================================
# PASSWORD RESET BY EMAIL AND LOCKOUT NOTICES (UC-1 3d, 3e)
# ============================================================
import logging
from urllib.parse import urlencode

from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework.decorators import throttle_classes
from rest_framework.throttling import AnonRateThrottle

email_logger = logging.getLogger("aquatimbang.email")


def send_account_email(user, subject, body):
    """Send an email to a user; a mail failure never breaks the request."""
    if not user.email:
        return False
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [user.email])
        return True
    except Exception:  # SMTP errors, bad settings, no network
        email_logger.exception("Could not send %r to user %s", subject, user.pk)
        return False


def send_lockout_notice(user, locked_until):
    minutes = settings.LOGIN_LOCKOUT_MINUTES
    send_account_email(
        user,
        "AquaTimbang: your account was locked",
        f"Hello {user.get_full_name() or user.username},\n\n"
        f"Someone entered the wrong password for your AquaTimbang account "
        f"{settings.LOGIN_MAX_ATTEMPTS} times in a row, so the account is locked for {minutes} minutes "
        f"(until {timezone.localtime(locked_until):%B %d, %Y %I:%M %p}).\n\n"
        f"If this was you, wait and try again, or use \"Forgot password?\" on the login page.\n"
        f"If it was not you, reset your password and tell your administrator.\n\n"
        f"— AquaTimbang",
    )


def send_password_reset_email(user):
    """Email a one-hour link for choosing a new password. Returns True when sent."""
    query = urlencode({
        "reset_uid": urlsafe_base64_encode(force_bytes(user.pk)),
        "reset_token": default_token_generator.make_token(user),
    })
    link = f"{settings.FRONTEND_URL}?{query}"
    return send_account_email(
        user,
        "AquaTimbang: reset your password",
        f"Hello {user.get_full_name() or user.username},\n\n"
        f"Open this link to choose a new password for your AquaTimbang account ({user.username}):\n\n"
        f"{link}\n\n"
        f"The link works once and expires in 1 hour. If you did not ask for this, ignore this email; "
        f"your password stays the same.\n\n— AquaTimbang",
    )


class PasswordResetThrottle(AnonRateThrottle):
    scope = "password_reset"
    rate = "5/hour"


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetThrottle])
def request_password_reset(request):
    """
    Email a reset link valid for one hour. The answer is the same whether
    or not the email is registered, so it cannot be used to find accounts.
    """
    email = str(request.data.get("email", "")).strip()
    if not email:
        return Response({"email": "Enter your email address."}, status=status.HTTP_400_BAD_REQUEST)
    users = User.objects.filter(email__iexact=email, is_active=True).select_related("aquatimbang_profile")
    for user in users:
        profile = getattr(user, "aquatimbang_profile", None)
        if profile is None or profile.account_status != UserProfile.STATUS_APPROVED or not profile.is_active:
            continue
        send_password_reset_email(user)
        log_activity(user, "password reset requested", "Authentication", user.pk, user.username)
    return Response({
        "message": "If that email belongs to an approved account, a reset link has been sent. "
                   "Check your inbox (and spam folder). The link expires in 1 hour."
    })


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetThrottle])
def confirm_password_reset(request):
    """Set a new password using the link from the reset email."""
    invalid = Response(
        {"message": "This reset link is invalid or has expired. Please request a new one."},
        status=status.HTTP_400_BAD_REQUEST,
    )
    try:
        user_id = force_str(urlsafe_base64_decode(str(request.data.get("uid", ""))))
        user = User.objects.get(pk=user_id, is_active=True)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return invalid
    if not default_token_generator.check_token(user, str(request.data.get("token", ""))):
        return invalid

    password = request.data.get("new_password", "")
    if not isinstance(password, str) or not password:
        return Response({"new_password": "Enter a new password."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        validate_password(password, user)
    except DjangoValidationError as error:
        return Response({"new_password": " ".join(error.messages)}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        user.set_password(password)  # also makes the link unusable
        user.save(update_fields=["password"])
        UserProfile.objects.filter(user=user).update(must_change_password=False)
        Token.objects.filter(user=user).delete()  # log out other devices
        LoginLockout.objects.filter(username=user.username.lower()).delete()
        log_activity(user, "password reset", "Authentication", user.pk, user.username)
    return Response({"message": "Your password has been changed. You can now log in."})


# ============================================================
# FISH SCANNER - PHASE 1: COLLECT LABELLED FISH PHOTOS
# ============================================================
import io
import tempfile
import zipfile
from datetime import timedelta

from django.core.files.base import ContentFile
from PIL import Image, ImageOps

from .models import FishScanPhoto
from .serializers import FishScanPhotoSerializer

# Approved photos per fish needed before the scanner can learn it.
SCAN_TARGET_PER_FISH = 30
# Photos one user may upload per day.
SCAN_DAILY_LIMIT = 40
# Longest side of a stored photo (enough for review and training).
SCAN_MAX_SIDE = 640


def shrink_scan_photo(upload):
    """Re-save an uploaded photo as a small JPEG without EXIF (no GPS location)."""
    with Image.open(upload) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((SCAN_MAX_SIDE, SCAN_MAX_SIDE))
        buffer = io.BytesIO()
        image.save(buffer, "JPEG", quality=82, optimize=True)
    return ContentFile(buffer.getvalue(), name="scan.jpg")


class FishScanPhotoViewSet(viewsets.ModelViewSet):
    """
    Labelled fish photos for the fish scanner.
    Fish Vendors upload and see their own photos; LGU Officers and
    Administrators see all photos, approve or reject them (and fix the
    fish name), and download the approved photos for training.
    """

    serializer_class = FishScanPhotoSerializer
    authentication_classes = [ExpiringTokenAuthentication]
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def role(self):
        role = approved_role(self.request.user)
        if role is None:
            raise PermissionDenied("An approved account is required.")
        return role

    def reviewer(self):
        if self.role() not in ("LGU Officer", "Administrator"):
            raise PermissionDenied("Only LGU Officers and Administrators can review fish photos.")

    def get_queryset(self):
        role = self.role()
        queryset = FishScanPhoto.objects.select_related("fish_species", "uploaded_by", "municipality", "reviewed_by")
        if role == "Fish Vendor":
            queryset = queryset.filter(uploaded_by=self.request.user)
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        species = self.request.query_params.get("species")
        if species:
            queryset = queryset.filter(fish_species_id=species)
        return queryset

    def create(self, request, *args, **kwargs):
        from .validators import validate_image_upload
        from django.core.exceptions import ValidationError as DjangoValidationError

        self.role()
        upload = request.FILES.get("image")
        if upload is None:
            return Response({"image": "Take or choose a photo of the fish."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_image_upload(upload)
        except DjangoValidationError as error:
            return Response({"image": " ".join(error.messages)}, status=status.HTTP_400_BAD_REQUEST)

        since = timezone.now() - timedelta(days=1)
        if FishScanPhoto.objects.filter(uploaded_by=request.user, created_at__gte=since).count() >= SCAN_DAILY_LIMIT:
            return Response(
                {"message": f"You can add up to {SCAN_DAILY_LIMIT} fish photos a day. Thank you, please continue tomorrow."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        serializer = self.get_serializer(data={"fish_species": request.data.get("fish_species")})
        serializer.is_valid(raise_exception=True)
        profile = getattr(request.user, "aquatimbang_profile", None)
        scan = serializer.save(
            image=shrink_scan_photo(upload),
            uploaded_by=request.user,
            municipality=profile.municipality if profile else None,
        )
        log_activity(request.user, "uploaded", "FishScanPhoto", scan.pk, scan.fish_species.name)
        return Response(self.get_serializer(scan).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, scan):
        role = self.role()
        if role == "Fish Vendor" and scan.status != FishScanPhoto.STATUS_PENDING:
            raise PermissionDenied("Reviewed photos can only be removed by the LGU.")
        log_activity(self.request.user, "deleted", "FishScanPhoto", scan.pk, scan.fish_species.name)
        scan.image.delete(save=False)
        scan.delete()

    @action(detail=True, methods=["post"], url_path="review")
    def review(self, request, pk=None):
        """Body: {"status": "approved"|"rejected", "fish_species": <id, optional>, "note": ""}"""
        self.reviewer()
        scan = self.get_object()
        decision = request.data.get("status")
        if decision not in (FishScanPhoto.STATUS_APPROVED, FishScanPhoto.STATUS_REJECTED):
            return Response({"status": "Choose approved or rejected."}, status=status.HTTP_400_BAD_REQUEST)
        changes = {"status": {"from": scan.status, "to": decision}}
        new_fish = request.data.get("fish_species")
        if new_fish not in (None, "") and str(new_fish) != str(scan.fish_species_id):
            try:
                fish = FishSpecies.objects.get(pk=int(new_fish), is_active=True)
            except (ValueError, FishSpecies.DoesNotExist):
                return Response({"fish_species": "Choose a valid fish species."}, status=status.HTTP_400_BAD_REQUEST)
            changes["fish_species"] = {"from": scan.fish_species.name, "to": fish.name}
            scan.fish_species = fish
        scan.status = decision
        scan.review_note = str(request.data.get("note") or "").strip()[:200]
        scan.reviewed_by = request.user
        scan.reviewed_at = timezone.now()
        scan.save()
        log_activity(request.user, decision, "FishScanPhoto", scan.pk, scan.fish_species.name, {"changes": changes})
        return Response(self.get_serializer(scan).data)

    @action(detail=True, methods=["get"], url_path="image")
    def image(self, request, pk=None):
        scan = self.get_object()
        try:
            scan.image.open("rb")
        except (FileNotFoundError, OSError):
            raise Http404("Photo not found.")
        return FileResponse(scan.image, content_type="image/jpeg")

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """Photos per fish (for everyone): approved, waiting, and the target."""
        self.role()
        from django.db.models import Count, Q
        rows = (
            FishSpecies.objects.filter(is_active=True)
            .annotate(
                approved=Count("scan_photos", filter=Q(scan_photos__status=FishScanPhoto.STATUS_APPROVED)),
                pending=Count("scan_photos", filter=Q(scan_photos__status=FishScanPhoto.STATUS_PENDING)),
            )
            .order_by("name")
        )
        mine = FishScanPhoto.objects.filter(uploaded_by=request.user).count()
        return Response({
            "target": SCAN_TARGET_PER_FISH,
            "my_photos": mine,
            "species": [
                {"id": f.pk, "name": f.name, "approved": f.approved, "pending": f.pending,
                 "ready": f.approved >= SCAN_TARGET_PER_FISH}
                for f in rows
            ],
        })

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        """ZIP of approved photos, one folder per fish, ready for Teachable Machine."""
        self.reviewer()
        scans = FishScanPhoto.objects.filter(status=FishScanPhoto.STATUS_APPROVED).select_related("fish_species")
        if not scans.exists():
            return Response({"message": "No approved photos yet."}, status=status.HTTP_404_NOT_FOUND)
        archive = tempfile.SpooledTemporaryFile(max_size=20 * 1024 * 1024)
        count = 0
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_STORED) as zf:
            for scan in scans:
                try:
                    with scan.image.open("rb") as photo:
                        zf.writestr(f"{scan.fish_species.name}/photo_{scan.pk}.jpg", photo.read())
                    count += 1
                except (FileNotFoundError, OSError):
                    continue
        archive.seek(0)
        log_activity(request.user, "exported", "FishScanPhoto", 0, f"{count} approved fish photos")
        stamp = timezone.localdate().isoformat()
        return FileResponse(archive, as_attachment=True, filename=f"aquatimbang_fish_photos_{stamp}.zip", content_type="application/zip")


# ============================================================
# MESSAGES
# ============================================================
from .models import Conversation, Message


def _person(profile, logged_in=None):
    from .authentication import presence
    user = profile.user
    role = profile.role.name
    about = {}
    if role == "Fish Vendor":
        vendor = FishVendorVerification.objects.filter(profile=profile).first()
        if vendor:
            about = {"Market": vendor.market_name, "Stall": vendor.stall_number}
    elif role == "LGU Officer":
        officer = LGUOfficerVerification.objects.filter(profile=profile).first()
        if officer:
            about = {"Office": officer.department, "Position": officer.position}
    return {
        "id": user.pk,
        "name": user.get_full_name() or user.username,
        "username": user.username,
        "role": role,
        "municipality": profile.municipality.name if profile.municipality else "",
        "has_photo": bool(profile.profile_photo),
        "photo_version": profile.updated_at.isoformat() if profile.updated_at else "",
        "about": {k: v for k, v in about.items() if v},
        **presence(profile, logged_in),
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def message_person_photo(request, user_id):
    """Profile photo of someone you may message or already talk with."""
    from django.db.models import Q
    from .messaging import can_message
    _require_approved(request)
    me = request.user
    try:
        other = User.objects.select_related("aquatimbang_profile").get(pk=user_id)
    except User.DoesNotExist:
        raise Http404("Not found.")
    talking = Conversation.objects.filter(
        Q(user_low=me, user_high=other) | Q(user_low=other, user_high=me)
    ).exists()
    if not (can_message(me, other) or talking):
        raise Http404("Not found.")
    profile = getattr(other, "aquatimbang_profile", None)
    if profile is None or not profile.profile_photo:
        raise Http404("No photo.")
    try:
        profile.profile_photo.open("rb")
    except (FileNotFoundError, OSError):
        raise Http404("No photo.")
    return FileResponse(profile.profile_photo, filename=profile.profile_photo.name.split("/")[-1])


def _conversation_row(conversation, me, logged_in=None):
    other = conversation.other(me)
    profile = getattr(other, "aquatimbang_profile", None)
    last = conversation.messages.order_by("-created_at", "-id").first()
    return {
        "id": conversation.pk,
        "with": _person(profile, logged_in) if profile else {"id": other.pk, "name": other.username, "role": "", "municipality": "", "is_online": False, "last_seen": None},
        "last_message": {
            "body": last.body[:120],
            "from_me": last.sender_id == me.pk,
            "created_at": last.created_at,
        } if last else None,
        "last_message_at": conversation.last_message_at,
        "unread": conversation.messages.filter(read_at__isnull=True).exclude(sender=me).count(),
    }


def _message_row(message, me):
    return {
        "id": message.pk,
        "body": message.body,
        "from_me": message.sender_id == me.pk,
        "created_at": message.created_at,
        "read_at": message.read_at,
    }


def _require_approved(request):
    if approved_role(request.user) is None:
        raise PermissionDenied("An approved account is required.")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def message_contacts(request):
    """People this account may message."""
    from .authentication import logged_in_user_ids
    from .messaging import contacts_for
    _require_approved(request)
    logged_in = logged_in_user_ids()
    rows = [_person(p, logged_in) for p in contacts_for(request.user)]
    order = {"Administrator": 0, "LGU Officer": 1, "Fish Vendor": 2}
    rows.sort(key=lambda r: (order.get(r["role"], 9), r["name"].lower()))
    return Response(rows)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def conversations(request):
    """GET: my conversations, newest first. POST {user_id}: open one with that person."""
    from django.db.models import Q
    from .authentication import logged_in_user_ids
    from .messaging import can_message
    _require_approved(request)
    me = request.user
    if request.method == "GET":
        logged_in = logged_in_user_ids()
        rows = (
            Conversation.objects.filter(Q(user_low=me) | Q(user_high=me), last_message_at__isnull=False)
            .select_related("user_low__aquatimbang_profile__role", "user_high__aquatimbang_profile__role",
                            "user_low__aquatimbang_profile__municipality", "user_high__aquatimbang_profile__municipality")
        )
        return Response([_conversation_row(c, me, logged_in) for c in rows])

    try:
        other = User.objects.get(pk=int(request.data.get("user_id")))
    except (TypeError, ValueError, User.DoesNotExist):
        return Response({"message": "Choose who to message."}, status=status.HTTP_400_BAD_REQUEST)
    if not can_message(me, other):
        return Response({"message": "You cannot message this account."}, status=status.HTTP_403_FORBIDDEN)
    low, high = sorted([me, other], key=lambda u: u.pk)
    conversation, _ = Conversation.objects.get_or_create(user_low=low, user_high=high)
    return Response(_conversation_row(conversation, me))


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def conversation_messages(request, conversation_id):
    """
    GET ?after=<message id>: messages (newer than `after`), and marks the
    other person's messages as read. POST {body}: send a message.
    """
    from .messaging import can_message
    _require_approved(request)
    me = request.user
    try:
        conversation = Conversation.objects.select_related("user_low", "user_high").get(pk=conversation_id)
    except Conversation.DoesNotExist:
        conversation = None
    if conversation is None or not conversation.has(me):
        return Response({"message": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        rows = conversation.messages.all()
        try:
            after = int(request.query_params.get("after", 0))
        except ValueError:
            after = 0
        if after:
            rows = rows.filter(pk__gt=after)
        else:
            # The latest 200 messages on first open.
            ids = list(conversation.messages.order_by("-created_at", "-id").values_list("pk", flat=True)[:200])
            rows = rows.filter(pk__in=ids)
        conversation.messages.filter(read_at__isnull=True).exclude(sender=me).update(read_at=timezone.now())
        other_read = conversation.messages.filter(sender=me, read_at__isnull=False).order_by("-id").values_list("pk", flat=True).first()
        return Response({
            "messages": [_message_row(m, me) for m in rows],
            "last_read_by_other": other_read,
            "can_reply": can_message(me, conversation.other(me)),
        })

    body = str(request.data.get("body", "")).strip()
    if not body:
        return Response({"message": "Type a message first."}, status=status.HTTP_400_BAD_REQUEST)
    if len(body) > 2000:
        return Response({"message": "Messages can be up to 2,000 characters."}, status=status.HTTP_400_BAD_REQUEST)
    if not can_message(me, conversation.other(me)):
        return Response({"message": "You can no longer message this account."}, status=status.HTTP_403_FORBIDDEN)
    message = Message.objects.create(conversation=conversation, sender=me, body=body)
    Conversation.objects.filter(pk=conversation.pk).update(last_message_at=message.created_at)
    return Response(_message_row(message, me), status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def unread_message_count(request):
    """Total unread messages, for the sidebar badge."""
    from django.db.models import Q
    _require_approved(request)
    me = request.user
    count = Message.objects.filter(
        Q(conversation__user_low=me) | Q(conversation__user_high=me), read_at__isnull=True,
    ).exclude(sender=me).count()
    return Response({"unread": count})
