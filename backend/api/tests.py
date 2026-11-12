# Django's TestCase provides a temporary test database.
from django.test import TestCase
# Django's built-in User model.
from django.contrib.auth.models import User
# Import the AquaTimbang models needed for testing.
from .models import (
    Role,
    Municipality,
    UserProfile,
    PriceRecord,
    FishSpecies,
    ActivityLog,
)
# DRF utility for testing API requests.
from rest_framework.test import APIClient
# Token model used by AquaTimbang authentication.
from rest_framework.authtoken.models import Token
class AquaTimbangPermissionTests(TestCase):
    """
    Automated tests for AquaTimbang's role-based permissions.
    """
    def setUp(self):
        # =========================================================
        # SHARED TEST DATA
        # =========================================================
        # Create Cebu City first because both users need it.
        self.municipality = Municipality.objects.create(
            name="Cebu City"
        )
        # Create Bangus for price-record testing.
        self.fish_species = FishSpecies.objects.create(
            name="bangus"
        )
        # =========================================================
        # FISH VENDOR SETUP
        # =========================================================
        # Create the Fish Vendor role.
        self.vendor_role = Role.objects.create(
            name="Fish Vendor"
        )
        # Create the Fish Vendor user.
        self.vendor = User.objects.create_user(
            username="test_vendor",
            password="TestPassword123!"
        )
        # Create the Fish Vendor profile.
        self.vendor_profile = UserProfile.objects.create(
            user=self.vendor,
            role=self.vendor_role,
            municipality=self.municipality,
            is_active=True,
            account_status="approved",
        )
        # Create an authentication token for the Fish Vendor.
        self.vendor_token = Token.objects.create(
            user=self.vendor
        )
        # Create an API client that acts as the Fish Vendor.
        self.vendor_client = APIClient()
        # Attach the Fish Vendor token to every request.
        self.vendor_client.credentials(
            HTTP_AUTHORIZATION=f"Token {self.vendor_token.key}"
        )
        # =========================================================
        # LGU OFFICER SETUP
        # =========================================================
        # Create the LGU Officer role.
        self.lgu_role = Role.objects.create(
            name="LGU Officer"
        )
        # Create the LGU Officer user.
        self.lgu_officer = User.objects.create_user(
            username="test_lgu",
            password="TestPassword123!"
        )
        # Create the LGU Officer profile.
        self.lgu_profile = UserProfile.objects.create(
            user=self.lgu_officer,
            role=self.lgu_role,
            municipality=self.municipality,
            is_active=True,
            account_status="approved",
        )
        # Create an authentication token for the LGU Officer.
        self.lgu_token = Token.objects.create(
            user=self.lgu_officer
        )
        # Create an API client that acts as the LGU Officer.
        self.lgu_client = APIClient()
        # Attach the LGU Officer token to every request.
        self.lgu_client.credentials(
            HTTP_AUTHORIZATION=f"Token {self.lgu_token.key}"
        )
        # =========================================================
        # ADMINISTRATOR SETUP
        # =========================================================
        # Create the Administrator role.
        self.admin_role = Role.objects.create(
            name="Administrator"
        )
        # Create the Administrator user.
        self.admin_user = User.objects.create_user(
            username="test_admin",
            password="TestPassword123!"
        )
        # Create the Administrator AquaTimbang profile.
        # Administrator does not need to belong to a municipality.
        self.admin_profile = UserProfile.objects.create(
            user=self.admin_user,
            role=self.admin_role,
            municipality=None,
            is_active=True,
            account_status="approved",
        )
        # Create an authentication token for the Administrator.
        self.admin_token = Token.objects.create(
            user=self.admin_user
        )
        # Create an API client that acts as the Administrator.
        self.admin_client = APIClient()
        # Attach the Administrator token to every request.
        self.admin_client.credentials(
            HTTP_AUTHORIZATION=f"Token {self.admin_token.key}"
        )
    def test_fish_vendor_profile_created(self):
        """
        Check that the Fish Vendor profile has the correct role.
        """
        # Verify the user's role.
        self.assertEqual(
            self.vendor.aquatimbang_profile.role.name,
            "Fish Vendor"
        )
    def test_fish_vendor_can_view_prices(self):
        """
        Fish Vendors should be able to view price records.
        """
        # Request the price records as the Fish Vendor.
        response = self.vendor_client.get("/api/prices/")
        # GET should be allowed.
        self.assertEqual(response.status_code, 200)
    def test_fish_vendor_can_create_price(self):
        """
        Fish Vendors should be allowed to submit their own price records.
        """
        # Data submitted by the Fish Vendor.
        data = {
            "fish_species": self.fish_species.id,
            "municipality": self.municipality.id,
            "price_per_kg": "225.00",
            "recorded_date": "2026-10-01",
            "source": "Fish Vendor Submission"
        }
        # Submit the price using the authenticated Vendor client.
        response = self.vendor_client.post(
            "/api/prices/",
            data,
            format="json"
        )
        # Successful creation should return HTTP 201.
        self.assertEqual(
            response.status_code,
            201
        )
    def test_fish_vendor_can_update_own_price_record(self):
        """
        Fish Vendors should be allowed to update a price record
        that belongs to them.
        """
        # Create a price record owned by the Fish Vendor.
        price_record = PriceRecord.objects.create(
            fish_species=self.fish_species,
            municipality=self.municipality,
            price_per_kg=225.00,
            recorded_date="2026-10-05",
            source="Fish Vendor Submission",
            recorded_by=self.vendor
        )
        # Update only the price.
        response = self.vendor_client.patch(
            f"/api/prices/{price_record.id}/",
            {
                "price_per_kg": "230.00"
            },
            format="json"
        )
        # The Vendor should be allowed to edit their own record.
        self.assertEqual(
            response.status_code,
            200
        )
        # Reload the record from the test database.
        price_record.refresh_from_db()
        # Verify that the new price was saved.
        self.assertEqual(
            str(price_record.price_per_kg),
            "230.00"
        )
    def test_fish_vendor_cannot_update_another_users_price_record(self):
        """
        Fish Vendors must not be allowed to update a price record
        that belongs to another user.
        """
        # Create another user who will own the price record.
        other_user = User.objects.create_user(
            username="other_user",
            password="OtherPassword123!"
        )
        # Create a price record owned by the other user.
        price_record = PriceRecord.objects.create(
            fish_species=self.fish_species,
            municipality=self.municipality,
            price_per_kg=235.00,
            recorded_date="2026-10-06",
            source="LGU Officer Test",
            recorded_by=other_user
        )
        # Fish Vendor attempts to change the other user's price.
        response = self.vendor_client.patch(
            f"/api/prices/{price_record.id}/",
            {
                "price_per_kg": "999.00"
            },
            format="json"
        )
        # The API should reject the request with HTTP 403 Forbidden.
        self.assertEqual(
            response.status_code,
            403
        )
        # Reload the record from the database.
        price_record.refresh_from_db()
        # Make sure the unauthorized price change did NOT happen.
        self.assertEqual(
            str(price_record.price_per_kg),
            "235.00"
        )
    def test_lgu_officer_can_view_prices(self):
        """
        LGU Officers should be able to view price records.
        """
        # Request all price records using the LGU Officer account.
        response = self.lgu_client.get("/api/prices/")
        # The request should succeed.
        self.assertEqual(response.status_code, 200)
    def test_lgu_officer_can_create_price(self):
        """
        LGU Officers should be able to create price records.
        """
        # Prepare a new price record.
        data = {
            "fish_species": self.fish_species.id,
            "municipality": self.municipality.id,
            "price_per_kg": "245.00",
            "recorded_date": "2026-10-07",
            "source": "LGU Officer Test"
        }
        # Submit the price using the LGU Officer account.
        response = self.lgu_client.post(
            "/api/prices/",
            data,
            format="json"
        )
        # Successful creation should return HTTP 201.
        self.assertEqual(response.status_code, 201)
    def test_lgu_officer_can_update_vendor_price(self):
        """
        LGU Officers should be able to update a price record
        submitted by a Fish Vendor.
        """
        # Create a price record belonging to the Fish Vendor.
        price_record = PriceRecord.objects.create(
            fish_species=self.fish_species,
            municipality=self.municipality,
            price_per_kg=225.00,
            recorded_date="2026-10-08",
            source="Fish Vendor Submission",
            recorded_by=self.vendor
        )
        # LGU Officer updates the Vendor's submitted price.
        response = self.lgu_client.patch(
            f"/api/prices/{price_record.id}/",
            {
                "price_per_kg": "230.00"
            },
            format="json"
        )
        # The LGU Officer should be allowed to make the change.
        self.assertEqual(response.status_code, 200)
        # Reload the price record from the database.
        price_record.refresh_from_db()
        # Verify that the new price was actually saved.
        self.assertEqual(
            str(price_record.price_per_kg),
            "230.00"
        )
    def test_administrator_can_view_prices(self):
        """
        Administrators should be able to view price records.
        """
        # Request price records using the Administrator account.
        response = self.admin_client.get("/api/prices/")
        # The request should succeed.
        self.assertEqual(response.status_code, 200)
    def test_administrator_can_create_price(self):
        """
        Administrators should be able to create price records.
        """
        # Prepare a price record for the Administrator to create.
        data = {
            "fish_species": self.fish_species.id,
            "municipality": self.municipality.id,
            "price_per_kg": "250.00",
            "recorded_date": "2026-10-09",
            "source": "Administrator Test"
        }
        # Submit the new price record.
        response = self.admin_client.post(
            "/api/prices/",
            data,
            format="json"
        )
        # Successful creation should return HTTP 201.
        self.assertEqual(response.status_code, 201)
    def test_administrator_can_update_price(self):
        """
        Administrators should be able to update price records.
        """
        # Create a Fish Vendor price record.
        price_record = PriceRecord.objects.create(
            fish_species=self.fish_species,
            municipality=self.municipality,
            price_per_kg=225.00,
            recorded_date="2026-10-10",
            source="Fish Vendor Submission",
            recorded_by=self.vendor
        )
        # Administrator changes the price.
        response = self.admin_client.patch(
            f"/api/prices/{price_record.id}/",
            {
                "price_per_kg": "255.00"
            },
            format="json"
        )
        # Administrator should be allowed to update it.
        self.assertEqual(response.status_code, 200)
        # Reload the record from the database.
        price_record.refresh_from_db()
        # Verify that the update was saved.
        self.assertEqual(
            str(price_record.price_per_kg),
            "255.00"
        )
    def test_administrator_can_delete_price(self):
        """
        Administrators should be able to delete price records.
        """
        # Create a price record that will be deleted.
        price_record = PriceRecord.objects.create(
            fish_species=self.fish_species,
            municipality=self.municipality,
            price_per_kg=260.00,
            recorded_date="2026-10-11",
            source="Administrator Delete Test",
            recorded_by=self.vendor
        )
        # Save the ID before deleting the record.
        price_record_id = price_record.id
        # Administrator deletes the price record.
        response = self.admin_client.delete(
            f"/api/prices/{price_record_id}/"
        )
        # Successful deletion should return HTTP 204.
        self.assertEqual(response.status_code, 204)
        # Confirm that the record no longer exists.
        self.assertFalse(
            PriceRecord.objects.filter(
                id=price_record_id
            ).exists()
        )
    def test_unauthenticated_user_cannot_view_prices(self):
        """
        Users without a valid authentication token
        must not be able to access protected price records.
        """
        # Create a new API client with NO authentication token.
        unauthenticated_client = APIClient()
        # Attempt to access the protected price endpoint.
        response = unauthenticated_client.get(
            "/api/prices/"
        )
        # TokenAuthentication should reject the request.
        self.assertEqual(
            response.status_code,
            401
        )
class FishSpeciesPermissionTests(TestCase):
    """API-level permissions and historical price deletion protection."""
    URL = "/api/fish-species/"
    def setUp(self):
        self.municipality = Municipality.objects.create(name="Fish Species Test City")
        self.admin_client, self.admin_user, self.admin_profile = self.make_client("Administrator", "species_admin")
        self.lgu_client, self.lgu_user, self.lgu_profile = self.make_client("LGU Officer", "species_lgu")
        self.vendor_client, self.vendor_user, self.vendor_profile = self.make_client("Fish Vendor", "species_vendor")
        self.species = FishSpecies.objects.create(name="Species Permission Test Fish")
    def make_client(self, role_name, username):
        role, _ = Role.objects.get_or_create(name=role_name)
        user = User.objects.create_user(username=username, password="TestPassword123!")
        profile = UserProfile.objects.create(
            user=user,
            role=role,
            municipality=self.municipality,
            is_active=True,
            account_status="approved",
        )
        token = Token.objects.create(user=user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        return client, user, profile
    def test_authenticated_roles_can_view_species(self):
        for client in (self.admin_client, self.lgu_client, self.vendor_client):
            with self.subTest(client=client):
                self.assertEqual(client.get(self.URL).status_code, 200)
    def test_lgu_can_create_and_edit_species(self):
        response = self.lgu_client.post(
            self.URL,
            {"name": "LGU Created Test Fish", "scientific_name": "Testus fishus"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        species_id = response.data["id"]
        response = self.lgu_client.patch(
            f"{self.URL}{species_id}/",
            {"name": "LGU Edited Test Fish"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(FishSpecies.objects.get(pk=species_id).name, "LGU Edited Test Fish")
    def test_lgu_can_deactivate_and_reactivate_species(self):
        url = f"{self.URL}{self.species.pk}/"
        for active in (False, True):
            with self.subTest(active=active):
                response = self.lgu_client.patch(url, {"is_active": active}, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                self.species.refresh_from_db()
                self.assertEqual(self.species.is_active, active)
    def test_lgu_cannot_delete_species(self):
        response = self.lgu_client.delete(f"{self.URL}{self.species.pk}/")
        self.assertEqual(response.status_code, 403)
        self.assertTrue(FishSpecies.objects.filter(pk=self.species.pk).exists())
    def test_vendor_can_only_read_species(self):
        url = f"{self.URL}{self.species.pk}/"
        responses = (
            self.vendor_client.post(self.URL, {"name": "Unauthorized Fish"}, format="json"),
            self.vendor_client.patch(url, {"name": "Unauthorized Rename"}, format="json"),
            self.vendor_client.delete(url),
        )
        for response in responses:
            self.assertEqual(response.status_code, 403, getattr(response, "data", None))
        self.species.refresh_from_db()
        self.assertEqual(self.species.name, "Species Permission Test Fish")
    def test_admin_can_delete_unreferenced_species(self):
        species_id = self.species.pk
        response = self.admin_client.delete(f"{self.URL}{species_id}/")
        self.assertEqual(response.status_code, 204, getattr(response, "data", None))
        self.assertFalse(FishSpecies.objects.filter(pk=species_id).exists())
    def test_admin_cannot_delete_species_with_price_history(self):
        PriceRecord.objects.create(
            fish_species=self.species,
            municipality=self.municipality,
            price_per_kg="150.00",
            recorded_date="2026-10-15",
            source="Permission Test",
            recorded_by=self.lgu_user,
        )
        response = self.admin_client.delete(f"{self.URL}{self.species.pk}/")
        self.assertEqual(response.status_code, 400, getattr(response, "data", None))
        self.assertTrue(FishSpecies.objects.filter(pk=self.species.pk).exists())
    def test_pending_and_rejected_lgu_cannot_modify_species(self):
        for account_status in ("pending", "rejected"):
            with self.subTest(account_status=account_status):
                self.lgu_profile.account_status = account_status
                self.lgu_profile.save(update_fields=["account_status"])
                response = self.lgu_client.post(
                    self.URL,
                    {"name": f"Unapproved {account_status} Fish"},
                    format="json",
                )
                self.assertEqual(response.status_code, 403, getattr(response, "data", None))
                self.assertFalse(FishSpecies.objects.filter(name=f"Unapproved {account_status} Fish").exists())
    def test_unauthenticated_user_cannot_view_species(self):
        response = APIClient().get(self.URL)
        self.assertEqual(response.status_code, 401)


class UserManagementActivityLogTests(TestCase):
    def setUp(self):
        from .models import ActivityLog
        self.ActivityLog = ActivityLog
        self.admin_role = Role.objects.create(name="Administrator")
        self.vendor_role = Role.objects.create(name="Fish Vendor")
        self.admin = User.objects.create_user(username="audit_admin", password="Password123!")
        UserProfile.objects.create(user=self.admin, role=self.admin_role,
                                   is_active=True, account_status="approved")
        token = Token.objects.create(user=self.admin)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        self.pending = User.objects.create_user(username="pending_audit", password="Password123!",
                                                is_active=False)
        self.municipality = Municipality.objects.create(name="Audit City", province="Cebu")
        UserProfile.objects.create(user=self.pending, role=self.vendor_role, municipality=self.municipality,
                                   is_active=False, account_status="pending")

    def test_approval_creates_one_permanent_log(self):
        response = self.client.post(
            f"/api/auth/users/{self.pending.pk}/approve/",
            {"verification_confirmed": True}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        log = self.ActivityLog.objects.get(target_type="UserAccount", target_id=self.pending.pk)
        self.assertEqual(log.action, "approved")
        self.assertEqual(log.actor, self.admin)
        self.assertEqual(log.details["changes"]["account_status"]["to"], "approved")

    def test_rejection_creates_one_permanent_log(self):
        response = self.client.post(
            f"/api/auth/users/{self.pending.pk}/reject/",
            {"reason": "Insufficient verification"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        log = self.ActivityLog.objects.get(target_type="UserAccount", target_id=self.pending.pk)
        self.assertEqual(log.action, "rejected")
        self.assertEqual(log.details["reason"], "Insufficient verification")

    def test_failed_approval_does_not_create_log(self):
        response = self.client.post(
            f"/api/auth/users/{self.pending.pk}/approve/", {}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.ActivityLog.objects.filter(target_type="UserAccount").exists())

    def test_failed_rejection_does_not_create_log(self):
        response = self.client.post(
            f"/api/auth/users/{self.pending.pk}/reject/", {}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.ActivityLog.objects.filter(target_type="UserAccount").exists())


class PriceRecordActivityLogTests(TestCase):
    def setUp(self):
        from .models import ActivityLog
        self.ActivityLog = ActivityLog
        role = Role.objects.create(name="Administrator")
        self.user = User.objects.create_user(username="price_audit_admin", password="Password123!")
        UserProfile.objects.create(user=self.user, role=role, is_active=True, account_status="approved")
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.user).key}")
        self.municipality = Municipality.objects.create(name="Price Audit Municipality", province="Cebu")
        self.species = FishSpecies.objects.create(name="Price Audit Fish")

    def create_price(self, day="2026-10-12"):
        return self.client.post("/api/prices/", {
            "fish_species": self.species.pk,
            "municipality": self.municipality.pk,
            "price_per_kg": "150.00",
            "recorded_date": day,
        }, format="json")

    def test_create_edit_and_delete_are_logged(self):
        response = self.create_price()
        self.assertEqual(response.status_code, 201, response.data)
        pk = response.data["id"]
        self.assertEqual(self.ActivityLog.objects.filter(target_type="PriceRecord", action="created").count(), 1)
        response = self.client.patch(f"/api/prices/{pk}/", {"price_per_kg": "160.00"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(self.ActivityLog.objects.filter(target_type="PriceRecord", action="updated", target_id=pk).exists())
        response = self.client.delete(f"/api/prices/{pk}/")
        self.assertEqual(response.status_code, 204, getattr(response, "data", None))
        self.assertTrue(self.ActivityLog.objects.filter(target_type="PriceRecord", action="deleted", target_id=pk).exists())

    def test_submit_approve_publish_are_logged(self):
        response = self.create_price()
        self.assertEqual(response.status_code, 201, response.data)
        pk = response.data["id"]
        for route, action in (("submit-review", "submitted"), ("approve", "approved"), ("publish", "published")):
            response = self.client.post(f"/api/prices/{pk}/{route}/", {}, format="json")
            self.assertEqual(response.status_code, 200, getattr(response, "data", None))
            self.assertTrue(self.ActivityLog.objects.filter(target_type="PriceRecord", target_id=pk, action=action).exists())
        # The published log keeps the fish, municipality and price separately.
        log = self.ActivityLog.objects.get(target_type="PriceRecord", target_id=pk, action="published")
        for key in ("fish", "fish_id", "municipality", "price_per_kg", "recorded_date"):
            self.assertIn(key, log.details)
        self.assertEqual(log.details["status"], "published")

    def test_failed_review_does_not_log(self):
        response = self.create_price()
        self.assertEqual(response.status_code, 201, response.data)
        pk = response.data["id"]
        response = self.client.post(f"/api/prices/{pk}/publish/", {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.ActivityLog.objects.filter(target_type="PriceRecord", action="published").exists())

    def test_submit_all_creates_individual_logs(self):
        for day in ("2026-10-12", "2026-10-13"):
            response = self.create_price(day)
            self.assertEqual(response.status_code, 201, response.data)
        response = self.client.post("/api/prices/submit-all-review/", {}, format="json")
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertEqual(self.ActivityLog.objects.filter(target_type="PriceRecord", action="submitted").count(), 2)


class ProfileAndSummaryTests(TestCase):
    """Own-profile endpoint, own activity logs and the public summary."""

    def setUp(self):
        role = Role.objects.create(name="Fish Vendor")
        self.user = User.objects.create_user("me_vendor", "me@example.com", "TestPass123!", first_name="Me")
        UserProfile.objects.create(user=self.user, role=role, account_status="approved", is_active=True)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.user).key}")

    def test_read_own_profile(self):
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "me_vendor")
        self.assertEqual(response.data["role"], "Fish Vendor")

    def test_update_own_profile(self):
        response = self.client.patch("/api/auth/me/", {"contact_number": "0917 000 0000", "last_name": "Vendor"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.last_name, "Vendor")
        self.assertEqual(self.user.aquatimbang_profile.contact_number, "0917 000 0000")

    def test_profile_rejects_duplicate_email(self):
        User.objects.create_user("other", "taken@example.com", "TestPass123!")
        response = self.client.patch("/api/auth/me/", {"email": "TAKEN@example.com"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_vendor_sees_only_own_activity(self):
        ActivityLog.objects.create(actor=self.user, actor_username="me_vendor", actor_role="Fish Vendor", action="created", target_id=1, target_name="x")
        other = User.objects.create_user("someone", "s@example.com", "TestPass123!")
        ActivityLog.objects.create(actor=other, actor_username="someone", actor_role="Fish Vendor", action="created", target_id=2, target_name="y")
        response = self.client.get("/api/activity-logs/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["actor_username"] for row in response.data], ["me_vendor"])

    def test_login_ignores_spaces_around_username(self):
        response = APIClient().post("/api/auth/login/", {"username": "  me_vendor ", "password": "TestPass123!"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)

    def test_login_records_last_login(self):
        self.assertIsNone(self.user.last_login)
        response = APIClient().post("/api/auth/login/", {"username": "me_vendor", "password": "TestPass123!"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_login)

    def test_public_summary_needs_no_login(self):
        response = APIClient().get("/api/public/summary/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("species_count", response.data)
        self.assertEqual(response.data["featured_prices"], [])
        self.assertEqual(response.data["today_prices"], [])

    def test_public_summary_lists_latest_price_per_fish(self):
        from datetime import timedelta
        city = Municipality.objects.create(name="Lapu-Lapu City", province="Cebu")
        fish = FishSpecies.objects.create(name="Tamban")
        today = timezone.localdate()
        PriceRecord.objects.create(fish_species=fish, municipality=city, price_per_kg=Decimal("90"), recorded_date=today - timedelta(days=1), status="published")
        PriceRecord.objects.create(fish_species=fish, municipality=city, price_per_kg=Decimal("95"), recorded_date=today, status="published")
        rows = APIClient().get("/api/public/summary/").data["today_prices"]
        self.assertEqual([(r["fish_name"], str(r["price_per_kg"])) for r in rows], [("Tamban", "95.00")])


class FisherfolkListTests(TestCase):
    """LGU Officers see only vendors from their own municipality."""

    def setUp(self):
        self.cebu = Municipality.objects.create(name="Cebu City", province="Cebu")
        mandaue = Municipality.objects.create(name="Mandaue City", province="Cebu")
        vendor_role = Role.objects.create(name="Fish Vendor")
        lgu_role = Role.objects.create(name="LGU Officer")
        for username, muni in (("cebu_vendor", self.cebu), ("mandaue_vendor", mandaue)):
            user = User.objects.create_user(username, f"{username}@example.com", "TestPass123!")
            UserProfile.objects.create(user=user, role=vendor_role, municipality=muni, account_status="approved", is_active=True)
        officer = User.objects.create_user("officer", "officer@example.com", "TestPass123!")
        UserProfile.objects.create(user=officer, role=lgu_role, municipality=self.cebu, account_status="approved", is_active=True)
        self.lgu_client = APIClient()
        self.lgu_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=officer).key}")
        self.vendor_client = APIClient()
        self.vendor_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=User.objects.get(username='cebu_vendor')).key}")

    def test_lgu_sees_own_municipality_vendors(self):
        response = self.lgu_client.get("/api/auth/fisherfolk/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["username"] for row in response.data], ["cebu_vendor"])

    def test_vendor_cannot_list_fisherfolk(self):
        self.assertEqual(self.vendor_client.get("/api/auth/fisherfolk/").status_code, 403)


# ============================================================
# PREDICTIVE ANALYTICS (SARIMAX)
# ============================================================
import datetime
import random
from decimal import Decimal
from unittest import mock

from django.utils import timezone

from .forecasting import NotEnoughData, generate_forecast
from .models import ExternalFactor, ForecastRun, Prediction


class ForecastingTests(TestCase):
    """SARIMAX forecasts, the trend fallback and the forecast API."""

    @classmethod
    def setUpTestData(cls):
        cls.municipality = Municipality.objects.create(name="Cebu City", province="Cebu")
        cls.species = FishSpecies.objects.create(name="Galunggong")
        cls.short_species = FishSpecies.objects.create(name="Bangus")
        cls.tiny_species = FishSpecies.objects.create(name="Tilapia")
        roles = {name: Role.objects.create(name=name) for name in ("Fish Vendor", "LGU Officer")}
        cls.vendor = User.objects.create_user("fc_vendor", "fcv@example.com", "TestPass123!")
        UserProfile.objects.create(user=cls.vendor, role=roles["Fish Vendor"], municipality=cls.municipality, account_status="approved", is_active=True)
        cls.officer = User.objects.create_user("fc_officer", "fco@example.com", "TestPass123!")
        UserProfile.objects.create(user=cls.officer, role=roles["LGU Officer"], municipality=cls.municipality, account_status="approved", is_active=True)

        # 70 days of prices with a weekly pattern; storms add ₱12.
        rng = random.Random(3)
        today = timezone.localdate()
        weekly = [0, -2, -3, -1, 1, 4, 5]
        for back in range(70, 0, -1):
            day = today - datetime.timedelta(days=back)
            stormy = rng.random() < 0.12
            ExternalFactor.objects.create(
                date=day, fuel_price=Decimal("62.00") + Decimal(back % 5) / 10,
                weather="stormy" if stormy else "sunny", is_holiday=False,
            )
            price = 180 + weekly[day.weekday()] + (12 if stormy else 0) + rng.gauss(0, 1)
            PriceRecord.objects.create(
                fish_species=cls.species, municipality=cls.municipality,
                price_per_kg=Decimal(f"{price:.2f}"), recorded_date=day, status="published",
            )
        # 14 days only: too short for SARIMAX.
        for back in range(14, 0, -1):
            PriceRecord.objects.create(
                fish_species=cls.short_species, municipality=cls.municipality,
                price_per_kg=Decimal(200 + back), recorded_date=today - datetime.timedelta(days=back), status="published",
            )
        # 3 days only: too short for any forecast.
        for back in range(3, 0, -1):
            PriceRecord.objects.create(
                fish_species=cls.tiny_species, municipality=cls.municipality,
                price_per_kg=Decimal(100), recorded_date=today - datetime.timedelta(days=back), status="published",
            )

    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=user)[0].key}")
        return client

    def test_sarimax_forecast_with_external_factors(self):
        result = generate_forecast(self.species.pk, self.municipality.pk, horizon=7)
        self.assertEqual(result["model_type"], "sarimax")
        self.assertTrue(result["model_used"].startswith("SARIMAX("))
        self.assertIn("stormy", result["exogenous"])
        # The model should find that storms raise the price by roughly ₱12.
        self.assertAlmostEqual(result["coefficients"]["stormy"], 12, delta=4)
        self.assertEqual(len(result["forecast"]), 7)
        for point in result["forecast"]:
            self.assertLessEqual(point["lower"], point["price"])
            self.assertLessEqual(point["price"], point["upper"])
        self.assertLess(result["mape"], 10)
        self.assertIsNotNone(result["rmse"])

    def test_short_history_falls_back_to_trend(self):
        result = generate_forecast(self.short_species.pk, None, horizon=5)
        self.assertEqual(result["model_type"], "trend")
        self.assertEqual(len(result["forecast"]), 5)
        self.assertTrue(any("Not enough historical data" in w for w in result["warnings"]))

    def test_too_little_data_raises(self):
        with self.assertRaises(NotEnoughData):
            generate_forecast(self.tiny_species.pk, None, horizon=7)

    def test_model_failure_falls_back_to_trend(self):
        with mock.patch("api.forecasting.select_order", side_effect=ValueError("boom")):
            result = generate_forecast(self.species.pk, None, horizon=7)
        self.assertEqual(result["model_type"], "trend")
        self.assertIn("Forecast unavailable. Showing trend only.", result["warnings"])

    def test_forecast_api_saves_and_reuses_run(self):
        client = self.client_for(self.vendor)
        url = f"/api/forecasts/?species={self.short_species.pk}&horizon=5"
        first = client.get(url)
        self.assertEqual(first.status_code, 200)
        self.assertFalse(first.data["cached"])
        self.assertEqual(len(first.data["forecast"]), 5)
        self.assertTrue(first.data["history"])
        self.assertEqual(Prediction.objects.filter(run_id=first.data["id"]).count(), 5)

        second = client.get(url)
        self.assertTrue(second.data["cached"])
        self.assertEqual(second.data["id"], first.data["id"])

        # New published price → the saved forecast is out of date.
        PriceRecord.objects.create(
            fish_species=self.short_species, municipality=self.municipality,
            price_per_kg=Decimal(210), recorded_date=timezone.localdate(), status="published",
        )
        third = client.get(url)
        self.assertFalse(third.data["cached"])
        self.assertEqual(ForecastRun.objects.filter(fish_species=self.short_species).count(), 2)

    def test_forecast_api_validates_input(self):
        client = self.client_for(self.vendor)
        self.assertEqual(client.get("/api/forecasts/?species=999").status_code, 400)
        self.assertEqual(client.get(f"/api/forecasts/?species={self.species.pk}&horizon=90").status_code, 400)
        response = client.get(f"/api/forecasts/?species={self.tiny_species.pk}")
        self.assertTrue(response.data["not_enough_data"])

    def test_only_lgu_and_admin_can_change_external_factors(self):
        payload = {"date": "2030-01-01", "fuel_price": "63.50", "weather": "rainy", "is_holiday": True}
        self.assertEqual(self.client_for(self.vendor).post("/api/external-factors/", payload, format="json").status_code, 403)
        self.assertEqual(self.client_for(self.vendor).get("/api/external-factors/").status_code, 200)
        response = self.client_for(self.officer).post("/api/external-factors/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["weather_display"], "Rainy")
        self.assertTrue(ActivityLog.objects.filter(target_type="ExternalFactor", action="created").exists())

    def test_external_factor_date_is_unique(self):
        client = self.client_for(self.officer)
        day = ExternalFactor.objects.first().date.isoformat()
        response = client.post("/api/external-factors/", {"date": day, "weather": "sunny"}, format="json")
        self.assertEqual(response.status_code, 400)


# ============================================================
# USER MANAGEMENT (UC-7) AND LOGIN MESSAGES (UC-1)
# ============================================================

class AccountManagementTests(TestCase):
    """Creating, editing, deactivating and deleting accounts; reviews; passwords."""

    def setUp(self):
        self.roles = {name: Role.objects.create(name=name) for name in ("Administrator", "LGU Officer", "Fish Vendor")}
        self.cebu = Municipality.objects.create(name="Cebu City", province="Cebu")
        self.mandaue = Municipality.objects.create(name="Mandaue City", province="Cebu")
        self.admin = self.make_user("um_admin", "Administrator", self.cebu)
        self.officer = self.make_user("um_officer", "LGU Officer", self.cebu)
        self.vendor = self.make_user("um_vendor", "Fish Vendor", self.cebu)

    def make_user(self, username, role, municipality, status="approved"):
        active = status == "approved"
        user = User.objects.create_user(username, f"{username}@example.com", "TestPass123!", first_name=username, is_active=status != "rejected")
        UserProfile.objects.create(user=user, role=self.roles[role], municipality=municipality, account_status=status, is_active=active)
        return user

    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=user)[0].key}")
        return client

    def login(self, username, password="TestPass123!"):
        return APIClient().post("/api/auth/login/", {"username": username, "password": password}, format="json")

    # ---- creating and editing ----

    def test_admin_creates_active_lgu_account(self):
        response = self.client_for(self.admin).post("/api/auth/users/", {
            "username": "new_officer", "email": "new@lgu.gov.ph", "first_name": "New", "last_name": "Officer",
            "password": "Str0ng-Pass-2026", "role": "LGU Officer", "municipality": self.cebu.pk,
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["account_status"], "approved")
        self.assertEqual(self.login("new_officer", "Str0ng-Pass-2026").status_code, 200)
        self.assertTrue(ActivityLog.objects.filter(action="created", target_name="new_officer").exists())

    def test_create_validates_fields(self):
        response = self.client_for(self.admin).post("/api/auth/users/", {
            "username": "um_vendor", "email": "UM_ADMIN@example.com", "first_name": "",
            "password": "123", "role": "Boss", "municipality": "",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        for field in ("username", "email", "first_name", "password", "role"):
            self.assertIn(field, response.data)

    def test_vendor_or_lgu_needs_municipality(self):
        response = self.client_for(self.admin).post("/api/auth/users/", {
            "username": "no_muni", "email": "nm@example.com", "first_name": "No", "password": "Str0ng-Pass-2026",
            "role": "Fish Vendor", "municipality": None,
        }, format="json")
        self.assertIn("municipality", response.data)

    def test_non_admin_cannot_manage_users(self):
        client = self.client_for(self.officer)
        self.assertEqual(client.get("/api/auth/users/").status_code, 403)
        self.assertEqual(client.patch(f"/api/auth/users/{self.vendor.pk}/", {"first_name": "X"}, format="json").status_code, 403)

    def test_edit_and_change_role_ends_sessions(self):
        Token.objects.create(user=self.vendor)
        response = self.client_for(self.admin).patch(f"/api/auth/users/{self.vendor.pk}/", {
            "first_name": "Renamed", "role": "LGU Officer", "municipality": self.mandaue.pk,
            "role_change_reason": "Transferred to the Mandaue price office",
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["role"], "LGU Officer")
        self.assertEqual(response.data["municipality"], "Mandaue City")
        self.assertFalse(Token.objects.filter(user=self.vendor).exists())
        self.assertTrue(ActivityLog.objects.filter(action="role changed", target_name="um_vendor").exists())

    def test_admin_cannot_change_own_role(self):
        response = self.client_for(self.admin).patch(f"/api/auth/users/{self.admin.pk}/", {"role": "Fish Vendor"}, format="json")
        self.assertEqual(response.status_code, 400)

    # ---- deactivate, delete ----

    def test_deactivate_blocks_login_and_reactivate_restores_it(self):
        client = self.client_for(self.admin)
        response = client.post(f"/api/auth/users/{self.vendor.pk}/status/", {"active": False}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["is_active"])
        login = self.login("um_vendor")
        self.assertEqual(login.status_code, 403)
        self.assertEqual(login.data["message"], "Account disabled. Contact administrator.")
        client.post(f"/api/auth/users/{self.vendor.pk}/status/", {"active": True}, format="json")
        self.assertEqual(self.login("um_vendor").status_code, 200)

    def test_cannot_deactivate_self_or_last_admin(self):
        client = self.client_for(self.admin)
        self.assertEqual(client.post(f"/api/auth/users/{self.admin.pk}/status/", {"active": False}, format="json").status_code, 400)
        self.assertEqual(client.delete(f"/api/auth/users/{self.admin.pk}/").status_code, 400)

    def test_delete_account_without_records(self):
        response = self.client_for(self.admin).delete(f"/api/auth/users/{self.vendor.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(User.objects.filter(pk=self.vendor.pk).exists())
        self.assertTrue(ActivityLog.objects.filter(action="deleted", target_name="um_vendor").exists())

    def test_delete_account_with_suggestions_is_refused(self):
        from .models import FishSpecies, VendorPriceSuggestion
        species = FishSpecies.objects.create(name="Galunggong")
        VendorPriceSuggestion.objects.create(vendor=self.vendor, fish_species=species, municipality=self.cebu, suggested_price=180)
        response = self.client_for(self.admin).delete(f"/api/auth/users/{self.vendor.pk}/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Deactivate", response.data["message"])
        self.assertTrue(User.objects.filter(pk=self.vendor.pk).exists())
        self.assertFalse(ActivityLog.objects.filter(action="deleted", target_name="um_vendor").exists())

    # ---- passwords ----

    def test_admin_reset_gives_working_temporary_password(self):
        Token.objects.create(user=self.vendor)
        response = self.client_for(self.admin).post(f"/api/auth/users/{self.vendor.pk}/reset-password/")
        self.assertEqual(response.status_code, 200)
        temporary = response.data["temporary_password"]
        self.assertFalse(Token.objects.filter(user=self.vendor).exists())
        self.assertEqual(self.login("um_vendor", temporary).status_code, 200)
        self.assertEqual(self.login("um_vendor").status_code, 401)

    def test_change_own_password(self):
        client = self.client_for(self.vendor)
        wrong = client.post("/api/auth/change-password/", {"current_password": "nope", "new_password": "An0ther-Pass-2026"}, format="json")
        self.assertIn("current_password", wrong.data)
        weak = client.post("/api/auth/change-password/", {"current_password": "TestPass123!", "new_password": "123"}, format="json")
        self.assertIn("new_password", weak.data)
        response = client.post("/api/auth/change-password/", {"current_password": "TestPass123!", "new_password": "An0ther-Pass-2026"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["token"])
        self.assertEqual(self.login("um_vendor", "An0ther-Pass-2026").status_code, 200)

    def test_temporary_password_is_readable_and_must_be_changed(self):
        temporary = self.client_for(self.admin).post(f"/api/auth/users/{self.vendor.pk}/reset-password/").data["temporary_password"]
        self.assertRegex(temporary, r"^[A-Z][a-z]+-[A-Z][a-z]+-\d{4}$")
        login = self.login("um_vendor", temporary)
        self.assertTrue(login.data["must_change_password"])
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {login.data['token']}")
        changed = client.post("/api/auth/change-password/", {"current_password": temporary, "new_password": "My-Own-Pass-2026"}, format="json")
        self.assertEqual(changed.status_code, 200)
        self.assertFalse(self.login("um_vendor", "My-Own-Pass-2026").data["must_change_password"])

    def test_admin_emails_a_reset_link(self):
        from django.core import mail
        response = self.client_for(self.admin).post(f"/api/auth/users/{self.vendor.pk}/send-reset-link/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("reset_uid=", mail.outbox[0].body)
        self.assertEqual(mail.outbox[0].to, ["um_vendor@example.com"])
        log = ActivityLog.objects.filter(action="password reset", target_name="um_vendor").latest("created_at")
        self.assertEqual(log.details["method"], "email link")
        # Only Administrators can do this.
        self.assertEqual(self.client_for(self.officer).post(f"/api/auth/users/{self.vendor.pk}/send-reset-link/").status_code, 403)

    def test_role_change_needs_a_reason_and_tells_the_user(self):
        from django.core import mail
        url = f"/api/auth/users/{self.vendor.pk}/"
        refused = self.client_for(self.admin).patch(url, {"role": "LGU Officer"}, format="json")
        self.assertEqual(refused.status_code, 400)
        self.assertIn("role_change_reason", refused.data)
        self.assertEqual(UserProfile.objects.get(user=self.vendor).role.name, "Fish Vendor")
        done = self.client_for(self.admin).patch(url, {"role": "LGU Officer", "role_change_reason": "Hired as price encoder, memo Nov 5"}, format="json")
        self.assertEqual(done.status_code, 200, done.data)
        log = ActivityLog.objects.filter(action="role changed", target_name="um_vendor").latest("created_at")
        self.assertEqual(log.details["reason"], "Hired as price encoder, memo Nov 5")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("LGU Officer", mail.outbox[0].body)

    def test_admin_created_account_must_choose_own_password(self):
        self.client_for(self.admin).post("/api/auth/users/", {
            "username": "first_login", "email": "first@lgu.gov.ph", "first_name": "First", "last_name": "Login",
            "password": "Str0ng-Pass-2026", "role": "LGU Officer", "municipality": self.cebu.pk,
        }, format="json")
        self.assertTrue(self.login("first_login", "Str0ng-Pass-2026").data["must_change_password"])

    def test_pending_message_names_the_right_reviewer(self):
        self.make_user("wait_vendor", "Fish Vendor", self.cebu, status="pending")
        self.make_user("wait_officer", "LGU Officer", self.cebu, status="pending")
        self.assertIn("LGU Officer", self.login("wait_vendor").data["message"])
        self.assertIn("Administrator", self.login("wait_officer").data["message"])

    # ---- reviewing registrations ----

    def test_lgu_officer_reviews_vendors_in_own_municipality_only(self):
        local = self.make_user("local_vendor", "Fish Vendor", self.cebu, status="pending")
        other = self.make_user("other_vendor", "Fish Vendor", self.mandaue, status="pending")
        pending_lgu = self.make_user("pending_lgu", "LGU Officer", self.cebu, status="pending")
        client = self.client_for(self.officer)

        listed = [row["username"] for row in client.get("/api/auth/users/pending/").data["results"]]
        self.assertEqual(listed, ["local_vendor"])

        self.assertEqual(client.post(f"/api/auth/users/{local.pk}/approve/", {"verification_confirmed": True}, format="json").status_code, 200)
        self.assertEqual(client.post(f"/api/auth/users/{other.pk}/approve/", {"verification_confirmed": True}, format="json").status_code, 403)
        self.assertEqual(client.post(f"/api/auth/users/{pending_lgu.pk}/approve/", {"verification_confirmed": True}, format="json").status_code, 403)

    def test_approval_requires_municipality(self):
        no_muni = self.make_user("no_muni_vendor", "Fish Vendor", None, status="pending")
        response = self.client_for(self.admin).post(f"/api/auth/users/{no_muni.pk}/approve/", {"verification_confirmed": True}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("municipality", response.data["message"])

    # ---- login messages ----

    def test_login_messages_for_pending_and_rejected(self):
        self.make_user("waiting", "Fish Vendor", self.cebu, status="pending")
        self.make_user("refused", "Fish Vendor", self.cebu, status="rejected")
        pending = self.login("waiting")
        self.assertEqual(pending.status_code, 403)
        self.assertIn("pending approval", pending.data["message"])
        rejected = self.login("refused")
        self.assertEqual(rejected.status_code, 403)
        self.assertIn("rejected", rejected.data["message"])
        # A wrong password never reveals the account's status.
        self.assertEqual(self.login("refused", "wrong-password").data["message"], "Invalid username or password.")


# ============================================================
# LOGIN SECURITY (UC-1 3d, Tables 24 and 41)
# ============================================================
from datetime import timedelta as _timedelta

from django.core.cache import cache
from django.test import override_settings

from .models import LoginLockout, TokenActivity


@override_settings(LOGIN_MAX_ATTEMPTS=5, LOGIN_LOCKOUT_MINUTES=15, SESSION_IDLE_MINUTES=30)
class LoginSecurityTests(TestCase):

    def setUp(self):
        cache.clear()  # reset rate-limit counters between tests
        role = Role.objects.create(name="Fish Vendor")
        self.user = User.objects.create_user("sec_vendor", "sec@example.com", "TestPass123!")
        UserProfile.objects.create(user=self.user, role=role, account_status="approved", is_active=True)

    def login(self, password="TestPass123!", username="sec_vendor"):
        return APIClient().post("/api/auth/login/", {"username": username, "password": password}, format="json")

    def test_lockout_after_five_wrong_passwords(self):
        for _ in range(4):
            self.assertEqual(self.login("wrong").status_code, 401)
        locked = self.login("wrong")
        self.assertEqual(locked.status_code, 429)
        self.assertIn("locked", locked.data["message"])
        # Even the right password is refused while locked.
        self.assertEqual(self.login().status_code, 429)
        self.assertTrue(ActivityLog.objects.filter(action="locked", target_name="sec_vendor").exists())
        self.assertEqual(ActivityLog.objects.filter(action="login failed", target_name="sec_vendor").count(), 5)

    def test_lock_expires_after_fifteen_minutes(self):
        for _ in range(5):
            self.login("wrong")
        LoginLockout.objects.filter(username="sec_vendor").update(
            locked_until=timezone.now() - _timedelta(seconds=1)
        )
        self.assertEqual(self.login().status_code, 200)
        self.assertFalse(LoginLockout.objects.filter(username="sec_vendor").exists())

    def test_successful_login_resets_counter_and_is_logged(self):
        for _ in range(3):
            self.login("wrong")
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["session_idle_minutes"], 30)
        self.assertFalse(LoginLockout.objects.filter(username="sec_vendor").exists())
        self.assertTrue(ActivityLog.objects.filter(action="logged in", target_name="sec_vendor").exists())

    def test_username_case_shares_one_counter(self):
        for name in ("SEC_VENDOR", "Sec_Vendor", "sec_vendor", "SEC_vendor", "sec_VENDOR"):
            self.login("wrong", username=name)
        self.assertEqual(self.login().status_code, 429)

    def test_idle_session_expires(self):
        token = self.login().data["token"]
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        self.assertEqual(client.get("/api/auth/me/").status_code, 200)
        TokenActivity.objects.filter(token_id=token).update(last_seen=timezone.now() - _timedelta(minutes=31))
        expired = client.get("/api/auth/me/")
        self.assertEqual(expired.status_code, 401)
        self.assertIn("inactivity", expired.data["detail"])
        self.assertFalse(Token.objects.filter(key=token).exists())

    def test_activity_keeps_session_alive(self):
        token = self.login().data["token"]
        TokenActivity.objects.filter(token_id=token).update(last_seen=timezone.now() - _timedelta(minutes=29))
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        self.assertEqual(client.get("/api/auth/me/").status_code, 200)
        activity = TokenActivity.objects.get(token_id=token)
        self.assertLess(timezone.now() - activity.last_seen, _timedelta(minutes=1))

    def test_logout_deletes_token(self):
        token = self.login().data["token"]
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        self.assertEqual(client.post("/api/auth/logout/").status_code, 200)
        self.assertFalse(Token.objects.filter(key=token).exists())
        self.assertEqual(client.get("/api/auth/me/").status_code, 401)
        self.assertTrue(ActivityLog.objects.filter(action="logged out", target_name="sec_vendor").exists())

    def test_rate_limit(self):
        from rest_framework.throttling import AnonRateThrottle
        with mock.patch.object(AnonRateThrottle, "THROTTLE_RATES", {"anon": "3/minute"}):
            client = APIClient()
            codes = [client.get("/api/health/").status_code for _ in range(4)]
        self.assertEqual(codes, [200, 200, 200, 429])


# ============================================================
# PRICE CORRECTIONS AND SYSTEM CONFIGURATION
# ============================================================
from .models import PriceCorrection, SystemSetting


class PriceCorrectionAndSettingsTests(TestCase):

    def setUp(self):
        cache.clear()
        roles = {name: Role.objects.create(name=name) for name in ("Administrator", "LGU Officer", "Fish Vendor")}
        self.cebu = Municipality.objects.create(name="Cebu City", province="Cebu")
        self.species = FishSpecies.objects.create(name="Galunggong")
        self.users = {}
        for username, role in (("pc_admin", "Administrator"), ("pc_lgu", "LGU Officer"), ("pc_vendor", "Fish Vendor")):
            user = User.objects.create_user(username, f"{username}@example.com", "TestPass123!")
            UserProfile.objects.create(user=user, role=roles[role], municipality=self.cebu, account_status="approved", is_active=True)
            self.users[role] = user
        self.published = PriceRecord.objects.create(
            fish_species=self.species, municipality=self.cebu, price_per_kg=Decimal("180.00"),
            recorded_date=timezone.localdate(), status="published",
        )

    def client_for(self, role):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=self.users[role])[0].key}")
        return client

    def test_correct_published_price_keeps_original(self):
        response = self.client_for("LGU Officer").post(
            f"/api/prices/{self.published.pk}/correct/", {"price_per_kg": "175.50", "reason": "Typo in encoding"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        record = response.data["record"]
        self.assertEqual(record["price_per_kg"], "175.50")
        self.assertTrue(record["is_correction"])
        self.assertEqual(record["corrections"][0]["previous_price"], "180.00")
        self.assertEqual(record["corrections"][0]["reason"], "Typo in encoding")
        self.assertTrue(ActivityLog.objects.filter(action="corrected", target_type="PriceRecord").exists())

    def test_correct_wrong_fish_keeps_original(self):
        bangus = FishSpecies.objects.create(name="Bangus")
        response = self.client_for("LGU Officer").post(
            f"/api/prices/{self.published.pk}/correct/",
            {"fish_species": bangus.pk, "price_per_kg": "190", "reason": "Encoded under the wrong fish"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        record = response.data["record"]
        self.assertEqual(record["fish_name"], "Bangus")
        self.assertEqual(record["price_per_kg"], "190.00")
        correction = record["corrections"][0]
        self.assertEqual((correction["previous_fish"], correction["new_fish"]), ("Galunggong", "Bangus"))
        self.assertEqual(correction["previous_price"], "180.00")
        log = ActivityLog.objects.filter(action="corrected").latest("created_at")
        self.assertEqual(log.details["changes"]["fish_species"], {"from": "Galunggong", "to": "Bangus"})

        # Fish only, price unchanged, works too; nothing changed is refused.
        tamban = FishSpecies.objects.create(name="Tamban")
        only_fish = self.client_for("Administrator").post(
            f"/api/prices/{self.published.pk}/correct/", {"fish_species": tamban.pk, "reason": "Still wrong fish"}, format="json")
        self.assertEqual(only_fish.status_code, 200, only_fish.data)
        self.assertEqual(only_fish.data["record"]["price_per_kg"], "190.00")
        same = self.client_for("Administrator").post(
            f"/api/prices/{self.published.pk}/correct/", {"fish_species": tamban.pk, "reason": "again"}, format="json")
        self.assertEqual(same.status_code, 400)

    def test_correction_cannot_create_a_duplicate(self):
        bangus = FishSpecies.objects.create(name="Bangus")
        PriceRecord.objects.create(fish_species=bangus, municipality=self.cebu, price_per_kg=Decimal("200"),
                                   recorded_date=self.published.recorded_date, status="published")
        response = self.client_for("LGU Officer").post(
            f"/api/prices/{self.published.pk}/correct/", {"fish_species": bangus.pk, "reason": "Wrong fish"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("already has a price", response.data["fish_species"])

    def test_remove_price_published_today_by_mistake(self):
        url = f"/api/prices/{self.published.pk}/withdraw/"
        self.assertEqual(self.client_for("Fish Vendor").post(url, {"reason": "Encoded by mistake"}, format="json").status_code, 403)
        self.assertIn("reason", self.client_for("LGU Officer").post(url, {"reason": ""}, format="json").data)
        response = self.client_for("LGU Officer").post(url, {"reason": "Encoded by mistake, no catch today"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.published.refresh_from_db()
        self.assertEqual(self.published.status, "withdrawn")
        self.assertEqual(self.published.rejection_reason, "Encoded by mistake, no catch today")
        log = ActivityLog.objects.filter(action="withdrawn").latest("created_at")
        self.assertEqual(log.details["price_per_kg"], "180.00")
        # Vendors no longer see it among published prices.
        published = self.client_for("Fish Vendor").get("/api/prices/published/").data
        rows = published["results"] if isinstance(published, dict) else published
        self.assertNotIn(self.published.pk, [r["id"] for r in rows])
        # The right price can be entered again for that day.
        again = self.client_for("LGU Officer").post("/api/prices/", {
            "fish_species": self.species.pk, "municipality": self.cebu.pk, "price_per_kg": "175",
            "recorded_date": str(self.published.recorded_date),
        }, format="json")
        self.assertEqual(again.status_code, 201, again.data)
        twice = self.client_for("LGU Officer").post("/api/prices/", {
            "fish_species": self.species.pk, "municipality": self.cebu.pk, "price_per_kg": "176",
            "recorded_date": str(self.published.recorded_date),
        }, format="json")
        self.assertEqual(twice.status_code, 400)  # a real duplicate is still refused

    def test_older_published_price_cannot_be_withdrawn(self):
        import datetime as _dt
        PriceRecord.objects.filter(pk=self.published.pk).update(created_at=timezone.now() - _dt.timedelta(days=2))
        response = self.client_for("Administrator").post(
            f"/api/prices/{self.published.pk}/withdraw/", {"reason": "Old mistake"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("encoded today", response.data["message"])

    def test_correction_requires_reason_and_lgu_or_admin(self):
        self.assertIn("reason", self.client_for("Administrator").post(
            f"/api/prices/{self.published.pk}/correct/", {"price_per_kg": "170"}, format="json").data)
        self.assertEqual(self.client_for("Fish Vendor").post(
            f"/api/prices/{self.published.pk}/correct/", {"price_per_kg": "170", "reason": "x"}, format="json").status_code, 403)
        self.assertFalse(PriceCorrection.objects.exists())

    def test_published_price_cannot_be_edited_or_deleted(self):
        client = self.client_for("Administrator")
        self.assertEqual(client.patch(f"/api/prices/{self.published.pk}/", {"price_per_kg": "170"}, format="json").status_code, 403)
        self.assertEqual(client.delete(f"/api/prices/{self.published.pk}/").status_code, 403)
        self.assertTrue(PriceRecord.objects.filter(pk=self.published.pk).exists())

    def test_prices_outside_range_are_rejected(self):
        client = self.client_for("LGU Officer")
        response = client.post("/api/prices/", {
            "fish_species": self.species.pk, "municipality": self.cebu.pk, "price_per_kg": "1500",
            "recorded_date": "2030-01-01",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("between", str(response.data["price_per_kg"]))
        too_low = client.post(f"/api/prices/{self.published.pk}/correct/", {"price_per_kg": "10", "reason": "x"}, format="json")
        self.assertEqual(too_low.status_code, 400)

    def test_admin_changes_price_range(self):
        admin = self.client_for("Administrator")
        self.assertEqual(self.client_for("Fish Vendor").get("/api/system-settings/").data["min_price_per_kg"], "50.00")
        self.assertEqual(self.client_for("LGU Officer").patch("/api/system-settings/", {"max_price_per_kg": "2000"}, format="json").status_code, 403)
        bad = admin.patch("/api/system-settings/", {"min_price_per_kg": "500", "max_price_per_kg": "100"}, format="json")
        self.assertEqual(bad.status_code, 400)
        ok = admin.patch("/api/system-settings/", {"max_price_per_kg": "2000"}, format="json")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(SystemSetting.load().max_price_per_kg, Decimal("2000"))
        self.assertTrue(ActivityLog.objects.filter(target_type="SystemSetting").exists())
        # A ₱1,500 price is now allowed.
        response = self.client_for("LGU Officer").post("/api/prices/", {
            "fish_species": self.species.pk, "municipality": self.cebu.pk, "price_per_kg": "1500",
            "recorded_date": "2030-01-01",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)


# ============================================================
# FAIR PRICE CALCULATOR HISTORY AND REPORT LOG
# ============================================================
from .models import ReportLog, WeightEntry


class CalculatorAndReportTests(TestCase):

    def setUp(self):
        cache.clear()
        roles = {name: Role.objects.create(name=name) for name in ("Administrator", "LGU Officer", "Fish Vendor")}
        self.cebu = Municipality.objects.create(name="Cebu City", province="Cebu")
        self.species = FishSpecies.objects.create(name="Galunggong")
        self.other_species = FishSpecies.objects.create(name="Bangus")
        self.users = {}
        for username, role in (("cr_admin", "Administrator"), ("cr_lgu", "LGU Officer"), ("cr_vendor", "Fish Vendor"), ("cr_vendor2", "Fish Vendor")):
            user = User.objects.create_user(username, f"{username}@example.com", "TestPass123!")
            UserProfile.objects.create(user=user, role=roles["Fish Vendor" if username == "cr_vendor2" else role], municipality=self.cebu, account_status="approved", is_active=True)
            self.users[username] = user
        PriceRecord.objects.create(fish_species=self.species, municipality=self.cebu, price_per_kg=Decimal("180.00"),
                                   recorded_date=timezone.localdate() - _timedelta(days=1), status="published")
        PriceRecord.objects.create(fish_species=self.species, municipality=self.cebu, price_per_kg=Decimal("190.00"),
                                   recorded_date=timezone.localdate(), status="pending")

    def client_for(self, username):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=self.users[username])[0].key}")
        return client

    def test_save_calculation_uses_latest_published_price(self):
        response = self.client_for("cr_vendor").post("/api/weight-entries/", {
            "fish_species": self.species.pk, "municipality": self.cebu.pk, "weight_kg": "2.5",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        # The pending ₱190 price is ignored; 2.5 × ₱180 = ₱450.
        self.assertEqual(response.data["price_per_kg"], "180.00")
        self.assertEqual(response.data["computed_price"], "450.00")

    def test_calculation_messages_from_uc3(self):
        client = self.client_for("cr_vendor")
        zero = client.post("/api/weight-entries/", {"fish_species": self.species.pk, "municipality": self.cebu.pk, "weight_kg": "0"}, format="json")
        self.assertEqual(zero.data["weight_kg"], "Weight must be greater than zero.")
        no_price = client.post("/api/weight-entries/", {"fish_species": self.other_species.pk, "municipality": self.cebu.pk, "weight_kg": "1"}, format="json")
        self.assertIn("No current price found", no_price.data["message"])

    def test_history_is_private_and_deletable(self):
        mine = self.client_for("cr_vendor").post("/api/weight-entries/", {
            "fish_species": self.species.pk, "municipality": self.cebu.pk, "weight_kg": "1",
        }, format="json").data
        self.assertEqual(self.client_for("cr_vendor2").get("/api/weight-entries/").data, [])
        self.assertEqual(self.client_for("cr_vendor2").delete(f"/api/weight-entries/{mine['id']}/").status_code, 404)
        self.assertEqual(self.client_for("cr_vendor").delete(f"/api/weight-entries/{mine['id']}/").status_code, 200)
        self.assertFalse(WeightEntry.objects.exists())

    def test_report_log(self):
        payload = {"report_type": "Price History Report", "format": "pdf", "row_count": 12, "parameters": {"species": "Galunggong"}}
        self.assertEqual(self.client_for("cr_vendor").post("/api/reports/", payload, format="json").status_code, 403)
        created = self.client_for("cr_lgu").post("/api/reports/", payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["format"], "PDF")
        self.assertEqual(created.data["generated_by_role"], "LGU Officer")
        self.client_for("cr_admin").post("/api/reports/", {**payload, "format": "CSV"}, format="json")
        self.assertEqual(len(self.client_for("cr_lgu").get("/api/reports/").data), 1)
        self.assertEqual(len(self.client_for("cr_admin").get("/api/reports/").data), 2)
        bad = self.client_for("cr_lgu").post("/api/reports/", {**payload, "format": "DOCX"}, format="json")
        self.assertEqual(bad.status_code, 400)


def _png_upload(name="photo.png"):
    from io import BytesIO
    from PIL import Image
    from django.core.files.uploadedfile import SimpleUploadedFile
    buffer = BytesIO()
    Image.new("RGB", (8, 8), (14, 124, 134)).save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


class RegistrationPhotoAndSpeciesTests(TestCase):
    """Profile photo, registration reason, fish sold, and species photos."""

    def setUp(self):
        import tempfile
        from django.test import override_settings
        media = override_settings(MEDIA_ROOT=tempfile.mkdtemp())
        media.enable()
        self.addCleanup(media.disable)
        cache.clear()
        self.roles = {name: Role.objects.create(name=name) for name in ("Administrator", "LGU Officer", "Fish Vendor")}
        self.cebu = Municipality.objects.create(name="Cebu City", province="Cebu")
        self.bangus = FishSpecies.objects.create(name="Bangus")
        self.tilapia = FishSpecies.objects.create(name="Tilapia")
        self.users = {}
        for username, role in (("rp_admin", "Administrator"), ("rp_lgu", "LGU Officer")):
            user = User.objects.create_user(username, f"{username}@example.com", "TestPass123!")
            UserProfile.objects.create(user=user, role=self.roles[role], municipality=self.cebu, account_status="approved", is_active=True)
            self.users[username] = user

    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=user)[0].key}")
        return client

    def vendor_payload(self, **overrides):
        payload = {
            "username": "new_vendor", "email": "new_vendor@example.com", "password": "TestPass123!",
            "first_name": "Maria", "last_name": "Santos", "role": self.roles["Fish Vendor"].id,
            "municipality": self.cebu.id, "market_name": "Carbon Market", "stall_number": "A-15",
            "registration_reason": "I sell bangus daily and want to follow the official prices.",
            "species_sold": [self.bangus.id, self.tilapia.id],
            "profile_photo": _png_upload("face.png"), "stall_photo": _png_upload("stall.png"),
        }
        payload.update(overrides)
        return {key: value for key, value in payload.items() if value is not None}

    def test_options_list_active_species(self):
        response = APIClient().get("/api/auth/registration-options/")
        self.assertEqual([s["name"] for s in response.data["fish_species"]], ["Bangus", "Tilapia"])

    def test_vendor_registration_saves_photo_reason_and_species(self):
        response = APIClient().post("/api/auth/register/", self.vendor_payload(), format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        vendor = User.objects.get(username="new_vendor")
        self.assertTrue(vendor.aquatimbang_profile.profile_photo)

        pending = self.client_for(self.users["rp_admin"]).get("/api/auth/users/pending/").data["results"][0]
        verification = pending["verification"]
        self.assertTrue(verification["documents"]["profile_photo"])
        self.assertIn("bangus daily", verification["registration_reason"])
        self.assertEqual([s["name"] for s in verification["species_sold"]], ["Bangus", "Tilapia"])

        photo = self.client_for(self.users["rp_lgu"]).get(f"/api/auth/users/{vendor.id}/verification/profile-photo/")
        self.assertEqual(photo.status_code, 200)

    def test_vendor_registration_requires_species_stall_photo_and_reason(self):
        for missing, field in (("species_sold", "species_sold"), ("stall_photo", "stall_photo"), ("profile_photo", "profile_photo")):
            response = APIClient().post("/api/auth/register/", self.vendor_payload(**{missing: None}), format="multipart")
            self.assertEqual(response.status_code, 400, missing)
            self.assertIn(field, response.data)
        short = APIClient().post("/api/auth/register/", self.vendor_payload(registration_reason="Hi"), format="multipart")
        self.assertIn("registration_reason", short.data)

    def test_vendor_updates_fish_sold_and_reads_own_photo(self):
        APIClient().post("/api/auth/register/", self.vendor_payload(), format="multipart")
        vendor = User.objects.get(username="new_vendor")
        UserProfile.objects.filter(user=vendor).update(account_status="approved", is_active=True)
        client = self.client_for(vendor)
        response = client.patch("/api/auth/me/", {"species_sold": [self.tilapia.id]}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([s["name"] for s in response.data["verification"]["species_sold"]], ["Tilapia"])
        self.assertTrue(response.data["has_photo"])
        self.assertEqual(client.patch("/api/auth/me/", {"species_sold": []}, format="json").status_code, 400)
        self.assertEqual(client.get("/api/auth/me/photo/").status_code, 200)
        # LGU Officers do not sell fish.
        lgu = self.client_for(self.users["rp_lgu"]).patch("/api/auth/me/", {"species_sold": [self.bangus.id]}, format="json")
        self.assertEqual(lgu.status_code, 400)

    def test_species_photo_upload_and_view(self):
        lgu = self.client_for(self.users["rp_lgu"])
        response = lgu.patch(f"/api/fish-species/{self.bangus.id}/", {"photo": _png_upload("bangus.png")}, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["has_photo"])
        self.assertEqual(lgu.get(f"/api/fish-species/{self.bangus.id}/photo/").status_code, 200)
        self.assertEqual(lgu.get(f"/api/fish-species/{self.tilapia.id}/photo/").status_code, 404)
        # Fish photos are public so the registration page can show them.
        self.assertEqual(APIClient().get(f"/api/fish-species/{self.bangus.id}/photo/").status_code, 200)
        stale = APIClient()
        stale.credentials(HTTP_AUTHORIZATION="Token expired-or-invalid")
        self.assertEqual(stale.get(f"/api/fish-species/{self.bangus.id}/photo/").status_code, 200)


class SuggestionEditAnnouncementMarketTests(TestCase):
    """Editing/withdrawing suggestions, announcements, and the market list."""

    def setUp(self):
        cache.clear()
        roles = {name: Role.objects.create(name=name) for name in ("Administrator", "LGU Officer", "Fish Vendor")}
        self.cebu = Municipality.objects.create(name="Cebu City", province="Cebu")
        self.fish = FishSpecies.objects.create(name="Bangus")
        self.users = {}
        for username, role in (("se_admin", "Administrator"), ("se_lgu", "LGU Officer"), ("se_vendor", "Fish Vendor"), ("se_vendor2", "Fish Vendor")):
            user = User.objects.create_user(username, f"{username}@example.com", "TestPass123!")
            UserProfile.objects.create(user=user, role=roles[role], municipality=self.cebu, account_status="approved", is_active=True)
            self.users[username] = user

    def client_for(self, username):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=self.users[username])[0].key}")
        return client

    def test_vendor_edits_and_withdraws_own_pending_suggestion(self):
        vendor = self.client_for("se_vendor")
        created = vendor.post("/api/vendor-suggestions/", {"fish_species": self.fish.id, "municipality": self.cebu.id, "suggested_price": "180.00", "comment": "Low catch"}, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        url = f"/api/vendor-suggestions/{created.data['id']}/"

        edited = vendor.patch(url, {"suggested_price": "175.50", "comment": "Many boats today"}, format="json")
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(edited.data["suggested_price"], "175.50")
        self.assertEqual(vendor.patch(url, {"suggested_price": "0"}, format="json").status_code, 400)
        # Another vendor cannot see it; the LGU Officer cannot edit it.
        self.assertEqual(self.client_for("se_vendor2").patch(url, {"comment": "x"}, format="json").status_code, 404)
        self.assertEqual(self.client_for("se_lgu").patch(url, {"comment": "x"}, format="json").status_code, 403)

        withdrawn = vendor.post(f"{url}withdraw/")
        self.assertEqual(withdrawn.data["status"], "withdrawn")
        # Withdrawn suggestions can no longer be changed or reviewed.
        self.assertEqual(vendor.patch(url, {"comment": "again"}, format="json").status_code, 403)
        review = self.client_for("se_lgu").post(f"{url}review/", {"status": "reviewed"}, format="json")
        self.assertEqual(review.status_code, 400)
        self.assertTrue(ActivityLog.objects.filter(action="withdrawn", target_type="VendorPriceSuggestion").exists())

    def test_announcements_by_audience(self):
        admin = self.client_for("se_admin")
        for title, audience in (("Market closed Monday", "all"), ("Vendor meeting", "vendors"), ("Encoding deadline", "lgu")):
            self.assertEqual(admin.post("/api/announcements/", {"title": title, "message": "Details here.", "audience": audience}, format="json").status_code, 201)
        hidden = admin.post("/api/announcements/", {"title": "Draft", "message": "Not yet.", "is_active": False}, format="json")

        titles = lambda name: sorted(a["title"] for a in self.client_for(name).get("/api/announcements/").data)
        self.assertEqual(titles("se_vendor"), ["Market closed Monday", "Vendor meeting"])
        self.assertEqual(titles("se_lgu"), ["Encoding deadline", "Market closed Monday"])
        self.assertEqual(len(titles("se_admin")), 4)
        self.assertEqual(self.client_for("se_vendor").post("/api/announcements/", {"title": "x", "message": "y"}, format="json").status_code, 403)
        self.assertEqual(admin.patch(f"/api/announcements/{hidden.data['id']}/", {"is_active": True}, format="json").status_code, 200)
        self.assertEqual(len(titles("se_vendor")), 3)

    def test_market_list(self):
        from .models import FishVendorVerification
        FishVendorVerification.objects.create(profile=self.users["se_vendor"].aquatimbang_profile, market_name="Carbon  Market", stall_number="A1")
        admin = self.client_for("se_admin")
        created = admin.post("/api/markets/", {"name": "Carbon Market", "municipality": self.cebu.id}, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["vendor_count"], 1)
        duplicate = admin.post("/api/markets/", {"name": "carbon market", "municipality": self.cebu.id}, format="json")
        self.assertEqual(duplicate.status_code, 400)
        admin.post("/api/markets/", {"name": "Pasil Market", "municipality": self.cebu.id, "is_active": False}, format="json")
        self.assertEqual([m["name"] for m in self.client_for("se_vendor").get("/api/markets/").data], ["Carbon Market"])
        self.assertEqual(self.client_for("se_lgu").post("/api/markets/", {"name": "X", "municipality": self.cebu.id}, format="json").status_code, 403)
        options = APIClient().get("/api/auth/registration-options/").data
        self.assertEqual([m["name"] for m in options["markets"]], ["Carbon Market"])


class PasswordResetEmailTests(TestCase):
    """Forgot password by email (UC-1 3e) and the lockout email (UC-1 3d)."""

    def setUp(self):
        cache.clear()
        role = Role.objects.create(name="Fish Vendor")
        city = Municipality.objects.create(name="Cebu City", province="Cebu")
        self.user = User.objects.create_user("pr_vendor", "pr_vendor@example.com", "OldPass123!")
        UserProfile.objects.create(user=self.user, role=role, municipality=city, account_status="approved", is_active=True)
        pending = User.objects.create_user("pr_pending", "pending@example.com", "OldPass123!")
        UserProfile.objects.create(user=pending, role=role, municipality=city)

    def reset_params(self):
        from django.core import mail
        from urllib.parse import parse_qs, urlparse
        link = next(line for line in mail.outbox[-1].body.splitlines() if "reset_uid=" in line)
        query = parse_qs(urlparse(link.strip()).query)
        return query["reset_uid"][0], query["reset_token"][0]

    def test_reset_flow(self):
        from django.core import mail
        client = APIClient()
        response = client.post("/api/auth/password-reset/", {"email": "PR_VENDOR@example.com"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("expires in 1 hour", mail.outbox[0].body)
        uid, token = self.reset_params()

        weak = client.post("/api/auth/password-reset/confirm/", {"uid": uid, "token": token, "new_password": "123"}, format="json")
        self.assertEqual(weak.status_code, 400)
        done = client.post("/api/auth/password-reset/confirm/", {"uid": uid, "token": token, "new_password": "NewPass456!"}, format="json")
        self.assertEqual(done.status_code, 200, done.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass456!"))
        # The link works only once.
        again = client.post("/api/auth/password-reset/confirm/", {"uid": uid, "token": token, "new_password": "Other789!"}, format="json")
        self.assertEqual(again.status_code, 400)
        self.assertTrue(ActivityLog.objects.filter(action="password reset", actor=self.user).exists())

    def test_unknown_or_unapproved_email_gets_same_answer_and_no_mail(self):
        from django.core import mail
        client = APIClient()
        unknown = client.post("/api/auth/password-reset/", {"email": "nobody@example.com"}, format="json")
        pending = client.post("/api/auth/password-reset/", {"email": "pending@example.com"}, format="json")
        self.assertEqual(unknown.data, pending.data)
        self.assertEqual(len(mail.outbox), 0)

    def test_expired_link_is_refused(self):
        from datetime import timedelta as td
        from unittest import mock
        from django.contrib.auth.tokens import default_token_generator
        client = APIClient()
        client.post("/api/auth/password-reset/", {"email": "pr_vendor@example.com"}, format="json")
        uid, token = self.reset_params()
        later = default_token_generator._now() + td(hours=1, minutes=1)
        with mock.patch.object(default_token_generator, "_now", return_value=later):
            response = client.post("/api/auth/password-reset/confirm/", {"uid": uid, "token": token, "new_password": "NewPass456!"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_lockout_sends_email(self):
        from django.core import mail
        from django.test.utils import override_settings
        client = APIClient()
        with self.captureOnCommitCallbacks(execute=True):
            for _ in range(5):
                client.post("/api/auth/login/", {"username": "pr_vendor", "password": "wrong"}, format="json")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("locked", mail.outbox[0].subject)
        self.assertEqual(mail.outbox[0].to, ["pr_vendor@example.com"])


class SetupCommandTests(TestCase):
    def test_setup_creates_roles_and_admin_once(self):
        from io import StringIO
        from django.core.management import call_command
        call_command("setup_aquatimbang", admin_username="boss", admin_email="boss@example.com", admin_password="StrongPass123!", stdout=StringIO())
        call_command("setup_aquatimbang", admin_username="boss", admin_password="StrongPass123!", stdout=StringIO())
        self.assertEqual(Role.objects.count(), 3)
        profile = UserProfile.objects.get(user__username="boss")
        self.assertEqual(profile.role.name, "Administrator")
        self.assertTrue(profile.is_active)
        login = APIClient().post("/api/auth/login/", {"username": "boss", "password": "StrongPass123!"}, format="json")
        self.assertEqual(login.status_code, 200, login.data)


class PriceImportTests(TestCase):
    """Importing historical prices and loading only recent published prices."""

    def setUp(self):
        cache.clear()
        roles = {name: Role.objects.create(name=name) for name in ("Administrator", "LGU Officer", "Fish Vendor")}
        self.cebu = Municipality.objects.create(name="Cebu City", province="Cebu")
        self.bangus = FishSpecies.objects.create(name="Bangus")
        self.users = {}
        for username, role in (("im_lgu", "LGU Officer"), ("im_vendor", "Fish Vendor")):
            user = User.objects.create_user(username, f"{username}@example.com", "TestPass123!")
            UserProfile.objects.create(user=user, role=roles[role], municipality=self.cebu, account_status="approved", is_active=True)
            self.users[username] = user

    def client_for(self, username):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=self.users[username])[0].key}")
        return client

    def rows(self):
        return [
            {"row": 2, "date": "2022-01-03", "fish": "bangus", "municipality": "CEBU CITY", "price": "150.00"},
            {"row": 3, "date": "2022-01-04", "fish": "Bangus", "municipality": "Cebu City", "price": "₱152.5"},
            {"row": 4, "date": "2022-01-04", "fish": "Bangus", "municipality": "Cebu City", "price": "153"},
            {"row": 5, "date": "2022-13-01", "fish": "Bangus", "municipality": "Cebu City", "price": "150"},
            {"row": 6, "date": "2022-01-05", "fish": "Tuna", "municipality": "Cebu City", "price": "150"},
            {"row": 7, "date": "2022-01-06", "fish": "Bangus", "municipality": "Cebu City", "price": "5"},
            {"row": 8, "date": "2099-01-01", "fish": "Bangus", "municipality": "Cebu City", "price": "150"},
        ]

    def test_check_then_import(self):
        lgu = self.client_for("im_lgu")
        check = lgu.post("/api/prices/import/", {"rows": self.rows(), "source": "DVFM", "dry_run": True}, format="json")
        self.assertEqual(check.status_code, 200, check.data)
        # "Tuna" is not in the fish list yet: it is added, not refused.
        self.assertEqual(check.data["ready"], 3)
        self.assertEqual(check.data["imported"], 0)
        self.assertEqual(check.data["new_fish"], ["Tuna"])
        self.assertEqual(sorted(e["row"] for e in check.data["errors"]), [4, 5, 7, 8])
        self.assertEqual(PriceRecord.objects.count(), 0)
        self.assertFalse(FishSpecies.objects.filter(name="Tuna").exists())  # a check adds nothing

        done = lgu.post("/api/prices/import/", {"rows": self.rows(), "source": "DVFM"}, format="json")
        self.assertEqual(done.data["imported"], 3)
        self.assertTrue(FishSpecies.objects.filter(name="Tuna").exists())
        record = PriceRecord.objects.get(recorded_date="2022-01-04")
        self.assertEqual(record.status, "published")
        self.assertEqual(str(record.price_per_kg), "152.50")
        self.assertEqual(record.source, "DVFM")
        self.assertTrue(ActivityLog.objects.filter(action="imported").exists())

        again = lgu.post("/api/prices/import/", {"rows": self.rows(), "source": "DVFM"}, format="json")
        self.assertEqual(again.data["imported"], 0)
        self.assertEqual(again.data["already_recorded"], 3)

    def test_vendor_cannot_import(self):
        response = self.client_for("im_vendor").post("/api/prices/import/", {"rows": self.rows()}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_since_limits_published_prices_only(self):
        from datetime import date
        PriceRecord.objects.create(fish_species=self.bangus, municipality=self.cebu, price_per_kg=Decimal("150"), recorded_date=date(2022, 1, 3), status="published")
        PriceRecord.objects.create(fish_species=self.bangus, municipality=self.cebu, price_per_kg=Decimal("170"), recorded_date=date(2022, 1, 4), status="pending")
        recent = PriceRecord.objects.create(fish_species=self.bangus, municipality=self.cebu, price_per_kg=Decimal("180"), recorded_date=timezone.localdate(), status="published")
        lgu = self.client_for("im_lgu")
        published = lgu.get("/api/prices/published/?since=2023-01-01").data
        ids = [r["id"] for r in (published if isinstance(published, list) else published["results"])]
        self.assertEqual(ids, [recent.id])
        listed = lgu.get("/api/prices/?since=2023-01-01").data
        statuses = sorted(r["status"] for r in (listed if isinstance(listed, list) else listed["results"]))
        self.assertEqual(statuses, ["pending", "published"])
        old = lgu.get("/api/prices/published/?since=2022-01-01&until=2022-12-31").data
        self.assertEqual(len(old if isinstance(old, list) else old["results"]), 1)
        self.assertEqual(lgu.get("/api/prices/?since=yesterday").status_code, 400)


    def good_rows(self, start_day=3):
        return [
            {"row": n, "date": f"2022-02-{start_day + n:02d}", "fish": "Bangus", "municipality": "Cebu City", "price": "160"}
            for n in range(1, 4)
        ]

    def test_import_in_chunks_is_one_batch_that_can_be_undone(self):
        from .models import PriceImportBatch
        lgu = self.client_for("im_lgu")
        rows = self.good_rows()
        for part in (rows[:2], rows[2:]):
            response = lgu.post("/api/prices/import/", {"rows": part, "source": "DVFM", "batch_id": "abc123", "file_name": "wrong.csv"}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
        batch = PriceImportBatch.objects.get(batch_key="abc123")
        self.assertEqual(batch.record_count, 3)
        self.assertEqual(PriceRecord.objects.filter(import_batch=batch, status="published").count(), 3)
        listed = lgu.get("/api/prices/import-batches/").data
        self.assertEqual(listed[0]["file_name"], "wrong.csv")
        self.assertEqual(listed[0]["remaining"], 3)

        self.assertEqual(self.client_for("im_vendor").post(f"/api/prices/import-batches/{batch.pk}/undo/").status_code, 403)
        undo = lgu.post(f"/api/prices/import-batches/{batch.pk}/undo/")
        self.assertEqual(undo.status_code, 200, undo.data)
        self.assertEqual(undo.data["removed"], 3)
        self.assertFalse(PriceRecord.objects.filter(import_batch=batch).exists())
        self.assertTrue(ActivityLog.objects.filter(action="undid import").exists())
        self.assertEqual(lgu.post(f"/api/prices/import-batches/{batch.pk}/undo/").status_code, 400)

    def test_undo_one_fish_from_an_import(self):
        from .models import PriceImportBatch
        tilapia = FishSpecies.objects.create(name="Tilapia")
        lgu = self.client_for("im_lgu")
        rows = self.good_rows() + [
            {"row": 9, "date": "2022-02-08", "fish": "Tilapia", "municipality": "Cebu City", "price": "120"},
            {"row": 10, "date": "2022-02-09", "fish": "Tilapia", "municipality": "Cebu City", "price": "121"},
        ]
        lgu.post("/api/prices/import/", {"rows": rows, "source": "DVFM", "batch_id": "mix1"}, format="json")
        batch = PriceImportBatch.objects.get(batch_key="mix1")
        fish = lgu.get(f"/api/prices/import-batches/{batch.pk}/fish/").data["fish"]
        self.assertEqual({f["name"]: f["prices"] for f in fish}, {"Bangus": 3, "Tilapia": 2})

        done = lgu.post(f"/api/prices/import-batches/{batch.pk}/undo/", {"fish_species": tilapia.pk}, format="json")
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(done.data["removed"], 2)
        self.assertFalse(PriceRecord.objects.filter(import_batch=batch, fish_species=tilapia).exists())
        self.assertEqual(PriceRecord.objects.filter(import_batch=batch).count(), 3)
        batch.refresh_from_db()
        self.assertIsNone(batch.undone_at)  # the Bangus prices are still there
        again = lgu.post(f"/api/prices/import-batches/{batch.pk}/undo/", {"fish_species": tilapia.pk}, format="json")
        self.assertEqual(again.status_code, 400)

        # Removing the last fish marks the whole import as undone.
        lgu.post(f"/api/prices/import-batches/{batch.pk}/undo/", {"fish_species": self.bangus.pk}, format="json")
        batch.refresh_from_db()
        self.assertIsNotNone(batch.undone_at)

    def test_import_can_go_to_review_first(self):
        lgu = self.client_for("im_lgu")
        response = lgu.post("/api/prices/import/", {"rows": self.good_rows(10), "source": "Market survey", "send_to_review": True, "batch_id": "rev1"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        records = PriceRecord.objects.filter(import_batch__batch_key="rev1")
        self.assertEqual(records.count(), 3)
        self.assertTrue(all(r.status == "pending" and r.published_at is None for r in records))

class OwnProfilePhotoTests(TestCase):
    def setUp(self):
        import tempfile
        media = override_settings(MEDIA_ROOT=tempfile.mkdtemp())
        media.enable()
        self.addCleanup(media.disable)
        role = Role.objects.create(name="Administrator")
        self.user = User.objects.create_user("pp_admin", "pp@example.com", "TestPass123!")
        UserProfile.objects.create(user=self.user, role=role, account_status="approved", is_active=True)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.user).key}")

    def test_upload_view_and_remove_own_photo(self):
        self.assertEqual(self.client.get("/api/auth/me/photo/").status_code, 404)
        uploaded = self.client.post("/api/auth/me/photo/", {"photo": _png_upload("me.png")}, format="multipart")
        self.assertEqual(uploaded.status_code, 200, uploaded.data)
        self.assertTrue(uploaded.data["has_photo"])
        self.assertTrue(uploaded.data["photo_version"])
        self.assertEqual(self.client.get("/api/auth/me/photo/").status_code, 200)
        from django.core.files.uploadedfile import SimpleUploadedFile
        bad = self.client.post("/api/auth/me/photo/", {"photo": SimpleUploadedFile("x.png", b"not an image", content_type="image/png")}, format="multipart")
        self.assertEqual(bad.status_code, 400)
        removed = self.client.delete("/api/auth/me/photo/")
        self.assertFalse(removed.data["has_photo"])
        self.assertEqual(self.client.get("/api/auth/me/photo/").status_code, 404)


class LoadFishSpeciesCommandTests(TestCase):
    def test_adds_missing_species_and_keeps_existing_ones(self):
        from io import StringIO
        from django.core.management import call_command
        FishSpecies.objects.create(name="bangus", scientific_name="", description="Our own note")
        FishSpecies.objects.create(name="Tilapia", scientific_name="Custom name", description="Mine")
        call_command("load_fish_species", stdout=StringIO())
        call_command("load_fish_species", stdout=StringIO())  # running twice adds nothing more
        self.assertEqual(FishSpecies.objects.filter(name__iexact="bangus").count(), 1)
        bangus = FishSpecies.objects.get(name__iexact="bangus")
        self.assertEqual(bangus.scientific_name, "Chanos chanos")
        self.assertEqual(bangus.description, "Our own note")
        self.assertEqual(FishSpecies.objects.get(name="Tilapia").scientific_name, "Custom name")
        self.assertTrue(FishSpecies.objects.filter(name="Galunggong", scientific_name="Decapterus macrosoma").exists())
        self.assertEqual(FishSpecies.objects.count(), 23)


class LoadFishPhotosTests(TestCase):
    def setUp(self):
        import tempfile
        media = override_settings(MEDIA_ROOT=tempfile.mkdtemp())
        media.enable()
        self.addCleanup(media.disable)

    def test_photos_are_attached_once(self):
        from io import StringIO
        from django.core.management import call_command
        call_command("load_fish_species", stdout=StringIO())
        bangus = FishSpecies.objects.get(name="Bangus")
        self.assertTrue(bangus.photo)
        first = bangus.photo.name
        call_command("load_fish_species", stdout=StringIO())
        bangus.refresh_from_db()
        self.assertEqual(bangus.photo.name, first)  # not replaced without --replace-photos
        self.assertTrue(FishSpecies.objects.get(name="Bisugo").photo)
        self.assertTrue(FishSpecies.objects.get(name="Alumahan").photo)
        self.assertTrue(FishSpecies.objects.get(name="Dalagang Bukid").photo)  # multi-word name
        self.assertTrue(FishSpecies.objects.get(name="Lapu-lapu").photo)  # hyphenated name
        self.assertFalse(FishSpecies.objects.get(name="Galunggong").photo)


class PriceExplanationTests(TestCase):
    """Closed fishing seasons and the "Why is the price changing?" explanation."""

    @classmethod
    def setUpTestData(cls):
        from .models import ClosedFishingSeason
        cls.municipality = Municipality.objects.create(name="Cebu City", province="Cebu")
        cls.fish = FishSpecies.objects.create(name="Tamban")
        cls.other = FishSpecies.objects.create(name="Tilapia")
        roles = {name: Role.objects.get_or_create(name=name)[0] for name in ("Fish Vendor", "LGU Officer")}
        cls.vendor = User.objects.create_user("px_vendor", "pxv@example.com", "TestPass123!")
        UserProfile.objects.create(user=cls.vendor, role=roles["Fish Vendor"], municipality=cls.municipality, account_status="approved", is_active=True)
        cls.officer = User.objects.create_user("px_officer", "pxo@example.com", "TestPass123!")
        UserProfile.objects.create(user=cls.officer, role=roles["LGU Officer"], municipality=cls.municipality, account_status="approved", is_active=True)

        # Price jumps from ₱150 to ₱180 in the last week, after storms and a fuel increase.
        cls.today = datetime.date(2026, 11, 20)
        for back in range(20, -1, -1):
            day = cls.today - datetime.timedelta(days=back)
            PriceRecord.objects.create(
                fish_species=cls.fish, municipality=cls.municipality,
                price_per_kg=Decimal("180.00") if back <= 3 else Decimal("150.00"),
                recorded_date=day, status="published",
            )
            PriceRecord.objects.create(
                fish_species=cls.other, municipality=cls.municipality,
                price_per_kg=Decimal("120.00"), recorded_date=day, status="published",
            )
        ExternalFactor.objects.create(date=cls.today - datetime.timedelta(days=30), fuel_price=Decimal("60.00"), weather="sunny")
        ExternalFactor.objects.create(date=cls.today - datetime.timedelta(days=2), fuel_price=Decimal("65.00"), weather="stormy")
        ExternalFactor.objects.create(date=cls.today - datetime.timedelta(days=1), weather="stormy")
        cls.season = ClosedFishingSeason.objects.get(name="Visayan Sea closed season")  # added by the migration
        cls.season.species.add(cls.fish)

    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=user)[0].key}")
        return client

    def test_season_dates_cross_the_new_year(self):
        # Visayan Sea: Nov 15 - Feb 15.
        self.assertTrue(self.season.covers(datetime.date(2026, 12, 25)))
        self.assertTrue(self.season.covers(datetime.date(2027, 2, 15)))
        self.assertTrue(self.season.covers(datetime.date(2026, 11, 15)))
        self.assertFalse(self.season.covers(datetime.date(2026, 11, 14)))
        self.assertFalse(self.season.covers(datetime.date(2027, 6, 1)))

    def test_rising_price_is_explained(self):
        from .explanations import explain_price
        result = explain_price(self.fish, self.municipality)
        self.assertEqual(result["direction"], "up")
        self.assertEqual(result["change_pct"], 20.0)
        kinds = {r["kind"]: r for r in result["reasons"]}
        self.assertTrue(kinds["season"]["matches"])
        self.assertIn("Visayan Sea", kinds["season"]["title"])
        self.assertIn("2 stormy days", kinds["weather"]["detail"])
        self.assertEqual(kinds["fuel"]["effect"], "up")
        self.assertIn("Likely reasons", result["summary"])

    def test_steady_price_and_fish_outside_the_season(self):
        from .explanations import explain_price
        result = explain_price(self.other, self.municipality)
        self.assertEqual(result["direction"], "steady")
        self.assertNotIn("season", {r["kind"] for r in result["reasons"]})
        self.assertFalse(any(r["matches"] for r in result["reasons"]))

    def test_not_enough_data(self):
        from .explanations import explain_price
        empty = FishSpecies.objects.create(name="Lapu-lapu")
        self.assertFalse(explain_price(empty, self.municipality)["enough_data"])

    def test_explanation_api(self):
        response = self.client_for(self.vendor).get(
            "/api/price-explanation/", {"species": self.fish.pk, "municipality": self.municipality.pk}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["direction"], "up")
        bad = self.client_for(self.vendor).get("/api/price-explanation/", {"species": "x"})
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(APIClient().get("/api/price-explanation/", {"species": self.fish.pk}).status_code, 401)

    def test_only_lgu_and_admin_can_change_seasons(self):
        payload = {
            "name": "Test closed season", "area": "Camotes Sea", "start_month": 12, "start_day": 1,
            "end_month": 2, "end_day": 28, "species": [self.fish.pk],
        }
        vendor = self.client_for(self.vendor)
        self.assertEqual(vendor.get("/api/closed-seasons/").status_code, 200)
        self.assertEqual(vendor.post("/api/closed-seasons/", payload, format="json").status_code, 403)
        officer = self.client_for(self.officer)
        created = officer.post("/api/closed-seasons/", payload, format="json")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["species_names"], ["Tamban"])
        bad = officer.post("/api/closed-seasons/", {**payload, "end_month": 2, "end_day": 31}, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_fish_loader_links_seasons_but_does_not_restore_deleted_ones(self):
        from io import StringIO
        from django.core.management import call_command
        from .models import ClosedFishingSeason
        ClosedFishingSeason.objects.filter(name="Davao Gulf closed season").delete()
        import tempfile
        with self.settings(MEDIA_ROOT=tempfile.mkdtemp()):
            call_command("load_fish_species", stdout=StringIO())
        galunggong = FishSpecies.objects.get(name="Galunggong")
        palawan = ClosedFishingSeason.objects.get(name="Galunggong closed season")
        self.assertIn(galunggong, palawan.species.all())
        self.assertFalse(ClosedFishingSeason.objects.filter(name="Davao Gulf closed season").exists())


class LoadDemoDataTests(TestCase):
    """load_demo_data adds clearly labelled simulated data and removes only that."""

    def test_load_and_clear_keep_real_data(self):
        from io import StringIO
        from django.core.management import call_command
        cebu = Municipality.objects.create(name="Cebu City", province="Cebu")
        bangus = FishSpecies.objects.create(name="Bangus")
        FishSpecies.objects.create(name="Tamban")
        today = timezone.localdate()
        real_day = today - datetime.timedelta(days=5)
        real = PriceRecord.objects.create(
            fish_species=bangus, municipality=cebu, price_per_kg=Decimal("199.00"),
            recorded_date=real_day, status="published", source="LGU",
        )
        ExternalFactor.objects.create(date=real_day, weather="sunny", notes="Logged by LGU")

        call_command("load_demo_data", "--days", "90", stdout=StringIO())
        demo = PriceRecord.objects.filter(source="SIMULATED DEMO DATA")
        self.assertEqual(demo.count(), 90 * 2 - 1)  # the real Bangus day is skipped
        self.assertTrue(all(p.status == "published" and p.price_per_kg > 0 for p in demo))
        self.assertEqual(ExternalFactor.objects.filter(notes__startswith="[Demo]").count(), 89)
        real.refresh_from_db()
        self.assertEqual(real.price_per_kg, Decimal("199.00"))

        call_command("load_demo_data", "--clear", stdout=StringIO())
        self.assertFalse(PriceRecord.objects.filter(source="SIMULATED DEMO DATA").exists())
        self.assertFalse(ExternalFactor.objects.filter(notes__startswith="[Demo]").exists())
        self.assertTrue(PriceRecord.objects.filter(pk=real.pk).exists())
        self.assertTrue(ExternalFactor.objects.filter(notes="Logged by LGU").exists())

    def test_needs_an_existing_municipality(self):
        from io import StringIO
        from django.core.management import call_command
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            call_command("load_demo_data", "--municipality", "Atlantis", stdout=StringIO())


class FishScanPhotoTests(TestCase):
    """Fish scanner phase 1: collecting and reviewing labelled fish photos."""

    @classmethod
    def setUpTestData(cls):
        cls.municipality = Municipality.objects.create(name="Cebu City", province="Cebu")
        cls.galunggong = FishSpecies.objects.create(name="Galunggong")
        cls.bangus = FishSpecies.objects.create(name="Bangus")
        roles = {name: Role.objects.get_or_create(name=name)[0] for name in ("Fish Vendor", "LGU Officer")}

        def make(username, role):
            user = User.objects.create_user(username, f"{username}@example.com", "TestPass123!")
            UserProfile.objects.create(user=user, role=roles[role], municipality=cls.municipality, account_status="approved", is_active=True)
            return user

        cls.vendor = make("scan_vendor", "Fish Vendor")
        cls.other_vendor = make("scan_vendor2", "Fish Vendor")
        cls.officer = make("scan_officer", "LGU Officer")

    def setUp(self):
        import tempfile
        media = self.settings(MEDIA_ROOT=tempfile.mkdtemp())
        media.enable()
        self.addCleanup(media.disable)

    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=user)[0].key}")
        return client

    def photo(self, size=(1600, 1200)):
        from io import BytesIO
        from PIL import Image
        from django.core.files.uploadedfile import SimpleUploadedFile
        buffer = BytesIO()
        exif = Image.Exif()
        exif[0x010F] = "PhoneMaker"  # any EXIF tag; real phones also add GPS here
        Image.new("RGB", size, (40, 90, 160)).save(buffer, "JPEG", exif=exif)
        return SimpleUploadedFile("fish.jpg", buffer.getvalue(), content_type="image/jpeg")

    def upload(self, user, fish=None):
        return self.client_for(user).post(
            "/api/fish-scans/", {"image": self.photo(), "fish_species": (fish or self.galunggong).pk}, format="multipart"
        )

    def test_upload_is_shrunk_and_has_no_exif(self):
        from PIL import Image
        from .models import FishScanPhoto
        response = self.upload(self.vendor)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["status"], "pending")
        scan = FishScanPhoto.objects.get(pk=response.data["id"])
        self.assertEqual(scan.municipality, self.municipality)
        with Image.open(scan.image.path) as image:
            self.assertLessEqual(max(image.size), 640)
            self.assertEqual(len(image.getexif()), 0)

    def test_rejects_non_images(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        bad = SimpleUploadedFile("fish.jpg", b"not an image", content_type="image/jpeg")
        response = self.client_for(self.vendor).post(
            "/api/fish-scans/", {"image": bad, "fish_species": self.galunggong.pk}, format="multipart"
        )
        self.assertEqual(response.status_code, 400)

    def test_vendors_only_see_their_own_photos(self):
        mine = self.upload(self.vendor).data["id"]
        theirs = self.upload(self.other_vendor).data["id"]
        listed = self.client_for(self.vendor).get("/api/fish-scans/").data
        rows = listed["results"] if isinstance(listed, dict) else listed
        self.assertEqual([r["id"] for r in rows], [mine])
        self.assertEqual(self.client_for(self.vendor).get(f"/api/fish-scans/{theirs}/image/").status_code, 404)
        self.assertEqual(self.client_for(self.vendor).get(f"/api/fish-scans/{mine}/image/").status_code, 200)
        officer_rows = self.client_for(self.officer).get("/api/fish-scans/").data
        officer_rows = officer_rows["results"] if isinstance(officer_rows, dict) else officer_rows
        self.assertEqual(len(officer_rows), 2)

    def test_lgu_reviews_and_fixes_the_fish_name(self):
        scan_id = self.upload(self.vendor).data["id"]
        self.assertEqual(
            self.client_for(self.vendor).post(f"/api/fish-scans/{scan_id}/review/", {"status": "approved"}).status_code, 403
        )
        response = self.client_for(self.officer).post(
            f"/api/fish-scans/{scan_id}/review/", {"status": "approved", "fish_species": self.bangus.pk}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["fish_name"], "Bangus")
        self.assertEqual(response.data["status"], "approved")
        # Once reviewed, the vendor can no longer delete it; the LGU can.
        self.assertEqual(self.client_for(self.vendor).delete(f"/api/fish-scans/{scan_id}/").status_code, 403)
        self.assertEqual(self.client_for(self.officer).delete(f"/api/fish-scans/{scan_id}/").status_code, 204)

    def test_summary_and_export(self):
        import zipfile
        from io import BytesIO
        first = self.upload(self.vendor).data["id"]
        self.upload(self.vendor, self.bangus)
        self.client_for(self.officer).post(f"/api/fish-scans/{first}/review/", {"status": "approved"}, format="json")
        summary = self.client_for(self.vendor).get("/api/fish-scans/summary/").data
        counts = {row["name"]: (row["approved"], row["pending"]) for row in summary["species"]}
        self.assertEqual(counts["Galunggong"], (1, 0))
        self.assertEqual(counts["Bangus"], (0, 1))
        self.assertEqual(summary["my_photos"], 2)
        self.assertEqual(summary["target"], 30)

        self.assertEqual(self.client_for(self.vendor).get("/api/fish-scans/export/").status_code, 403)
        response = self.client_for(self.officer).get("/api/fish-scans/export/")
        self.assertEqual(response.status_code, 200)
        archive = zipfile.ZipFile(BytesIO(b"".join(response.streaming_content)))
        self.assertEqual(archive.namelist(), [f"Galunggong/photo_{first}.jpg"])

    def test_daily_limit(self):
        from unittest import mock
        with mock.patch("api.views.SCAN_DAILY_LIMIT", 2):
            self.assertEqual(self.upload(self.vendor).status_code, 201)
            self.assertEqual(self.upload(self.vendor).status_code, 201)
            self.assertEqual(self.upload(self.vendor).status_code, 429)


class PublicFishProfileTests(TestCase):
    """Fish profile shown when a price is clicked on the landing page."""

    def setUp(self):
        cache.clear()
        self.cebu = Municipality.objects.create(name="Cebu City", province="Cebu")
        self.mandaue = Municipality.objects.create(name="Mandaue City", province="Cebu")
        self.fish = FishSpecies.objects.create(name="Galunggong", scientific_name="Decapterus spp.", description="Round scad.")
        today = timezone.localdate()
        for back in range(0, 10):
            PriceRecord.objects.create(
                fish_species=self.fish, municipality=self.cebu, price_per_kg=Decimal(200 - back),
                recorded_date=today - datetime.timedelta(days=back), status="published",
            )
        PriceRecord.objects.create(fish_species=self.fish, municipality=self.mandaue, price_per_kg=Decimal("190"),
                                   recorded_date=today, status="published")
        # Not official: must never appear publicly.
        PriceRecord.objects.create(fish_species=self.fish, municipality=self.cebu, price_per_kg=Decimal("999"),
                                   recorded_date=today + datetime.timedelta(days=1), status="pending")

    def test_profile_shows_only_published_prices(self):
        response = APIClient().get(f"/api/public/fish/{self.fish.pk}/", {"municipality": self.cebu.pk})
        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertEqual(data["fish"]["scientific_name"], "Decapterus spp.")
        self.assertEqual(data["latest"]["price_per_kg"], 200.0)
        self.assertEqual(data["week_ago"]["price_per_kg"], 193.0)
        self.assertEqual(data["weekly_change_percent"], 3.6)
        self.assertEqual(len(data["history"]), 10)
        self.assertEqual(data["stats_30_days"]["high"], 200.0)
        self.assertNotIn(999.0, [h["price"] for h in data["history"]])
        self.assertEqual(data["also_priced_in"], ["Mandaue City"])

    def test_unknown_or_unpriced_fish(self):
        self.assertEqual(APIClient().get("/api/public/fish/9999/").status_code, 404)
        lonely = FishSpecies.objects.create(name="Lapu-lapu")
        self.assertEqual(APIClient().get(f"/api/public/fish/{lonely.pk}/").status_code, 404)


class ProfileRegistrationDetailsTests(TestCase):
    """My Profile returns what was asked at registration."""

    def test_profile_includes_registration_answers(self):
        role = Role.objects.create(name="Fish Vendor")
        cebu = Municipality.objects.create(name="Cebu City", province="Cebu")
        user = User.objects.create_user("reg_vendor", "rv@example.com", "TestPass123!")
        UserProfile.objects.create(
            user=user, role=role, municipality=cebu, account_status="approved", is_active=True,
            date_of_birth=datetime.date(1985, 3, 2), sex="female", reviewed_at=timezone.now(),
            registration_reason="I sell bangus at Carbon Market.",
        )
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        data = client.get("/api/auth/me/").data
        self.assertEqual(data["date_of_birth"], "1985-03-02")
        self.assertEqual(data["sex"], "female")
        self.assertTrue(data["reviewed_at"])
        self.assertEqual(data["registration_reason"], "I sell bangus at Carbon Market.")


class VendorArchivingTests(TestCase):
    """Vendor accounts unused for 5 years are archived automatically."""

    def setUp(self):
        cache.clear()
        self.roles = {name: Role.objects.get_or_create(name=name)[0] for name in ("Administrator", "Fish Vendor", "LGU Officer")}
        self.cebu = Municipality.objects.create(name="Cebu City", province="Cebu")
        now = timezone.now()

        def make(username, role, last_login=None, joined=None):
            user = User.objects.create_user(username, f"{username}@example.com", "TestPass123!")
            User.objects.filter(pk=user.pk).update(last_login=last_login, date_joined=joined or now)
            UserProfile.objects.create(user=user, role=self.roles[role], municipality=self.cebu, account_status="approved", is_active=True)
            return User.objects.get(pk=user.pk)

        self.old_vendor = make("old_vendor", "Fish Vendor", last_login=now - datetime.timedelta(days=365 * 5 + 10))
        self.never_vendor = make("never_vendor", "Fish Vendor", joined=now - datetime.timedelta(days=365 * 6))
        self.recent_vendor = make("recent_vendor", "Fish Vendor", last_login=now - datetime.timedelta(days=365 * 4))
        self.old_officer = make("old_officer", "LGU Officer", last_login=now - datetime.timedelta(days=365 * 7))
        self.admin = make("arch_admin", "Administrator", last_login=now)

    def test_unused_vendors_are_archived_not_deleted(self):
        from .archiving import archive_inactive_vendors
        self.assertEqual(archive_inactive_vendors(), 2)
        for user in (self.old_vendor, self.never_vendor):
            profile = UserProfile.objects.get(user=user)
            self.assertFalse(profile.is_active)
            self.assertIsNotNone(profile.archived_at)
        self.assertTrue(UserProfile.objects.get(user=self.recent_vendor).is_active)
        self.assertTrue(UserProfile.objects.get(user=self.old_officer).is_active)  # only vendors
        self.assertEqual(ActivityLog.objects.filter(action="archived", actor_username="System").count(), 2)

        login = APIClient().post("/api/auth/login/", {"username": "old_vendor", "password": "TestPass123!"}, format="json")
        self.assertEqual(login.status_code, 403)
        self.assertIn("archived", login.data["message"])

    def test_archiving_runs_by_itself_and_admin_can_reactivate(self):
        # The first login of the day runs the check, even another user's login.
        APIClient().post("/api/auth/login/", {"username": "recent_vendor", "password": "TestPass123!"}, format="json")
        self.assertIsNotNone(UserProfile.objects.get(user=self.old_vendor).archived_at)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.admin).key}")
        row = client.post(f"/api/auth/users/{self.old_vendor.pk}/status/", {"active": True}, format="json")
        self.assertEqual(row.status_code, 200, row.data)
        self.assertIsNone(row.data["archived_at"])
        self.assertEqual(
            APIClient().post("/api/auth/login/", {"username": "old_vendor", "password": "TestPass123!"}, format="json").status_code, 200
        )


class PriceInsightsTests(TestCase):
    """Learned anomaly detection and association-rule market insights."""

    def setUp(self):
        cache.clear()
        roles = {name: Role.objects.get_or_create(name=name)[0] for name in ("LGU Officer", "Fish Vendor")}
        self.cebu = Municipality.objects.create(name="Cebu City", province="Cebu")
        self.fish = FishSpecies.objects.create(name="Galunggong")
        self.officer = User.objects.create_user("ins_lgu", "il@example.com", "TestPass123!")
        UserProfile.objects.create(user=self.officer, role=roles["LGU Officer"], municipality=self.cebu, account_status="approved", is_active=True)
        self.vendor = User.objects.create_user("ins_vendor", "iv@example.com", "TestPass123!")
        UserProfile.objects.create(user=self.vendor, role=roles["Fish Vendor"], municipality=self.cebu, account_status="approved", is_active=True)

        # 120 days around ₱180; storms add about ₱20; one wrong entry of ₱320 yesterday.
        self.today = timezone.localdate()
        for back in range(120, 1, -1):
            day = self.today - datetime.timedelta(days=back)
            stormy = back % 6 == 0
            ExternalFactor.objects.create(date=day, weather="stormy" if stormy else "sunny", fuel_price=Decimal("62"))
            price = Decimal("200") if stormy else Decimal(180 + (back % 3))
            PriceRecord.objects.create(fish_species=self.fish, municipality=self.cebu, price_per_kg=price,
                                       recorded_date=day, status="published")
        self.wrong = PriceRecord.objects.create(fish_species=self.fish, municipality=self.cebu, price_per_kg=Decimal("320"),
                                                recorded_date=self.today - datetime.timedelta(days=1), status="published")

    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=user)[0].key}")
        return client

    def test_price_check_learns_the_normal_range(self):
        client = self.client_for(self.officer)
        normal = client.get("/api/insights/price-check/", {"species": self.fish.pk, "municipality": self.cebu.pk, "price": "181"}).data
        self.assertEqual(normal["level"], "normal")
        high = client.get("/api/insights/price-check/", {"species": self.fish.pk, "municipality": self.cebu.pk, "price": "300"}).data
        self.assertEqual(high["level"], "very_unusual")
        self.assertIn("higher than the usual", high["message"])
        self.assertEqual(self.client_for(self.vendor).get(
            "/api/insights/price-check/", {"species": self.fish.pk, "municipality": self.cebu.pk, "price": "300"}).status_code, 403)

    def test_outliers_find_the_wrong_entry(self):
        data = self.client_for(self.officer).get("/api/insights/outliers/", {"days": 30}).data
        ids = [row["id"] for row in data["outliers"]]
        self.assertEqual(ids[0], self.wrong.pk)

    def test_rules_find_storms_raise_prices(self):
        data = self.client_for(self.officer).get("/api/insights/rules/", {"species": self.fish.pk}).data
        self.assertGreater(data["transactions"], 50)
        storm = [r for r in data["rules"] if r["conditions"] == ["stormy"] and r["outcome"] == "above"]
        self.assertTrue(storm, data["rules"])
        self.assertGreater(storm[0]["confidence"], 0.8)
        self.assertGreater(storm[0]["lift"], 2)

    def test_settings_preview_then_apply(self):
        from .models import ActivityLog, InsightSetting
        client = self.client_for(self.officer)
        settings_data = client.get("/api/insights/settings/").data
        self.assertEqual(settings_data["values"]["unusual_percent"], 12.0)

        # Preview only: the ₱320 entry (about 77% above usual) would no longer be flagged.
        loose = {"unusual_percent": 90, "very_unusual_percent": 150}
        preview = client.post("/api/insights/settings/preview/", loose, format="json").data
        self.assertIn(self.wrong.pk, [r["id"] for r in preview["outliers"]["no_longer_flagged"]])
        self.assertEqual(InsightSetting.load().values()["unusual_percent"], 12.0)

        # Bad values and a missing reason are refused; vendors cannot change it.
        self.assertEqual(client.post("/api/insights/settings/preview/", {"unusual_percent": 30, "very_unusual_percent": 20}, format="json").status_code, 400)
        self.assertEqual(client.put("/api/insights/settings/", loose, format="json").status_code, 400)
        self.assertEqual(self.client_for(self.vendor).put("/api/insights/settings/", {**loose, "reason": "x"}, format="json").status_code, 403)

        # Apply: the price check now uses the new cut-off and the change is logged.
        applied = client.put("/api/insights/settings/", {**loose, "reason": "Prices swing a lot here"}, format="json")
        self.assertEqual(applied.status_code, 200)
        self.assertEqual(applied.data["values"]["unusual_percent"], 90.0)
        check = client.get("/api/insights/price-check/", {"species": self.fish.pk, "municipality": self.cebu.pk, "price": "300"}).data
        self.assertEqual(check["level"], "normal")
        log = ActivityLog.objects.get(target_type="InsightSetting")
        self.assertEqual(log.details["reason"], "Prices swing a lot here")


class CommunityAverageTests(TestCase):
    """Community Average: last 30 days, reviewed + adopted only, adopted shown separately."""

    def test_recent_reviewed_and_adopted_only(self):
        from .models import VendorPriceSuggestion
        role = Role.objects.get_or_create(name="Fish Vendor")[0]
        place = Municipality.objects.create(name="Talisay", province="Cebu")
        fish = FishSpecies.objects.create(name="Tulingan")
        vendor = User.objects.create_user("ca_vendor", "ca@example.com", "TestPass123!")
        UserProfile.objects.create(user=vendor, role=role, municipality=place, account_status="approved", is_active=True)

        def suggest(price, status, days_ago=0):
            s = VendorPriceSuggestion.objects.create(vendor=vendor, fish_species=fish, municipality=place,
                                                     suggested_price=Decimal(price), status=status,
                                                     reviewed_at=timezone.now() if status != "pending" else None)
            VendorPriceSuggestion.objects.filter(pk=s.pk).update(created_at=timezone.now() - datetime.timedelta(days=days_ago))

        suggest("190", "adopted")
        suggest("200", "adopted", 3)
        suggest("180", "reviewed", 5)
        suggest("500", "pending")           # not reviewed yet: ignored
        suggest("100", "rejected")          # rejected: ignored
        suggest("300", "adopted", 45)       # too old: ignored

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=vendor)[0].key}")
        rows = client.get("/api/vendor-suggestions/community-average/").data
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["submission_count"], 3)
        self.assertEqual(row["adopted_count"], 2)
        self.assertEqual(row["reviewed_count"], 1)
        self.assertEqual(float(row["average_price"]), 190.0)
        self.assertEqual(float(row["adopted_average"]), 195.0)
        self.assertIsNotNone(row["latest_adopted_at"])


class PresenceTests(TestCase):
    """Online / Offline in the Administrator's user list."""

    def test_online_until_logout_or_quiet(self):
        roles = {n: Role.objects.get_or_create(name=n)[0] for n in ("Administrator", "Fish Vendor")}
        place = Municipality.objects.create(name="Mandaue", province="Cebu")
        admin = User.objects.create_user("pr_admin", "pa@example.com", "TestPass123!")
        UserProfile.objects.create(user=admin, role=roles["Administrator"], account_status="approved", is_active=True)
        vendor = User.objects.create_user("pr_vendor", "pv@example.com", "TestPass123!")
        vprofile = UserProfile.objects.create(user=vendor, role=roles["Fish Vendor"], municipality=place, account_status="approved", is_active=True)

        def client_for(user):
            c = APIClient()
            c.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=user)[0].key}")
            return c

        def vendor_row():
            rows = client_for(admin).get("/api/auth/users/").data
            return next(r for r in rows if r["username"] == "pr_vendor")

        self.assertFalse(vendor_row()["is_online"])            # never used the site

        vclient = client_for(vendor)
        self.assertEqual(vclient.post("/api/auth/heartbeat/").status_code, 200)
        self.assertTrue(vendor_row()["is_online"])

        # Quiet for longer than the online window -> offline, last seen kept.
        UserProfile.objects.filter(pk=vprofile.pk).update(last_seen=timezone.now() - datetime.timedelta(minutes=10))
        row = vendor_row()
        self.assertFalse(row["is_online"])
        self.assertIsNotNone(row["last_seen"])

        # Back, then logged out -> offline immediately.
        vclient.post("/api/auth/heartbeat/")
        UserProfile.objects.filter(pk=vprofile.pk).update(last_seen=timezone.now())
        self.assertTrue(vendor_row()["is_online"])
        self.assertEqual(vclient.post("/api/auth/logout/").status_code, 200)
        self.assertFalse(vendor_row()["is_online"])


class MessagingTests(TestCase):
    """Vendor <-> LGU (same municipality), LGU <-> Admin, Vendor <-> Admin; no vendor to vendor."""

    def setUp(self):
        roles = {n: Role.objects.get_or_create(name=n)[0] for n in ("Administrator", "LGU Officer", "Fish Vendor")}
        self.cebu = Municipality.objects.create(name="Msg Cebu", province="Cebu")
        self.talisay = Municipality.objects.create(name="Msg Talisay", province="Cebu")

        def make(name, role, place=None):
            user = User.objects.create_user(name, f"{name}@example.com", "TestPass123!")
            UserProfile.objects.create(user=user, role=roles[role], municipality=place, account_status="approved", is_active=True)
            return user

        self.admin = make("m_admin", "Administrator")
        self.lgu = make("m_lgu", "LGU Officer", self.cebu)
        self.vendor = make("m_vendor", "Fish Vendor", self.cebu)
        self.vendor2 = make("m_vendor2", "Fish Vendor", self.cebu)
        self.far_vendor = make("m_far", "Fish Vendor", self.talisay)

    def client_for(self, user):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=user)[0].key}")
        return c

    def test_who_can_message_whom(self):
        vendor = self.client_for(self.vendor)
        names = {r["username"] for r in vendor.get("/api/messages/contacts/").data}
        self.assertEqual(names, {"m_admin", "m_lgu"})          # no vendors, no other municipality
        self.assertEqual(vendor.post("/api/messages/conversations/", {"user_id": self.vendor2.pk}, format="json").status_code, 403)
        self.assertEqual(self.client_for(self.far_vendor).post("/api/messages/conversations/", {"user_id": self.lgu.pk}, format="json").status_code, 403)
        self.assertEqual(self.client_for(self.lgu).post("/api/messages/conversations/", {"user_id": self.admin.pk}, format="json").status_code, 200)
        self.assertEqual(self.client_for(self.far_vendor).post("/api/messages/conversations/", {"user_id": self.admin.pk}, format="json").status_code, 200)

    def test_send_read_and_privacy(self):
        vendor, lgu = self.client_for(self.vendor), self.client_for(self.lgu)
        convo = vendor.post("/api/messages/conversations/", {"user_id": self.lgu.pk}, format="json").data["id"]
        self.assertEqual(vendor.post(f"/api/messages/conversations/{convo}/", {"body": "  "}, format="json").status_code, 400)
        sent = vendor.post(f"/api/messages/conversations/{convo}/", {"body": "Why did Galunggong go up?"}, format="json")
        self.assertEqual(sent.status_code, 201)

        self.assertEqual(lgu.get("/api/messages/unread/").data["unread"], 1)
        listed = lgu.get("/api/messages/conversations/").data
        self.assertEqual(listed[0]["with"]["username"], "m_vendor")
        self.assertEqual(listed[0]["unread"], 1)
        thread = lgu.get(f"/api/messages/conversations/{convo}/").data
        self.assertEqual(thread["messages"][0]["body"], "Why did Galunggong go up?")
        self.assertFalse(thread["messages"][0]["from_me"])
        self.assertEqual(lgu.get("/api/messages/unread/").data["unread"], 0)   # opening marks it read

        lgu.post(f"/api/messages/conversations/{convo}/", {"body": "Storm this week."}, format="json")
        newer = vendor.get(f"/api/messages/conversations/{convo}/", {"after": sent.data["id"]}).data["messages"]
        self.assertEqual([m["body"] for m in newer], ["Storm this week."])

        # Someone outside the conversation cannot read it.
        self.assertEqual(self.client_for(self.vendor2).get(f"/api/messages/conversations/{convo}/").status_code, 404)
        self.assertEqual(self.client_for(self.admin).get(f"/api/messages/conversations/{convo}/").status_code, 404)


class MessagePhotoTests(MessagingTests):
    """Profile photos in Messages: only for people you may message."""

    def test_photo_access(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        import io
        from PIL import Image
        buf = io.BytesIO(); Image.new("RGB", (8, 8), "teal").save(buf, "JPEG")
        profile = self.lgu.aquatimbang_profile
        profile.profile_photo = SimpleUploadedFile("lgu.jpg", buf.getvalue(), content_type="image/jpeg")
        profile.save()
        contacts = self.client_for(self.vendor).get("/api/messages/contacts/").data
        lgu_row = next(r for r in contacts if r["username"] == "m_lgu")
        self.assertTrue(lgu_row["has_photo"])
        self.assertEqual(self.client_for(self.vendor).get(f"/api/messages/people/{self.lgu.pk}/photo/").status_code, 200)
        # A vendor from another municipality may not message this LGU, so no photo.
        self.assertEqual(self.client_for(self.far_vendor).get(f"/api/messages/people/{self.lgu.pk}/photo/").status_code, 404)
        # Vendors cannot see each other.
        self.assertEqual(self.client_for(self.vendor2).get(f"/api/messages/people/{self.vendor.pk}/photo/").status_code, 404)


class StallSampleTests(TestCase):
    """Price Entry with prices from several stalls: the official price is the median."""

    def setUp(self):
        role = Role.objects.get_or_create(name="LGU Officer")[0]
        self.place = Municipality.objects.create(name="Sample City", province="Cebu")
        self.fish = FishSpecies.objects.create(name="Sample Fish")
        self.officer = User.objects.create_user("ss_lgu", "ss@example.com", "TestPass123!")
        UserProfile.objects.create(user=self.officer, role=role, municipality=self.place, account_status="approved", is_active=True)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=self.officer)[0].key}")

    def post(self, **extra):
        body = {"fish_species": self.fish.pk, "municipality": self.place.pk, "price_per_kg": "999",
                "recorded_date": str(timezone.localdate()), "source": "Carbon Market", **extra}
        return self.client.post("/api/prices/", body, format="json")

    def test_median_of_stalls(self):
        response = self.post(sampled_prices=[200, 180, 190])
        self.assertEqual(response.status_code, 201, response.data)
        record = PriceRecord.objects.get(pk=response.data["id"])
        self.assertEqual(record.price_per_kg, Decimal("190.00"))
        self.assertEqual(record.sampled_prices, ["200.00", "180.00", "190.00"])

    def test_needs_three_stalls(self):
        self.assertEqual(self.post(sampled_prices=[180, 190]).status_code, 400)
        self.assertEqual(self.post(sampled_prices=[180, -1, 190]).status_code, 400)


class FishNameTests(TestCase):
    """Fish names: tidy capitals and no duplicates that only differ in capitals."""

    def setUp(self):
        role = Role.objects.get_or_create(name="Administrator")[0]
        admin = User.objects.create_user("fn_admin", "fn@example.com", "TestPass123!")
        UserProfile.objects.create(user=admin, role=role, account_status="approved", is_active=True)
        FishSpecies.objects.create(name="Bangus")
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=admin)[0].key}")

    def test_lowercase_duplicate_is_refused(self):
        response = self.client.post("/api/fish-species/", {"name": "bangus"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Bangus is already", str(response.data))

    def test_new_name_gets_capitals(self):
        response = self.client.post("/api/fish-species/", {"name": "dalagang  bukid", "price_class": "first_class"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["name"], "Dalagang Bukid")
        self.assertEqual(response.data["price_class"], "first_class")


class PriceClassRangeTests(StallSampleTests):
    """First-class and common fish use their own allowed price ranges."""

    def test_ranges_by_class(self):
        from .models import SystemSetting
        settings_row = SystemSetting.load()
        settings_row.min_price_per_kg, settings_row.max_price_per_kg = Decimal("40"), Decimal("200")
        settings_row.first_class_min_price_per_kg, settings_row.first_class_max_price_per_kg = Decimal("150"), Decimal("800")
        settings_row.save()
        self.assertEqual(self.post(price_per_kg="500").status_code, 400)          # common fish: max ₱200
        self.fish.price_class = "first_class"
        self.fish.save()
        self.assertEqual(self.post(price_per_kg="500").status_code, 201)          # first-class: up to ₱800


class RelaxedRegistrationTests(RegistrationPhotoAndSpeciesTests):
    """Vendors may register without email; LGU officers with missing details."""

    def test_vendor_without_email(self):
        response = APIClient().post("/api/auth/register/", self.vendor_payload(email=""), format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(User.objects.get(username="new_vendor").email, "")

    def test_lgu_with_missing_details(self):
        payload = self.vendor_payload(username="new_lgu", email="new_lgu@example.com", role=self.roles["LGU Officer"].id,
                                      market_name=None, stall_number=None, species_sold=None, stall_photo=None)
        response = APIClient().post("/api/auth/register/", payload, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        # An LGU officer still needs an email.
        payload = self.vendor_payload(username="lgu_two", email="", role=self.roles["LGU Officer"].id,
                                      market_name=None, stall_number=None, species_sold=None, stall_photo=None)
        self.assertEqual(APIClient().post("/api/auth/register/", payload, format="multipart").status_code, 400)
