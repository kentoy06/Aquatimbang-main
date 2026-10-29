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
