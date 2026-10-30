# Django provides the Model classes and database field types.

from django.db import models

class Role(models.Model):

    """

    Stores the different user roles available in AquaTimbang.

    """

    # Name of the role.

    name = models.CharField(max_length=50, unique=True)

    # Optional description of the role.

    description = models.TextField(blank=True)

    def __str__(self):

        # Display the role name in Django Admin.

        return self.name

class Municipality(models.Model):

    """

    Stores municipalities covered by AquaTimbang.

    """

    name = models.CharField(max_length=100, unique=True)

    province = models.CharField(max_length=100)

    is_active = models.BooleanField(default=True)

    def __str__(self):

        return self.name

class UserProfile(models.Model):

    """

    Stores AquaTimbang-specific information for each Django user.

    """

    # Connect this profile to Django's built-in User account.

    user = models.OneToOneField(

        "auth.User",

        on_delete=models.CASCADE,

        related_name="aquatimbang_profile",

    )

    # AquaTimbang role assigned to this user.

    role = models.ForeignKey(

        Role,

        on_delete=models.PROTECT,

        related_name="users",

    )

    # Municipality assigned to the user.

    municipality = models.ForeignKey(

        Municipality,

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name="users",

    )

    # Optional contact number.

    contact_number = models.CharField(

        max_length=20,

        blank=True,

    )

        # User's date of birth

    date_of_birth = models.DateField(

        null=True,

        blank=True

    )

    # User's sex

    sex = models.CharField(

        max_length=20,

        blank=True,

        default=""

    )

    # Controls whether this AquaTimbang profile is active.

     # Registration review workflow.

    STATUS_PENDING = "pending"

    STATUS_APPROVED = "approved"

    STATUS_REJECTED = "rejected"

    ACCOUNT_STATUS_CHOICES = [

        (STATUS_PENDING, "Pending"),

        (STATUS_APPROVED, "Approved"),

        (STATUS_REJECTED, "Rejected"),

    ]

    account_status = models.CharField(

        max_length=20,

        choices=ACCOUNT_STATUS_CHOICES,

        default=STATUS_PENDING,

    )

    # Whether the account can access AquaTimbang.

    is_active = models.BooleanField(default=False)

    # Administrator who reviewed the registration.

    reviewed_by = models.ForeignKey(

        "auth.User",

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name="reviewed_aquatimbang_accounts",

    )

    # Date and time of the Administrator's decision.

    reviewed_at = models.DateTimeField(

        null=True,

        blank=True,

    )

    # Explanation provided when registration is rejected.

    rejection_reason = models.TextField(

        blank=True,

        default="",

    )

    # Automatically records when the profile was created.

    created_at = models.DateTimeField(auto_now_add=True)

    # Automatically records when the profile was last updated.

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):

        # Display the username in Django Admin.

        return self.user.username

    # ============================================================

# FISH VENDOR VERIFICATION

# ============================================================

class FishVendorVerification(models.Model):

    """

    Stores verification details submitted by Fish Vendors.

    """

    # Connect verification information to one user profile.

    profile = models.OneToOneField(

        UserProfile,

        on_delete=models.CASCADE,

        related_name="vendor_verification",

    )

    # Public market where the vendor operates.

    market_name = models.CharField(

        max_length=150,

    )

    # Vendor's assigned stall number.

    stall_number = models.CharField(

        max_length=50,

    )

    # Vendor permit or registration number, if available.

    permit_number = models.CharField(

        max_length=100,

        blank=True,

    )

    # Supporting permit or market certification.

    permit_document = models.FileField(

        upload_to="verification/vendors/permits/",

        blank=True,

        null=True,

    )

    # Photo showing the vendor's market stall.

    stall_photo = models.ImageField(

        upload_to="verification/vendors/stalls/",

        blank=True,

        null=True,

    )

    # When the verification information was submitted.

    created_at = models.DateTimeField(

        auto_now_add=True,

    )

    # When the verification information was last updated.

    updated_at = models.DateTimeField(

        auto_now=True,

    )

    def __str__(self):

        return f"Vendor Verification - {self.profile.user.username}"

# ============================================================

# LGU OFFICER VERIFICATION

# ============================================================

class LGUOfficerVerification(models.Model):

    """

    Stores verification information submitted by LGU Officers.

    """

    # Connect verification details to one user profile.

    profile = models.OneToOneField(

        UserProfile,

        on_delete=models.CASCADE,

        related_name="lgu_verification",

    )

    # Government department or office.

    department = models.CharField(

        max_length=150,

    )

    # Official job position.

    position = models.CharField(

        max_length=150,

    )

    # Official government or work email.

    official_email = models.EmailField(

        blank=True,

    )

    # Employee ID or reference number, if applicable.

    employee_id = models.CharField(

        max_length=100,

        blank=True,

    )

    # Proof of employment or authorization.

    authorization_document = models.FileField(

        upload_to="verification/lgu/authorization/",

        blank=True,

        null=True,

    )

    # Automatically record submission date.

    created_at = models.DateTimeField(

        auto_now_add=True,

    )

    # Automatically record updates.

    updated_at = models.DateTimeField(

        auto_now=True,

    )

    def __str__(self):

        return f"LGU Verification - {self.profile.user.username}"

class FishSpecies(models.Model):

    """

    Stores fish species recognized by AquaTimbang.

    """

    # Common/local name of the fish.

    name = models.CharField(max_length=100, unique=True)

    # Scientific name, if available.

    scientific_name = models.CharField(

        max_length=150,

        blank=True,

    )

    # Optional description of the species.

    description = models.TextField(blank=True)

    # Determines whether the species can currently be used.

    is_active = models.BooleanField(default=True)

    # Automatically records when the species was created.

    created_at = models.DateTimeField(auto_now_add=True)

    # Automatically records when the species was last updated.

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):

        # Display the fish name in Django Admin.

        return self.name

class PriceRecord(models.Model):

    """

    Stores AquaTimbang fish price records.

    Workflow:

    Draft

     ↓

    Pending Review

     ↓

    Approved

     ↓

    Published

A pending record may also be flagged or rejected.

"""

    # All of these lines use exactly 4 spaces of indentation.

    STATUS_DRAFT = "draft"

    STATUS_PENDING = "pending"

    STATUS_APPROVED = "approved"

    STATUS_PUBLISHED = "published"

    STATUS_FLAGGED = "flagged"

    STATUS_REJECTED = "rejected"

    # Available workflow statuses for a price record.

    STATUS_CHOICES = [

        (STATUS_DRAFT, "Draft"),

        (STATUS_PENDING, "Pending Review"),

        (STATUS_APPROVED, "Approved"),

        (STATUS_PUBLISHED, "Published"),

        (STATUS_FLAGGED, "Flagged"),

        (STATUS_REJECTED, "Rejected"),

    ]

    # ---------------------------------------------------------

    # BASIC PRICE INFORMATION

    # ---------------------------------------------------------

    # Fish species associated with this price.

    fish_species = models.ForeignKey(

        FishSpecies,

        on_delete=models.PROTECT,

        related_name="price_records",

    )

    # Municipality where the price was recorded.

    municipality = models.ForeignKey(

        Municipality,

        on_delete=models.PROTECT,

        related_name="price_records",

    )

    # Price per kilogram.

    price_per_kg = models.DecimalField(

        max_digits=10,

        decimal_places=2,

    )

    # Date when the price applies.

    recorded_date = models.DateField()

    # Optional source of the price information.

    source = models.CharField(

        max_length=150,

        blank=True,

    )

    # Optional remarks entered by the LGU officer.

    remarks = models.TextField(

        blank=True,

    )

    # ---------------------------------------------------------

    # WORKFLOW STATUS

    # ---------------------------------------------------------

    # New records start as Draft instead of immediately

    # becoming Pending Review.

    status = models.CharField(

        max_length=20,

        choices=STATUS_CHOICES,

        default=STATUS_DRAFT,

    )

    # Optional reason when a record is flagged.

    flag_reason = models.TextField(

        blank=True,

    )

    # Optional reason when a record is rejected.

    rejection_reason = models.TextField(

        blank=True,

    )

    # True once a published price has been corrected; the original and
    # every later change are kept in PriceCorrection (Table 19).
    is_correction = models.BooleanField(default=False)

    # ---------------------------------------------------------

    # USER TRACKING

    # ---------------------------------------------------------

    # User who originally entered the price.

    recorded_by = models.ForeignKey(

        "auth.User",

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name="recorded_fish_prices",

    )

    # User who reviewed the price.

    reviewed_by = models.ForeignKey(

        "auth.User",

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name="reviewed_fish_prices",

    )

    # Time when the record was reviewed.

    reviewed_at = models.DateTimeField(

        null=True,

        blank=True,

    )

    # User who published the official price.

    published_by = models.ForeignKey(

        "auth.User",

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name="published_fish_prices",

    )

    # Time when the official price was published.

    published_at = models.DateTimeField(

        null=True,

        blank=True,

    )

    # ---------------------------------------------------------

    # AUTOMATIC TIMESTAMPS

    # ---------------------------------------------------------

    # Automatically records when this record was created.

    created_at = models.DateTimeField(auto_now_add=True)

    # Automatically records the latest modification.

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:

        # Display newest price records first.

        ordering = [

            "-recorded_date",

            "-created_at",

        ]

        # Prevent duplicate records for the same fish,

        # municipality, and date.

        constraints = [

            models.UniqueConstraint(

                fields=[

                    "fish_species",

                    "municipality",

                    "recorded_date",

                ],

                name="unique_daily_fish_price",

            )

        ]

    def __str__(self):

        # Make records readable inside Django Admin.

        return (

            f"{self.fish_species.name} - "

            f"{self.municipality.name} - "

            f"{self.recorded_date} - "

            f"₱{self.price_per_kg}/kg - "

            f"{self.get_status_display()}"

        )

class ActivityLog(models.Model):
    """Server-created audit trail for fish species changes."""

    actor = models.ForeignKey(
        "auth.User", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="aquatimbang_activity_logs",
    )
    actor_username = models.CharField(max_length=150)
    actor_role = models.CharField(max_length=50)
    action = models.CharField(max_length=30)
    target_type = models.CharField(max_length=50, default="FishSpecies")
    target_id = models.PositiveIntegerField()
    target_name = models.CharField(max_length=150)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.actor_username}: {self.action} {self.target_name}"

class VendorPriceSuggestion(models.Model):
    STATUS_PENDING = "pending"
    STATUS_REVIEWED = "reviewed"
    STATUS_ADOPTED = "adopted"
    STATUS_REJECTED = "rejected"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending Review"),
        (STATUS_REVIEWED, "Reviewed"),
        (STATUS_ADOPTED, "Adopted"),
        (STATUS_REJECTED, "Rejected"),
    ]

    vendor = models.ForeignKey(
        "auth.User",
        on_delete=models.PROTECT,
        related_name="fish_price_suggestions",
    )
    fish_species = models.ForeignKey(
        FishSpecies,
        on_delete=models.PROTECT,
        related_name="vendor_suggestions",
    )
    municipality = models.ForeignKey(
        Municipality,
        on_delete=models.PROTECT,
        related_name="vendor_suggestions",
    )
    suggested_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
    )
    comment = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )
    lgu_feedback = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_vendor_suggestions",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.vendor.username} - {self.fish_species.name}" 


# ============================================================
# PREDICTIVE ANALYTICS — EXTERNAL FACTORS AND FORECASTS
# ============================================================

class ExternalFactor(models.Model):
    """
    Daily market conditions used as SARIMAX exogenous regressors:
    fuel price, weather and local holidays.
    """

    WEATHER_SUNNY = "sunny"
    WEATHER_CLOUDY = "cloudy"
    WEATHER_RAINY = "rainy"
    WEATHER_STORMY = "stormy"

    WEATHER_CHOICES = [
        (WEATHER_SUNNY, "Sunny"),
        (WEATHER_CLOUDY, "Cloudy"),
        (WEATHER_RAINY, "Rainy"),
        (WEATHER_STORMY, "Stormy"),
    ]

    # One record per calendar day.
    date = models.DateField(unique=True)

    # Diesel price per liter, which drives fishing trip costs.
    fuel_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)

    weather = models.CharField(max_length=10, choices=WEATHER_CHOICES, default=WEATHER_SUNNY)

    is_holiday = models.BooleanField(default=False)

    notes = models.CharField(max_length=200, blank=True)

    recorded_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_external_factors",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.date} - {self.get_weather_display()}"


class ForecastRun(models.Model):
    """
    One generated forecast for a fish species (and optionally a
    municipality), with the fitted model and its accuracy.
    """

    MODEL_SARIMAX = "sarimax"
    MODEL_TREND = "trend"

    MODEL_TYPE_CHOICES = [
        (MODEL_SARIMAX, "SARIMAX"),
        (MODEL_TREND, "Linear trend (fallback)"),
    ]

    fish_species = models.ForeignKey(FishSpecies, on_delete=models.CASCADE, related_name="forecast_runs")

    # Empty means the forecast covers all municipalities.
    municipality = models.ForeignKey(
        Municipality,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="forecast_runs",
    )

    horizon_days = models.PositiveSmallIntegerField()

    model_type = models.CharField(max_length=10, choices=MODEL_TYPE_CHOICES)

    # e.g. "SARIMAX(1,0,0)(1,0,1,7)"
    model_used = models.CharField(max_length=60)

    # Exogenous regressors used and their fitted effect on price.
    exogenous = models.JSONField(default=list, blank=True)
    coefficients = models.JSONField(default=dict, blank=True)

    # Accuracy on the hold-out days (Mean Absolute Percentage Error, Root Mean Square Error).
    mape = models.FloatField(null=True, blank=True)
    rmse = models.FloatField(null=True, blank=True)
    holdout_days = models.PositiveSmallIntegerField(default=0)

    training_start = models.DateField(null=True, blank=True)
    training_end = models.DateField(null=True, blank=True)
    observations = models.PositiveIntegerField(default=0)

    warnings = models.JSONField(default=list, blank=True)

    # Latest change to the input data when this run was made; a newer
    # change means the run is out of date.
    data_signature = models.CharField(max_length=100)

    created_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="forecast_runs",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.fish_species.name} - {self.model_used} - {self.created_at:%Y-%m-%d}"


class Prediction(models.Model):
    """One forecast day: predicted price per kg with a 95% confidence interval."""

    run = models.ForeignKey(ForecastRun, on_delete=models.CASCADE, related_name="predictions")

    fish_species = models.ForeignKey(FishSpecies, on_delete=models.CASCADE, related_name="predictions")

    municipality = models.ForeignKey(
        Municipality,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="predictions",
    )

    forecast_date = models.DateField()

    forecast_price = models.DecimalField(max_digits=10, decimal_places=2)
    lower_bound = models.DecimalField(max_digits=10, decimal_places=2)
    upper_bound = models.DecimalField(max_digits=10, decimal_places=2)

    model_used = models.CharField(max_length=60)

    class Meta:
        ordering = ["forecast_date"]

    def __str__(self):
        return f"{self.fish_species.name} {self.forecast_date}: {self.forecast_price}"


# ============================================================
# LOGIN SECURITY (UC-1 3d, Tables 24 and 41)
# ============================================================

class LoginLockout(models.Model):
    """
    Failed login attempts per username. After too many failures the
    username is locked for a while, even with the right password.
    """

    # Stored in lowercase so "Admin" and "admin" share one counter.
    username = models.CharField(max_length=150, unique=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    last_failed_at = models.DateTimeField(null=True, blank=True)
    locked_until = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.username}: {self.failed_attempts} failed"


class TokenActivity(models.Model):
    """When a login token was last used, so idle sessions can expire."""

    token = models.OneToOneField(
        "authtoken.Token",
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="activity",
    )
    last_seen = models.DateTimeField()

    def __str__(self):
        return f"{self.token.user.username} last seen {self.last_seen}"



# ============================================================
# PRICE CORRECTIONS AND SYSTEM CONFIGURATION
# ============================================================

class PriceCorrection(models.Model):
    """
    One correction to a published price. Keeps the price before and
    after, so the original value is never lost (audit trail).
    """

    price_record = models.ForeignKey(PriceRecord, on_delete=models.CASCADE, related_name="corrections")
    previous_price = models.DecimalField(max_digits=10, decimal_places=2)
    new_price = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.TextField()
    corrected_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="price_corrections",
    )
    corrected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["corrected_at", "id"]

    def __str__(self):
        return f"{self.price_record_id}: {self.previous_price} -> {self.new_price}"


class SystemSetting(models.Model):
    """
    System-wide parameters set by the Administrator (one row).
    """

    # Prices per kg outside this range are rejected (UC-4 step 4).
    min_price_per_kg = models.DecimalField(max_digits=10, decimal_places=2, default=50)
    max_price_per_kg = models.DecimalField(max_digits=10, decimal_places=2, default=1000)

    updated_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def load(cls):
        """The single settings row, created with defaults if missing."""
        settings, _ = cls.objects.get_or_create(pk=1)
        return settings

    def __str__(self):
        return f"Price range {self.min_price_per_kg}-{self.max_price_per_kg}"
