import asyncio
import unittest
from unittest.mock import MagicMock

from state.models import CreatorProfile, CreatorProfileUpdate
from state.profile import update_creator_profile, load_or_create_creator_profile
from state.profile_bootstrap import bootstrap_creator_profile, PROFILE_STATE_KEY
from auth.services import create_user, get_user


class TestCreatorProfile(unittest.TestCase):
    def test_missing_required_fields_empty_profile(self):
        profile = CreatorProfile()
        missing = profile.missing_required_fields()
        self.assertIn("niche", missing)
        self.assertIn("platforms", missing)
        self.assertIn("region", missing)
        self.assertIn("audience_size", missing)

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
        )
        self.assertEqual(profile.missing_required_fields(), [])

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


if __name__ == "__main__":
    unittest.main()
