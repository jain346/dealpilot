import unittest
from starlette.testclient import TestClient
from pydantic import ValidationError

from auth.schemas import UserCreate
from auth import services
import database
from run_agent import app


class AuthValidationTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.test_user = "pilot_test_user_unique"
        self.test_email = "pilot_test_user_unique@gmail.com"
        self.test_password = "password12345"
        # Clean up test user
        with database.connection() as db:
            db.execute(
                "DELETE FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)",
                (self.test_user, self.test_email),
            )

    def tearDown(self):
        with database.connection() as db:
            db.execute(
                "DELETE FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)",
                (self.test_user, self.test_email),
            )

    def test_schema_strictly_requires_gmail(self):
        # Valid @gmail.com
        u = UserCreate(username="validuser", email="test@gmail.com", password="password123")
        self.assertEqual(u.email, "test@gmail.com")

        # Case insensitive normalization
        u2 = UserCreate(username="validuser2", email="TESTUSER@GMAIL.COM", password="password123")
        self.assertEqual(u2.email, "testuser@gmail.com")

        # Reject non-gmail domains like @g.com, @yahoo.com
        for invalid_email in ["test@g.com", "test@yahoo.com", "test@gmail.co", "test@fakegmail.com", "user@g"]:
            with self.assertRaises(ValidationError, msg=f"Should reject {invalid_email}"):
                UserCreate(username="someuser", email=invalid_email, password="password123")

    def test_api_signup_rejects_non_gmail(self):
        response = self.client.post(
            "/auth/signup",
            json={"username": self.test_user, "email": "test@g.com", "password": self.test_password},
        )
        self.assertIn(response.status_code, [400, 422])

    def test_api_signup_duplicate_checks_and_flow(self):
        # 1. Successful signup with valid @gmail.com
        res = self.client.post(
            "/auth/signup",
            json={"username": self.test_user, "email": self.test_email, "password": self.test_password},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["username"], self.test_user)
        self.assertEqual(res.json()["email"], self.test_email)

        # 2. Duplicate username rejection
        res_dup_user = self.client.post(
            "/auth/signup",
            json={"username": self.test_user, "email": "different_unique@gmail.com", "password": self.test_password},
        )
        self.assertEqual(res_dup_user.status_code, 400)
        self.assertIn("Username is already taken", res_dup_user.json()["detail"])

        # 3. Duplicate email rejection
        res_dup_email = self.client.post(
            "/auth/signup",
            json={"username": "different_unique_user", "email": self.test_email, "password": self.test_password},
        )
        self.assertEqual(res_dup_email.status_code, 400)
        self.assertIn("An account with this @gmail.com address already exists", res_dup_email.json()["detail"])

        # 4. Login with username
        res_login_user = self.client.post(
            "/auth/token",
            data={"username": self.test_user, "password": self.test_password},
        )
        self.assertEqual(res_login_user.status_code, 200)
        self.assertIn("access_token", res_login_user.json())

        # 5. Login with Gmail address
        res_login_email = self.client.post(
            "/auth/token",
            data={"username": self.test_email, "password": self.test_password},
        )
        self.assertEqual(res_login_email.status_code, 200)
        self.assertIn("access_token", res_login_email.json())

        # 6. Login with invalid domain email rejected
        res_login_invalid = self.client.post(
            "/auth/token",
            data={"username": "test@g.com", "password": self.test_password},
        )
        self.assertEqual(res_login_invalid.status_code, 400)
        self.assertIn("Only @gmail.com", res_login_invalid.json()["detail"])


if __name__ == "__main__":
    unittest.main()
