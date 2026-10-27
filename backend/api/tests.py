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
        UserProfile.objects.create(user=self.pending, role=self.vendor_role,
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
