from bisect import bisect_left
from .validators import (

    validate_document_upload,

    validate_image_upload,

)

# Django REST Framework serializers convert Django model data

# into JSON and validate JSON sent from the frontend.

from rest_framework import serializers

# Django's built-in User model handles authentication accounts.

from django.contrib.auth.models import User

from django.db import transaction

# Import all AquaTimbang models needed by the API.

from .models import (

    FishSpecies,
    ActivityLog,

    Municipality,

    PriceRecord,

    Role,

    UserProfile,

    FishVendorVerification,

    LGUOfficerVerification,

)

class RegisterSerializer(serializers.Serializer):

    """

    Handles validation and creation of new AquaTimbang accounts.

    """

    # Basic Django account information.

    username = serializers.CharField(max_length=150)

    email = serializers.EmailField(required=False, allow_blank=True)

    # write_only prevents the password from being returned in JSON.

    password = serializers.CharField(

        write_only=True,

        min_length=8

    )

    # Personal information.

    first_name = serializers.CharField(max_length=150)

    last_name = serializers.CharField(max_length=150)

    # AquaTimbang role.

    role = serializers.PrimaryKeyRelatedField(

        queryset=Role.objects.all()

    )

        # ========================================================

    # FISH VENDOR VERIFICATION FIELDS

    # ========================================================

    # Public market where the fish vendor operates.

    market_name = serializers.CharField(

        max_length=150,

        required=False,

        allow_blank=True,

    )

    # Assigned market stall number.

    stall_number = serializers.CharField(

        max_length=50,

        required=False,

        allow_blank=True,

    )

    permit_number = serializers.CharField(

        max_length=100,

        required=False,

        allow_blank=True,

    )

    permit_document = serializers.FileField(

    required=False,

    validators=[validate_document_upload],

    )

    stall_photo = serializers.ImageField(

    required=False,

    validators=[validate_image_upload],

    )

    authorization_document = serializers.FileField(

    required=False,

    validators=[validate_document_upload],

)

    # Every applicant uploads a clear photo of their face.
    profile_photo = serializers.ImageField(
        validators=[validate_image_upload],
        error_messages={"required": "A profile photo is required.", "invalid": "Upload a valid JPG or PNG photo."},
    )

    # Why the applicant is registering; read by the reviewer. Required for
    # Fish Vendors only: LGU Officers are verified by their office details.
    registration_reason = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
        default="",
    )

    # Fish species a vendor sells (required for Fish Vendors).
    species_sold = serializers.PrimaryKeyRelatedField(
        queryset=FishSpecies.objects.filter(is_active=True),
        many=True,
        required=False,
    )

    # ========================================================

    # LGU OFFICER VERIFICATION FIELDS

    # ========================================================

    # Government department or office.

    department = serializers.CharField(

        max_length=150,

        required=False,

        allow_blank=True,

    )

    # Official position in the LGU.

    position = serializers.CharField(

        max_length=150,

        required=False,

        allow_blank=True,

    )

    # Official government or work email.

    official_email = serializers.EmailField(

        required=False,

        allow_blank=True,

    )

    # Employee ID or reference number.

    employee_id = serializers.CharField(

        max_length=100,

        required=False,

        allow_blank=True,

    )

    # Validate which roles can be requested

    # through public account registration.

    def validate_role(self, value):

        # Only these two roles may register publicly.

        allowed_roles = [

            "Fish Vendor",

            "LGU Officer",

        ]

        # Prevent users from registering as Administrators.

        if value.name not in allowed_roles:

            raise serializers.ValidationError(

                "You cannot register with this role."

            )

        return value

        # ========================================================

    # ROLE-SPECIFIC REGISTRATION VALIDATION

    # ========================================================

    def validate(self, attrs):

        """

        Validate registration information based on the

        selected AquaTimbang role.

        """

        role = attrs.get("role")

        if role and role.name == "Fish Vendor" and len(attrs.get("registration_reason", "").strip()) < 15:
            raise serializers.ValidationError({
                "registration_reason": "Please write at least 15 characters about why you are registering."
            })

        if role and role.name == "Fish Vendor":

            # Fish Vendors must provide their market name.

            if not attrs.get("market_name", "").strip():

                raise serializers.ValidationError({

                    "market_name": "Public market is required for Fish Vendors."

                })

            # Fish Vendors must provide their stall number.

            if not attrs.get("stall_number", "").strip():
                raise serializers.ValidationError({
                    "stall_number": "Stall number is required for Fish Vendors."
                })

            # A stall photo is the main proof for vendors without a permit.
            if not attrs.get("stall_photo"):
                raise serializers.ValidationError({
                    "stall_photo": "A photo of your market stall is required."
                })

            if not attrs.get("species_sold"):
                raise serializers.ValidationError({
                    "species_sold": "Select at least one fish species that you sell."
                })

        # ====================================================

        # LGU OFFICER VERIFICATION

        # ====================================================

        # LGU Officer details (office, position, ID, proof of employment) are
        # optional: the Administrator checks them and can ask for the rest
        # before approving.

        # Fish Vendors may register without an email (password resets are
        # then done by their LGU Officer); everyone else needs one.
        if not (attrs.get("email") or "").strip() and not (role and role.name == "Fish Vendor"):
            raise serializers.ValidationError({"email": "An email address is required."})

        return attrs

    # Municipality is optional because administrators

    # may not be assigned to a municipality.

    municipality = serializers.PrimaryKeyRelatedField(

        queryset=Municipality.objects.all(),

        required=False,

        allow_null=True

    )

    # Optional contact number.

    contact_number = serializers.CharField(

        max_length=20,

        required=False,

        allow_blank=True

    )

        # Additional personal information

    date_of_birth = serializers.DateField(

        required=False,

        allow_null=True

    )

    sex = serializers.CharField(

        max_length=20,

        required=False,

        allow_blank=True

    )

    def validate_username(self, value):

        # Prevent duplicate usernames.

        if User.objects.filter(username=value).exists():

            raise serializers.ValidationError(

                "This username is already registered."

            )

        return value

    def validate_email(self, value):

        # No email (allowed for Fish Vendors): nothing to compare.
        if not value:
            return ""

        # Prevent duplicate email addresses.

        if User.objects.filter(email__iexact=value).exists():

            raise serializers.ValidationError(

                "This email address is already registered."

            )

        return value

    @transaction.atomic

    def create(self, validated_data):

        """

        Create a Django user, AquaTimbang profile,

        and Fish Vendor verification record when applicable.

        """

        # Extract AquaTimbang profile information.

        role = validated_data.pop("role")

        municipality = validated_data.pop("municipality", None)

        contact_number = validated_data.pop("contact_number", "")

        date_of_birth = validated_data.pop("date_of_birth", None)

        sex = validated_data.pop("sex", "")
        profile_photo = validated_data.pop("profile_photo")
        registration_reason = validated_data.pop("registration_reason", "").strip()
        species_sold = validated_data.pop("species_sold", [])

        # Extract Fish Vendor verification information.

        market_name = validated_data.pop("market_name", "")

        stall_number = validated_data.pop("stall_number", "")

        permit_number = validated_data.pop("permit_number", "")

        permit_document = validated_data.pop("permit_document", None)

        stall_photo = validated_data.pop("stall_photo", None)

        # Extract LGU Officer verification information.

        department = validated_data.pop("department", "")

        position = validated_data.pop("position", "")

        official_email = validated_data.pop("official_email", "")

        employee_id = validated_data.pop("employee_id", "")

        authorization_document = validated_data.pop(

            "authorization_document", None

        )

        # Create the Django authentication account.

        user = User.objects.create_user(**validated_data)

        # Create the AquaTimbang profile.

        profile = UserProfile.objects.create(

            user=user,

            role=role,

            municipality=municipality,

            contact_number=contact_number,

            date_of_birth=date_of_birth,

            sex=sex,
            profile_photo=profile_photo,
            registration_reason=registration_reason,
            is_active=False,
        )

                # Save additional verification details for Fish Vendors.

        if role.name == "Fish Vendor":
            vendor = FishVendorVerification.objects.create(

                profile=profile,

                market_name=market_name,

                stall_number=stall_number,

                permit_number=permit_number,

                permit_document=permit_document,

                stall_photo=stall_photo,
            )
            vendor.species_sold.set(species_sold)

        # Save additional verification details for LGU Officers.

        elif role.name == "LGU Officer":

            LGUOfficerVerification.objects.create(

                profile=profile,

                department=department,

                position=position,

                official_email=official_email,

                employee_id=employee_id,

                authorization_document=authorization_document,

            )

        return user

class MunicipalitySerializer(serializers.ModelSerializer):

    """

    Converts Municipality records to and from JSON.

    """

    class Meta:

        # Connect this serializer to Municipality.

        model = Municipality

        fields = [

            "id",

            "name",

            "province",

            "is_active",

        ]

        # The database generates the ID automatically.

        read_only_fields = ["id"]

class FishSpeciesSerializer(serializers.ModelSerializer):

    # Upload only; the picture is served by /fish-species/<id>/photo/.
    photo = serializers.ImageField(
        write_only=True,
        required=False,
        allow_null=True,
        validators=[validate_image_upload],
    )
    has_photo = serializers.SerializerMethodField()

    def get_has_photo(self, obj):
        return bool(obj.photo)

    """

    Converts FishSpecies records to and from JSON.

    """

    def validate_name(self, value):
        """Tidy capitals and refuse a name that only differs in capitals."""
        from .validators import clean_fish_name
        name = clean_fish_name(value)
        if len(name) < 2:
            raise serializers.ValidationError("Enter the fish name.")
        from .species_tools import name_key
        # The same fish written another way ("Lapu Lapu", "lapulapu") is a duplicate.
        others = FishSpecies.objects.all()
        if self.instance is not None:
            others = others.exclude(pk=self.instance.pk)
        same = next((fish for fish in others if name_key(fish.name) == name_key(name)), None)
        if same:
            raise serializers.ValidationError(f"{same.name} is already in the fish list.")
        return name

    def validate(self, attrs):
        """Fill in the scientific name of a well-known fish when it is left blank."""
        from .species_tools import known_scientific_name
        attrs = super().validate(attrs)
        name = attrs.get("name") or getattr(self.instance, "name", "")
        current = attrs.get("scientific_name", getattr(self.instance, "scientific_name", "") if self.instance else "")
        if not (current or "").strip():
            known = known_scientific_name(name)
            if known:
                attrs["scientific_name"] = known
        return attrs

    class Meta:

        # Connect this serializer to FishSpecies.

        model = FishSpecies

        fields = [

            "id",

            "name",

            "price_class",
            "scientific_name",

            "description",

            "photo",

            "has_photo",


            "photo_credit",

            "is_active",

            "created_at",

            "updated_at",

        ]

        # Django automatically manages these fields.

        read_only_fields = [

            "id",

            "created_at",

            "updated_at",

        ]

def check_price_bounds(value, species=None):
    """
    Raise a validation error when a price is outside the range set in System
    Configuration for this fish's class (first-class or common fish).
    """
    from .models import SystemSetting
    low, high, label = SystemSetting.load().bounds_for(species)
    if value < low or value > high:
        raise serializers.ValidationError(
            f"Price for {label} must be between ₱{low:,.2f} and ₱{high:,.2f} per kg. "
            "An Administrator can change this range in System Configuration."
        )


def attach_previous_prices(records):
    """
    Set record._previous_price to the latest published price recorded
    before it for the same fish species and municipality, using one
    query for all records instead of one per record.
    """
    records = [r for r in records if not hasattr(r, "_previous_price")]
    if not records:
        return
    history = {}
    published = (
        PriceRecord.objects.filter(
            status=PriceRecord.STATUS_PUBLISHED,
            fish_species_id__in={r.fish_species_id for r in records},
            municipality_id__in={r.municipality_id for r in records},
        )
        .order_by("recorded_date", "id")
        .values_list("fish_species_id", "municipality_id", "market_id", "recorded_date", "price_per_kg")
    )
    # Compare within the same market: Pasil and Carbon have their own prices.
    for species_id, municipality_id, market_id, recorded_date, price in published:
        history.setdefault((species_id, municipality_id, market_id), []).append((recorded_date, price))
    for record in records:
        rows = history.get((record.fish_species_id, record.municipality_id, record.market_id), [])
        # Rows are sorted by date; find the last one before this record's date.
        index = bisect_left(rows, (record.recorded_date,)) - 1
        record._previous_price = rows[index][1] if index >= 0 else None


class PriceRecordListSerializer(serializers.ListSerializer):
    """Pre-load previous prices for every record in a list response."""

    def to_representation(self, data):
        records = list(data.all() if hasattr(data, "all") else data)
        attach_previous_prices(records)
        return super().to_representation(records)


class PriceRecordSerializer(serializers.ModelSerializer):

    """

    Converts AquaTimbang fish price records to and from JSON.

    Supports the workflow:

    Draft

        ↓

    Pending Review

        ↓

    Published / Flagged / Rejected

    """

    # ---------------------------------------------------------

    # READABLE RELATED INFORMATION

    # ---------------------------------------------------------

    # Return the fish name together with its database ID.

    fish_name = serializers.CharField(

        source="fish_species.name",

        read_only=True

    )

    # Return the municipality name.

    municipality_name = serializers.CharField(

        source="municipality.name",

        read_only=True

    )

    # Market where the price was taken (e.g. Pasil Fish Market).
    market_name = serializers.CharField(source="market.name", read_only=True, allow_null=True)

    # Return the readable status.

    # Example: "pending" becomes "Pending Review".

    status_display = serializers.CharField(

        source="get_status_display",

        read_only=True

    )

    # ---------------------------------------------------------

    # HISTORICAL PRICE COMPARISON

    # ---------------------------------------------------------

    # These values are calculated from published records.

    # They are read-only and cannot be edited by users.

    previous_price = serializers.SerializerMethodField()

    price_change = serializers.SerializerMethodField()

    percentage_change = serializers.SerializerMethodField()

    def get_previous_price(self, obj):

        """

        Find the latest earlier published price for the

        same fish species and municipality.

        List responses pre-load these values in one query

        (see PriceRecordListSerializer).

        """

        if not hasattr(obj, "_previous_price"):

            attach_previous_prices([obj])

        return obj._previous_price

    def get_price_change(self, obj):

        """

        Calculate the peso difference from the previous price.

        """

        previous_price = self.get_previous_price(obj)

        if previous_price is None:

            return None

        return round(obj.price_per_kg - previous_price, 2)

    def get_percentage_change(self, obj):

        """

        Calculate the percentage increase or decrease.

        """

        previous_price = self.get_previous_price(obj)

        if previous_price is None or previous_price == 0:

            return None

        difference = obj.price_per_kg - previous_price

        return round((difference / previous_price) * 100, 2)

    # ---------------------------------------------------------

    # USER INFORMATION

    # ---------------------------------------------------------

    # Username of the person who originally entered the price.

    recorded_by_name = serializers.CharField(

        source="recorded_by.username",

        read_only=True,

        allow_null=True

    )

    # Username of the person who reviewed the record.

    reviewed_by_name = serializers.CharField(

        source="reviewed_by.username",

        read_only=True,

        allow_null=True

    )

    # Username of the person who published the record.

    published_by_name = serializers.CharField(

        source="published_by.username",

        read_only=True,

        allow_null=True

    )

    # Each correction made to this published price, oldest first.

    corrections = serializers.SerializerMethodField()

    def get_corrections(self, obj):

        return [

            {

                "previous_price": str(c.previous_price),

                "new_price": str(c.new_price),

                "previous_fish": c.previous_species.name if c.previous_species else None,

                "new_fish": c.new_species.name if c.new_species else None,

                "reason": c.reason,

                "corrected_by": c.corrected_by.username if c.corrected_by else None,

                "corrected_at": c.corrected_at.isoformat(),

            }

            for c in obj.corrections.all()

        ]

    class Meta:

        # Connect this serializer to PriceRecord.

        model = PriceRecord

        # Pre-load previous prices when serializing many records.

        list_serializer_class = PriceRecordListSerializer

        # Fields available through the AquaTimbang API.

        fields = [

            "id",

            # Fish information.

            "fish_species",

            "fish_name",

            # Municipality information.

            "municipality",

            "municipality_name",
            "market",
            "market_name",

            # Price information.

             "price_per_kg",

            "previous_price",

            "price_change",

            "percentage_change", 

            "recorded_date",

            "source",

            "remarks",
            "sampled_prices",

            # User who entered the price.

            "recorded_by",

            "recorded_by_name",

            # Workflow status.

            "status",

            "status_display",

            # Review information.

            "reviewed_by",

            "reviewed_by_name",

            "reviewed_at",

            # Publishing information.

            "published_by",

            "published_by_name",

            "published_at",

            # Flag/rejection information.

            "flag_reason",

            "rejection_reason",

            # Correction history (Table 19).

            "is_correction",

            "corrections",

            # System timestamps.

            "created_at",

            "updated_at",

        ]

        # These fields are controlled by Django.

        read_only_fields = [

            "id",

            "is_correction",

            "corrections",

            # Django determines the submitting user.

            "recorded_by",

            "recorded_by_name",

            # Display-only status name.

            "status_display",

            # Review information is controlled by backend actions.

            "reviewed_by",

            "reviewed_by_name",

            "reviewed_at",

            # Publishing information is controlled by backend actions.

            "published_by",

            "published_by_name",

            "published_at",

            # System timestamps.

            "created_at",

            "updated_at",

        ]

    def validate_price_per_kg(self, value):

        """

        Prevent zero or negative fish prices.

        """

        # A valid fish price must be greater than zero.

        if value <= 0:

            raise serializers.ValidationError(

                "Price per kilogram must be greater than zero."

            )

        # The allowed range depends on the fish (checked in validate()).

        return value

    def validate_sampled_prices(self, value):
        """
        Stall prices checked by the LGU: none, or 3 to 10 positive prices.
        """
        from decimal import Decimal, InvalidOperation
        if value in (None, ""):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("Send the stall prices as a list.")
        if not value:
            return []
        if not 3 <= len(value) <= 10:
            raise serializers.ValidationError("Enter the prices from 3 to 10 stalls.")
        cleaned = []
        for item in value:
            try:
                price = Decimal(str(item)).quantize(Decimal("0.01"))
            except (InvalidOperation, ValueError):
                raise serializers.ValidationError("Every stall price must be a number.")
            if not price.is_finite() or price <= 0:
                raise serializers.ValidationError("Every stall price must be greater than zero.")
            cleaned.append(price)
        return [str(p) for p in cleaned]

    def validate(self, attrs):
        """When stall prices are given, the official price is their median."""
        attrs = super().validate(attrs)
        from decimal import Decimal
        species = attrs.get("fish_species") or getattr(self.instance, "fish_species", None)
        # The market must be in the chosen municipality.
        market = attrs.get("market", getattr(self.instance, "market", None))
        place = attrs.get("municipality") or getattr(self.instance, "municipality", None)
        if market is not None:
            if place is not None and market.municipality_id != place.pk:
                raise serializers.ValidationError({"market": f"{market.name} is not in {place.name}."})
            if not market.is_active and "market" in attrs:
                raise serializers.ValidationError({"market": f"{market.name} is not active."})
        # One price per fish, municipality, market and day.
        fish_now = attrs.get("fish_species") or getattr(self.instance, "fish_species", None)
        day_now = attrs.get("recorded_date") or getattr(self.instance, "recorded_date", None)
        if fish_now is not None and place is not None and day_now is not None:
            same = PriceRecord.objects.filter(
                fish_species=fish_now, municipality=place, market=market, recorded_date=day_now,
            ).exclude(status__in=[PriceRecord.STATUS_REJECTED, PriceRecord.STATUS_WITHDRAWN])
            if self.instance is not None:
                same = same.exclude(pk=self.instance.pk)
            if same.exists():
                where = f"{market.name}, {place.name}" if market else place.name
                raise serializers.ValidationError({
                    "non_field_errors": [f"{fish_now.name} already has a price in {where} for {day_now:%b %d, %Y}. Edit that record instead."]
                })
        sampled = attrs.get("sampled_prices")
        if sampled:
            from statistics import median
            for price in sampled:
                try:
                    check_price_bounds(Decimal(price), species)
                except serializers.ValidationError as error:
                    raise serializers.ValidationError({"sampled_prices": f"Stall price ₱{Decimal(price):,.2f}: {error.detail[0]}"})
            attrs["price_per_kg"] = Decimal(median(Decimal(p) for p in sampled)).quantize(Decimal("0.01"))
        # UC-4 step 4: stay within the range set in System Configuration.
        if "price_per_kg" in attrs or "fish_species" in attrs:
            price = attrs.get("price_per_kg", getattr(self.instance, "price_per_kg", None))
            if price is not None:
                try:
                    check_price_bounds(price, species)
                except serializers.ValidationError as error:
                    raise serializers.ValidationError({"price_per_kg": error.detail[0]})
        return attrs

    def validate_status(self, value):

        """

        Only allow statuses defined by the PriceRecord model.

        """

        # Get all valid status values from STATUS_CHOICES.

        valid_statuses = [

            choice[0]

            for choice in PriceRecord.STATUS_CHOICES

        ]

        # Reject unknown workflow statuses.

        if value not in valid_statuses:

            raise serializers.ValidationError(

                "Invalid price record status."

            )

        return value

class ActivityLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityLog
        fields = [
            "id", "actor_username", "actor_role", "action", "target_type",
            "target_id", "target_name", "details", "created_at",
        ]
        read_only_fields = fields

from .models import VendorPriceSuggestion


class VendorPriceSuggestionSerializer(serializers.ModelSerializer):
    species = serializers.CharField(
        source="fish_species.name",
        read_only=True,
    )
    municipality_name = serializers.CharField(
        source="municipality.name",
        read_only=True,
    )
    submitted_by = serializers.CharField(
        source="vendor.username",
        read_only=True,
    )
    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )

    class Meta:
        model = VendorPriceSuggestion
        fields = [
            "id",
            "vendor",
            "submitted_by",
            "fish_species",
            "species",
            "municipality",
            "municipality_name",
            "suggested_price",
            "comment",
            "status",
            "status_display",
            "lgu_feedback",
            "reviewed_by",
            "reviewed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "vendor",
            "municipality",
            "status",
            "lgu_feedback",
            "reviewed_by",
            "reviewed_at",
            "created_at",
            "updated_at",
        ]

    def validate_suggested_price(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                "Suggested price must be greater than zero."
            )
        return value

    def validate_fish_species(self, value):
        if not value.is_active:
            raise serializers.ValidationError(
                "This fish species is inactive."
            )
        return value

    def validate_municipality(self, value):
        if not value.is_active:
            raise serializers.ValidationError(
                "This municipality is inactive."
            )
        return value

from .models import ClosedFishingSeason, ExternalFactor, ForecastRun


class ExternalFactorSerializer(serializers.ModelSerializer):
    """Daily fuel price, weather and holiday used by the forecasting model."""

    weather_display = serializers.CharField(source="get_weather_display", read_only=True)
    recorded_by_name = serializers.CharField(source="recorded_by.username", read_only=True, allow_null=True)

    class Meta:
        model = ExternalFactor
        fields = [
            "id", "date", "fuel_price", "weather", "weather_display",
            "is_holiday", "notes", "recorded_by_name", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "weather_display", "recorded_by_name", "created_at", "updated_at"]

    def validate_fuel_price(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("Fuel price must be greater than zero.")
        return value


class ClosedFishingSeasonSerializer(serializers.ModelSerializer):
    """A yearly BFAR closed fishing season and the fish it covers."""

    species_names = serializers.SlugRelatedField(source="species", many=True, read_only=True, slug_field="name")

    class Meta:
        model = ClosedFishingSeason
        fields = [
            "id", "name", "area", "start_month", "start_day", "end_month", "end_day",
            "species", "species_names", "source", "notes", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "species_names", "created_at", "updated_at"]

    def validate(self, attrs):
        import calendar
        for prefix in ("start", "end"):
            month = attrs.get(f"{prefix}_month", getattr(self.instance, f"{prefix}_month", None))
            day = attrs.get(f"{prefix}_day", getattr(self.instance, f"{prefix}_day", None))
            if month is None or not 1 <= month <= 12:
                raise serializers.ValidationError({f"{prefix}_month": "Choose a month from 1 to 12."})
            # February 29 is allowed so leap-year dates can be entered.
            last_day = 29 if month == 2 else calendar.monthrange(2023, month)[1]
            if day is None or not 1 <= day <= last_day:
                raise serializers.ValidationError({f"{prefix}_day": f"Choose a day from 1 to {last_day}."})
        return attrs


class ForecastRunSerializer(serializers.ModelSerializer):
    """A saved forecast with its predictions."""

    fish_name = serializers.CharField(source="fish_species.name", read_only=True)
    municipality_name = serializers.CharField(source="municipality.name", read_only=True, allow_null=True)
    created_by_name = serializers.CharField(source="created_by.username", read_only=True, allow_null=True)
    forecast = serializers.SerializerMethodField()

    class Meta:
        model = ForecastRun
        fields = [
            "id", "fish_species", "fish_name", "municipality", "municipality_name",
            "horizon_days", "model_type", "model_used", "exogenous", "coefficients",
            "mape", "rmse", "holdout_days", "training_start", "training_end",
            "observations", "warnings", "created_by_name", "created_at", "forecast",
        ]
        read_only_fields = fields

    def get_forecast(self, run):
        return [
            {
                "date": p.forecast_date,
                "price": float(p.forecast_price),
                "lower": float(p.lower_bound),
                "upper": float(p.upper_bound),
            }
            for p in run.predictions.all()
        ]



from .models import SystemSetting


class SystemSettingSerializer(serializers.ModelSerializer):
    """Administrator-editable system parameters."""

    updated_by_name = serializers.CharField(source="updated_by.username", read_only=True, allow_null=True)

    class Meta:
        model = SystemSetting
        fields = [
            "min_price_per_kg", "max_price_per_kg",
            "first_class_min_price_per_kg", "first_class_max_price_per_kg",
            "updated_by_name", "updated_at",
        ]
        read_only_fields = ["updated_by_name", "updated_at"]

    def validate(self, attrs):
        low = attrs.get("min_price_per_kg", getattr(self.instance, "min_price_per_kg", None))
        high = attrs.get("max_price_per_kg", getattr(self.instance, "max_price_per_kg", None))
        if low is not None and low <= 0:
            raise serializers.ValidationError({"min_price_per_kg": "The minimum must be greater than zero."})
        if low is not None and high is not None and high <= low:
            raise serializers.ValidationError({"max_price_per_kg": "The maximum must be higher than the minimum."})
        first_low = attrs.get("first_class_min_price_per_kg", getattr(self.instance, "first_class_min_price_per_kg", None))
        first_high = attrs.get("first_class_max_price_per_kg", getattr(self.instance, "first_class_max_price_per_kg", None))
        if first_low is not None and first_low <= 0:
            raise serializers.ValidationError({"first_class_min_price_per_kg": "The minimum must be greater than zero."})
        if first_low is not None and first_high is not None and first_high <= first_low:
            raise serializers.ValidationError({"first_class_max_price_per_kg": "The maximum must be higher than the minimum."})
        return attrs


from .models import Announcement, Market


class AnnouncementSerializer(serializers.ModelSerializer):
    audience_display = serializers.CharField(source="get_audience_display", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            "id", "title", "message", "audience", "audience_display", "is_active",
            "created_by_name", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_created_by_name(self, obj):
        user = obj.created_by
        return (user.get_full_name() or user.username) if user else None

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Give the announcement a title.")
        return value

    def validate_message(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Write the announcement message.")
        return value


class MarketSerializer(serializers.ModelSerializer):
    municipality_name = serializers.CharField(source="municipality.name", read_only=True)
    vendor_count = serializers.SerializerMethodField()

    class Meta:
        model = Market
        fields = ["id", "name", "municipality", "municipality_name", "is_active", "vendor_count", "created_at"]
        read_only_fields = ["id", "created_at"]
        validators = []

    def get_vendor_count(self, obj):
        counts = self.context.get("vendor_counts", {})
        return counts.get((obj.name.lower(), obj.municipality_id), 0)

    def validate_name(self, value):
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("Market name is required.")
        return value

    def validate(self, attrs):
        name = attrs.get("name", getattr(self.instance, "name", ""))
        municipality = attrs.get("municipality", getattr(self.instance, "municipality", None))
        duplicate = Market.objects.filter(name__iexact=name, municipality=municipality)
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError({"name": "This market is already listed for that municipality."})
        return attrs


from .models import FishScanPhoto


class FishScanPhotoSerializer(serializers.ModelSerializer):
    """A labelled fish photo for training the fish scanner."""

    fish_name = serializers.CharField(source="fish_species.name", read_only=True)
    uploaded_by_name = serializers.SerializerMethodField()
    municipality_name = serializers.CharField(source="municipality.name", read_only=True, allow_null=True)
    reviewed_by_name = serializers.CharField(source="reviewed_by.username", read_only=True, allow_null=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = FishScanPhoto
        fields = [
            "id", "fish_species", "fish_name", "status", "uploaded_by_name", "municipality_name",
            "review_note", "reviewed_by_name", "reviewed_at", "created_at", "image_url",
        ]
        read_only_fields = [
            "id", "fish_name", "status", "uploaded_by_name", "municipality_name",
            "review_note", "reviewed_by_name", "reviewed_at", "created_at", "image_url",
        ]

    def get_uploaded_by_name(self, scan):
        user = scan.uploaded_by
        if user is None:
            return "Deleted account"
        return user.get_full_name() or user.username

    def get_image_url(self, scan):
        return f"/fish-scans/{scan.pk}/image/"

    def validate_fish_species(self, fish):
        if not fish.is_active:
            raise serializers.ValidationError("This fish species is no longer active.")
        return fish
