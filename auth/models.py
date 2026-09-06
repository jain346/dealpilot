from typing import Optional
from pydantic import BaseModel


class UserInDB(BaseModel):
    username: str
    email: Optional[str] = None
    hashed_password: str
