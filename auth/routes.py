from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
import json
import base64
from . import services, utils
from .schemas import UserCreate, Token, User, GoogleAuthRequest
from .middleware import get_current_user
from logging_config import logger

router = APIRouter()


@router.post("/signup", response_model=User)
async def signup(payload: UserCreate):
    if services.get_user(payload.username):
        logger.warning("signup_rejected_user_exists", extra={"user_id": payload.username})
        raise HTTPException(status_code=400, detail="User already exists")
    user = services.create_user(payload.username, payload.password, payload.email)
    logger.info("user_signed_up", extra={"user_id": user.username})
    return User(username=user.username, email=user.email)


@router.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = services.authenticate_user(form_data.username, form_data.password)
    if not user:
        logger.warning("login_failed", extra={"user_id": form_data.username})
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    access_token_expires = timedelta(minutes=60)
    access_token = utils.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    logger.info("login_succeeded", extra={"user_id": user.username})
    return Token(access_token=access_token, token_type="bearer")


@router.post("/google", response_model=Token)
async def google_login(payload: GoogleAuthRequest):
    email = payload.email
    name = payload.name

    if payload.credential:
        try:
            parts = payload.credential.split(".")
            if len(parts) >= 2:
                payload_segment = parts[1]
                padded = payload_segment + "=" * ((4 - len(payload_segment) % 4) % 4)
                decoded_bytes = base64.urlsafe_b64decode(padded.encode("utf-8"))
                token_data = json.loads(decoded_bytes.decode("utf-8"))
                if not email:
                    email = token_data.get("email")
                if not name:
                    name = token_data.get("name") or token_data.get("given_name")
        except Exception as e:
            logger.warning("google_token_decode_error", extra={"error": str(e)})

    if not email:
        raise HTTPException(status_code=400, detail="Valid Google account email is required")

    user = services.authenticate_or_create_google_user(email=email, name=name)
    access_token_expires = timedelta(minutes=60)
    access_token = utils.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    logger.info("google_login_succeeded", extra={"user_id": user.username, "email": email})
    return Token(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=User)
async def read_users_me(current_user=Depends(get_current_user)):
    return User(username=current_user.username, email=current_user.email)

