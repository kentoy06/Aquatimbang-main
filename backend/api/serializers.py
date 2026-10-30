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

    email = serializers.EmailField()

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

        # ====================================================

        # LGU OFFICER VERIFICATION

        # ====================================================

        if role and role.name == "LGU Officer":

            # Require the officer's government department.

            if not attrs.get("department", "").strip():

                raise serializers.ValidationError({

                    "department": "Department or office is required for LGU Officers."

                })

            # Require the officer's official position.

            if not attrs.get("position", "").strip():

                raise serializers.ValidationError({

                    "position": "Official position is required for LGU Officers."

                })

            # Require an authorization document.

            if not attrs.get("authorization_document"):

                raise serializers.ValidationError({

                    "authorization_document": "Proof of LGU authorization is required."

                })

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

        # Prevent duplicate email addresses.

        if User.objects.filter(email=value).exists():

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

            is_active=False,

        )

                # Save additional verification details for Fish Vendors.

        if role.name == "Fish Vendor":

            FishVendorVerification.objects.create(

                profile=profile,

                market_name=market_name,

                stall_number=stall_number,

                permit_number=permit_number,

                permit_document=permit_document,

                stall_photo=stall_photo,

            )

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

    """

    Converts FishSpecies records to and from JSON.

    """

    class Meta:

        # Connect this serializer to FishSpecies.

        model = FishSpecies

        fields = [

            "id",

            "name",

            "scientific_name",

            "description",

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
        .values_list("fish_species_id", "municipality_id", "recorded_date", "price_per_kg")
    )
    for species_id, municipality_id, recorded_date, price in published:
        history.setdefault((species_id, municipality_id), []).append((recorded_date, price))
    for record in records:
        rows = history.get((record.fish_species_id, record.municipality_id), [])
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

            # Price information.

             "price_per_kg",

            "previous_price",

            "price_change",

            "percentage_change", 

            "recorded_date",

            "source",

            "remarks",

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

            # System timestamps.

            "created_at",

            "updated_at",

        ]

        # These fields are controlled by Django.

        read_only_fields = [

            "id",

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

        return value

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

from .models import ExternalFactor, ForecastRun


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
