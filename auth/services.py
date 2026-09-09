import secrets
from passlib.context import CryptContext
from typing import Optional

from database import create_user as save_user
from database import get_user as load_user
from database import get_user_by_email as load_user_by_email
from .models import UserInDB

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def get_user(username: str) -> Optional[UserInDB]:
    user = load_user(username)
    return UserInDB(**user) if user else None


def get_user_by_email(email: str) -> Optional[UserInDB]:
    user = load_user_by_email(email)
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


def authenticate_or_create_google_user(email: str, name: Optional[str] = None) -> UserInDB:
    existing_user = get_user_by_email(email)
    if existing_user:
        if name:
            try:
                from database import get_creator_profile, update_creator_profile
                prof = get_creator_profile(existing_user.username)
                if prof and not prof.get("creator_name"):
                    update_creator_profile(existing_user.username, {"creator_name": name})
            except Exception:
                pass
        return existing_user

    base_username = (email.split("@")[0] if email else "user").lower().replace(" ", "_")
    username = base_username
    counter = 1
    while get_user(username):
        username = f"{base_username}_{counter}"
        counter += 1

    random_pass = secrets.token_urlsafe(16)
    user = create_user(username=username, password=random_pass, email=email)
    if name:
        try:
            from database import create_empty_creator_profile, update_creator_profile
            create_empty_creator_profile(username)
            update_creator_profile(username, {"creator_name": name})
        except Exception:
            pass
    return user

