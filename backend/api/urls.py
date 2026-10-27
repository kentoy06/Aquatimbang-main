# Import Django URL utilities.
from django.urls import include, path

# DefaultRouter automatically generates REST API routes
# for registered ViewSets.
from rest_framework.routers import DefaultRouter
from .views import ActivityLogViewSet, VendorPriceSuggestionViewSet

# Import AquaTimbang API views.
from .views import (
    FishSpeciesViewSet,
    MunicipalityViewSet,
    PriceRecordViewSet,
    health_check,
    public_summary,
    my_profile,
    list_fisherfolk,
    login_user,
    register_user,
    approve_user,  # Administrator account approval endpoint
    reject_user,  # Administrator account rejection endpoint
    list_users,
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

    # Fish Vendor accounts for LGU Officers and Administrators.
    path(
        "auth/fisherfolk/",
        list_fisherfolk,
        name="list-fisherfolk"
    ),

    # Live counts for the public landing page.
    path(
        "public/summary/",
        public_summary,
        name="public-summary"
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