import asyncio
import unittest
from unittest.mock import MagicMock

from starlette.testclient import TestClient

from state.models import CreatorProfile, CreatorProfileUpdate
from state.profile import update_creator_profile, load_or_create_creator_profile
from state.profile_bootstrap import bootstrap_creator_profile, PROFILE_STATE_KEY
from auth.services import create_user, get_user
from run_agent import app


import database
from database import get_creator_profile

class TestCreatorProfile(unittest.TestCase):
    def test_missing_required_fields_empty_profile(self):
        profile = CreatorProfile()
        missing = profile.missing_required_fields()
        self.assertIn("niche", missing)
        self.assertIn("platforms", missing)
        self.assertIn("region", missing)
        self.assertIn("audience_size", missing)
        self.assertEqual(profile.audience, [])

    def test_missing_required_fields_missing_audience_size(self):
        profile = CreatorProfile(
            niche="Tech",
            platforms=["YouTube"],
            region="US",
            audience_size=None,
        )
        self.assertEqual(profile.missing_required_fields(), ["audience_size"])

    def test_missing_required_fields_zero_or_negative_audience_size(self):
        profile_zero = CreatorProfile(
            niche="Tech",
            platforms=["YouTube"],
            region="US",
            audience_size=0,
        )
        self.assertEqual(profile_zero.missing_required_fields(), ["audience_size"])

        profile_neg = CreatorProfile(
            niche="Tech",
            platforms=["YouTube"],
            region="US",
            audience_size=-10,
        )
        self.assertEqual(profile_neg.missing_required_fields(), ["audience_size"])

    def test_missing_required_fields_complete_profile(self):
        profile = CreatorProfile(
            niche="Tech",
            platforms=["YouTube"],
            region="US",
            audience_size=50000,
            audience=["Gen Z", "Millennials"],
        )
        self.assertEqual(profile.missing_required_fields(), [])
        self.assertEqual(profile.audience, ["Gen Z", "Millennials"])

    def test_update_creator_profile_valid_audience_size(self):
        username = "test_user_profile_val"
        if not get_user(username):
            create_user(username, "testpass123", "test_val@example.com")

        updated = update_creator_profile(
            username,
            CreatorProfileUpdate(
                niche="Artificial Intelligence",
                platforms=["YouTube", "Twitter"],
                region="United States",
                audience_size=75000,
            ),
        )
        self.assertEqual(updated.audience_size, 75000)
        self.assertEqual(updated.niche, "Artificial Intelligence")
        self.assertEqual(updated.missing_required_fields(), [])

    def test_update_creator_profile_with_audience(self):
        username = "test_user_audience_groups"
        if not get_user(username):
            create_user(username, "testpass123", "test_aud@example.com")

        updated = update_creator_profile(
            username,
            CreatorProfileUpdate(
                niche="Technology",
                platforms=["YouTube", "LinkedIn"],
                region="United States",
                audience=["Gen Z", "Business professionals"],
                audience_size=50000,
            ),
        )
        self.assertEqual(updated.audience, ["Gen Z", "Business professionals"])

        # Directly verify database record retrieval
        db_record = get_creator_profile(username)
        self.assertIsNotNone(db_record)
        self.assertEqual(db_record["audience"], ["Gen Z", "Business professionals"])

        # Verify load_or_create_creator_profile
        loaded = load_or_create_creator_profile(username)
        self.assertEqual(loaded.audience, ["Gen Z", "Business professionals"])

    def test_update_creator_profile_invalid_audience_size(self):
        username = "test_user_invalid_aud"
        if not get_user(username):
            create_user(username, "testpass123", "test_inv@example.com")

        with self.assertRaises(Exception):
            # pydantic ge=1 validation will raise ValidationError or ValueError
            update_creator_profile(
                username,
                {"audience_size": 0},
            )

    def test_bootstrap_creator_profile_synchronization(self):
        username = "test_user_bootstrap_sync"
        if not get_user(username):
            create_user(username, "testpass123", "test_boot@example.com")

        # Save profile in database
        update_creator_profile(
            username,
            CreatorProfileUpdate(
                niche="Gaming",
                platforms=["Twitch"],
                region="Canada",
                audience=["Gen Z", "Students"],
                audience_size=25000,
            ),
        )

        # Context has mock session
        ctx = MagicMock()
        ctx.session.user_id = username
        ctx.state = {}

        # Run bootstrap
        asyncio.run(bootstrap_creator_profile(ctx, MagicMock()))

        # Check ADK state is populated with saved profile
        self.assertIn(PROFILE_STATE_KEY, ctx.state)
        state_profile = ctx.state[PROFILE_STATE_KEY]
        self.assertEqual(state_profile["niche"], "Gaming")
        self.assertEqual(state_profile["audience_size"], 25000)
        self.assertEqual(state_profile["platforms"], ["Twitch"])
        self.assertEqual(state_profile["audience"], ["Gen Z", "Students"])

    def test_conversation_blocked_until_profile_saved_to_db(self):
        client = TestClient(app)
        username = "test_profile_gate_user"
        email = "test_gate@example.com"
        password = "gatepassword123"

        # Clean up any existing state from previous test runs
        with database.connection() as db:
            db.execute("DELETE FROM creator_profiles WHERE LOWER(user_id) = LOWER(?)", (username,))
            db.execute("DELETE FROM users WHERE LOWER(username) = LOWER(?)", (username,))

        try:
            # Sign up user (new user has empty profile in DB)
            res_signup = client.post(
                "/auth/signup",
                json={"username": username, "email": email, "password": password},
            )
            self.assertEqual(res_signup.status_code, 200)

            res_login = client.post(
                "/auth/token",
                data={"username": username, "password": password},
            )
            self.assertEqual(res_login.status_code, 200)
            token = res_login.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            # Step 1: Incomplete profile in DB should block starting a conversation
            res_session = client.post("/agent/sessions", headers=headers)
            self.assertEqual(res_session.status_code, 400)
            self.assertIn("Creator profile must be completed and saved", res_session.json()["detail"])

            # Step 2: Incomplete profile should also block sending messages
            res_msg = client.post(
                "/agent/sessions/dummy-session-id/messages",
                headers=headers,
                json={"message": "Hello DealPilot"},
            )
            self.assertEqual(res_msg.status_code, 400)
            self.assertIn("Creator profile must be completed and saved", res_msg.json()["detail"])

            # Step 3: Complete and save profile in database
            res_patch = client.patch(
                "/agent/profile",
                headers=headers,
                json={
                    "niche": "Tech & AI",
                    "platforms": ["YouTube", "LinkedIn"],
                    "region": "United States",
                    "audience": ["Engineers", "Founders"],
                    "audience_size": 35000,
                },
            )
            self.assertEqual(res_patch.status_code, 200)
            self.assertEqual(res_patch.json()["niche"], "Tech & AI")

            # Step 4: Now conversation session creation must succeed
            res_session_after = client.post("/agent/sessions", headers=headers)
            self.assertEqual(res_session_after.status_code, 201)
            self.assertIn("session_id", res_session_after.json())
        finally:
            with database.connection() as db:
                db.execute("DELETE FROM creator_profiles WHERE LOWER(user_id) = LOWER(?)", (username,))
                db.execute("DELETE FROM users WHERE LOWER(username) = LOWER(?)", (username,))


if __name__ == "__main__":
    unittest.main()
