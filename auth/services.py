from passlib.context import CryptContext
from typing import Optional

from database import create_user as save_user
from database import get_user as load_user
from .models import UserInDB

# PBKDF2-SHA256 is implemented by Passlib itself, which keeps the local auth
# service portable (including environments where the bcrypt native extension
# is unavailable or incompatible).
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def get_user(username: str) -> Optional[UserInDB]:
    user = load_user(username)
    return UserInDB(**user) if user else None


def create_user(username: str, password: str, email: Optional[str] = None) -> UserInDB:
    hashed = pwd_context.hash(password)
    return UserInDB(**save_user(username, email, hashed))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def authenticate_user(username: str, password: str) -> Optional[UserInDB]:
    user = get_user(username)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user
