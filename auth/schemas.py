import re
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional


class UserCreate(BaseModel):
    username: str
    email: str
    password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Username cannot be empty")
        if len(cleaned) < 3:
            raise ValueError("Username must be at least 3 characters long")
        return cleaned

    @field_validator("email")
    @classmethod
    def validate_gmail(cls, v: str) -> str:
        if not v:
            raise ValueError("Email address is required")
        cleaned = v.strip().lower()
        if not re.match(r"^[a-zA-Z0-9._%+-]+@gmail\.com$", cleaned):
            raise ValueError("Only @gmail.com email addresses are allowed (e.g. user@gmail.com)")
        return cleaned

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        return v


class User(BaseModel):
    username: str
    email: Optional[EmailStr] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    username: Optional[str] = None


class GoogleAuthRequest(BaseModel):
    credential: Optional[str] = None
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    google_id: Optional[str] = None


