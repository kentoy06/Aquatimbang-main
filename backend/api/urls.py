# Import Django URL utilities.
from django.urls import include, path

# DefaultRouter automatically generates REST API routes
# for registered ViewSets.
from rest_framework.routers import DefaultRouter
from .views import ActivityLogViewSet, VendorPriceSuggestionViewSet, ExternalFactorViewSet, price_forecast, forecast_history, ClosedFishingSeasonViewSet, price_explanation, FishScanPhotoViewSet

# Import AquaTimbang API views.
from .views import (
    FishSpeciesViewSet,
    MunicipalityViewSet,
    PriceRecordViewSet,
    health_check,
    public_summary,
    public_fish_profile,
    price_check,
    price_outliers,
    market_insights,
    insight_settings,
    insight_settings_preview,
    my_profile,
    my_photo,
    request_password_reset,
    confirm_password_reset,
    AnnouncementViewSet,
    MarketViewSet,
    list_fisherfolk,
    login_user,
    register_user,
    approve_user,  # Administrator account approval endpoint
    reject_user,  # Administrator account rejection endpoint
    list_users,
    manage_user,
    set_user_status,
    reset_user_password,
    send_user_reset_link,
    change_my_password,
    logout_user,
    presence_heartbeat,
    message_contacts,
    conversations,
    conversation_messages,
    unread_message_count,
    system_settings,
    weight_entries,
    delete_weight_entry,
    reports,
    pending_registrations,
    registration_options,
    view_verification_document,
)


# ============================================================
# REST API ROUTER
# ============================================================

# Create Django REST Framework's router.
router = DefaultRouter()


# ============================================================
# PRICE RECORD ROUTES
# ============================================================

# Standard routes automatically created:
#
# GET    /api/prices/
# POST   /api/prices/
#
# GET    /api/prices/<id>/
# PATCH  /api/prices/<id>/
# PUT    /api/prices/<id>/
# DELETE /api/prices/<id>/
#
# Custom routes from @action in PriceRecordViewSet:
#
# GET  /api/prices/pending/
# POST /api/prices/<id>/publish/
# POST /api/prices/<id>/flag/
# POST /api/prices/<id>/reject/
router.register(
    r"prices",
    PriceRecordViewSet,
    basename="price-record"
)

router.register(
    r"activity-logs",
    ActivityLogViewSet,
    basename="activity-log"
)


# ============================================================
# FISH SPECIES ROUTES
# ============================================================

# Creates:
#
# GET    /api/fish-species/
# POST   /api/fish-species/
#
# GET    /api/fish-species/<id>/
# PATCH  /api/fish-species/<id>/
# PUT    /api/fish-species/<id>/
# DELETE /api/fish-species/<id>/
router.register(r"announcements", AnnouncementViewSet, basename="announcements")
router.register(r"markets", MarketViewSet, basename="markets")

router.register(
    r"fish-species",
    FishSpeciesViewSet,
    basename="fish-species"
)


# ============================================================
# MUNICIPALITY ROUTES
# ============================================================

# Creates:
#
# GET    /api/municipalities/
# POST   /api/municipalities/
#
# GET    /api/municipalities/<id>/
# PATCH  /api/municipalities/<id>/
# PUT    /api/municipalities/<id>/
# DELETE /api/municipalities/<id>/
router.register(
    r"municipalities",
    MunicipalityViewSet,
    basename="municipality"
)

router.register(
    r"external-factors",
    ExternalFactorViewSet,
    basename="external-factor",
)

router.register(
    r"closed-seasons",
    ClosedFishingSeasonViewSet,
    basename="closed-season",
)

router.register(
    r"fish-scans",
    FishScanPhotoViewSet,
    basename="fish-scan",
)

router.register(
    r"vendor-suggestions",
    VendorPriceSuggestionViewSet,
    basename="vendor-suggestion",
)


# ============================================================
# AQUATIMBANG API URLS
# ============================================================

urlpatterns = [

    # --------------------------------------------------------
    # ADMINISTRATOR - REGISTERED USERS
    # --------------------------------------------------------

    path("", include(router.urls)),
    # Keep your other existing URL patterns here.

    path(
        "auth/users/",  
        list_users,
        name="list-users"
    ),

    path(
    "auth/users/pending/",
    pending_registrations,
    name="pending-registrations",
    ),

    # --------------------------------------------------------
    # SYSTEM
    # --------------------------------------------------------

    # Check whether the AquaTimbang Django backend is online.
    path(
        "health/",
        health_check,
        name="health-check"
    ),

    # The logged-in user's own profile (GET to read, PATCH to update).
    path(
        "auth/me/",
        my_profile,
        name="my-profile"
    ),

    # Forgot password: email a reset link, then set the new password.
    path("auth/password-reset/", request_password_reset, name="password-reset"),
    path("auth/password-reset/confirm/", confirm_password_reset, name="password-reset-confirm"),

    # The logged-in user's own profile photo.
    path(
        "auth/me/photo/",
        my_photo,
        name="my-photo"
    ),

    # Fish Vendor accounts for LGU Officers and Administrators.
    path(
        "auth/fisherfolk/",
        list_fisherfolk,
        name="list-fisherfolk"
    ),

    # SARIMAX price forecast: ?species=<id>&municipality=<id>&horizon=<days>
    path(
        "forecasts/",
        price_forecast,
        name="price-forecast"
    ),

    # Why the price changed this week: ?species=<id>&municipality=<id>
    path(
        "price-explanation/",
        price_explanation,
        name="price-explanation"
    ),

    # Recently generated forecasts.
    path(
        "forecasts/history/",
        forecast_history,
        name="forecast-history"
    ),

    # Administrator: edit (PATCH) or delete (DELETE) an account.
    path(
        "auth/users/<int:user_id>/",
        manage_user,
        name="manage-user"
    ),

    # Administrator: deactivate or reactivate an account.
    path(
        "auth/users/<int:user_id>/status/",
        set_user_status,
        name="user-status"
    ),

    # Administrator: give an account a temporary password.
    path(
        "auth/users/<int:user_id>/reset-password/",
        reset_user_password,
        name="reset-user-password"
    ),

    # Administrator: email the user a link to choose a new password.
    path(
        "auth/users/<int:user_id>/send-reset-link/",
        send_user_reset_link,
        name="send-user-reset-link"
    ),

    # System Configuration: GET for everyone, PATCH for the Administrator.
    path(
        "system-settings/",
        system_settings,
        name="system-settings"
    ),

    # Fair Price Calculator history (your own saved calculations).
    path(
        "weight-entries/",
        weight_entries,
        name="weight-entries"
    ),
    path(
        "weight-entries/<int:entry_id>/",
        delete_weight_entry,
        name="delete-weight-entry"
    ),

    # Log of exported reports.
    path(
        "reports/",
        reports,
        name="reports"
    ),

    # Open pages report that the user is still here (Online / Offline).
    path("auth/heartbeat/", presence_heartbeat, name="presence-heartbeat"),

    # Private messages (vendor <-> LGU, LGU <-> admin, vendor <-> admin).
    path("messages/contacts/", message_contacts, name="message-contacts"),
    path("messages/unread/", unread_message_count, name="message-unread"),
    path("messages/conversations/", conversations, name="conversations"),
    path("messages/conversations/<int:conversation_id>/", conversation_messages, name="conversation-messages"),

    # End this session on the server.
    path(
        "auth/logout/",
        logout_user,
        name="logout-user"
    ),

    # Change your own password.
    path(
        "auth/change-password/",
        change_my_password,
        name="change-my-password"
    ),

    # Live counts for the public landing page.
    path(
        "public/summary/",
        public_summary,
        name="public-summary"
    ),

    # Data mining: learned price checks, outliers and market insights.
    path("insights/price-check/", price_check, name="price-check"),
    path("insights/outliers/", price_outliers, name="price-outliers"),
    path("insights/rules/", market_insights, name="market-insights"),
    path("insights/settings/", insight_settings, name="insight-settings"),
    path("insights/settings/preview/", insight_settings_preview, name="insight-settings-preview"),

    # Public fish profile for the landing page (published prices only).
    path(
        "public/fish/<int:fish_id>/",
        public_fish_profile,
        name="public-fish-profile"
    ),

        path(
        "auth/registration-options/",
        registration_options,
        name="registration-options"
    ),

        # Administrator-only verification document access
    path(
        "auth/users/<int:user_id>/verification/<str:document_type>/",
        view_verification_document,
        name="view-verification-document",
    ),

    # --------------------------------------------------------
    # AUTHENTICATION
    # --------------------------------------------------------

    # Register a new AquaTimbang account.
    path(
        "auth/register/",
        register_user,
        name="register-user"
    ),

# --------------------------------------------------------
# ADMINISTRATOR - ACCOUNT APPROVAL
# --------------------------------------------------------

# Allows an authenticated Administrator to approve
# a registered account using its database user ID.
    path(
        "auth/users/<int:user_id>/approve/",
         approve_user,
         name="approve-user"
    ),

    path(
    "auth/users/<int:user_id>/reject/",
    reject_user,
    name="reject-user",
),

    # Authenticate an AquaTimbang account and receive a token.
    path(
        "auth/login/",
        login_user,
        name="login-user"
    ),

    # --------------------------------------------------------
    # REST API ROUTES
    # --------------------------------------------------------

    # Include every route generated by DefaultRouter.
    path(
        "",
        include(router.urls)
    ),
]