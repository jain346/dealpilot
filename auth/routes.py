from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
from . import services, utils
from .schemas import UserCreate, Token, User
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


@router.get("/me", response_model=User)
async def read_users_me(current_user=Depends(get_current_user)):
    return User(username=current_user.username, email=current_user.email)
