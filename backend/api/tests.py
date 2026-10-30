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
