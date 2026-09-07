from __future__ import annotations

from typing import Any

from database import (
    create_empty_creator_profile,
    get_creator_profile,
    upsert_creator_profile,
)

from state.models import CreatorProfile, CreatorProfileUpdate


def load_or_create_creator_profile(username: str) -> CreatorProfile:
    """
    Load the canonical creator profile from the application database.

    If no profile row exists, create an empty profile row first.
    """
    profile = get_creator_profile(username)

    if profile is None:
        profile = create_empty_creator_profile(username)

    return CreatorProfile.model_validate(profile)


def update_creator_profile(
    username: str,
    update: CreatorProfileUpdate,
) -> CreatorProfile:
    """
    Merge an explicit profile update into the existing canonical profile.
    """
    current = load_or_create_creator_profile(username)

    update_data: dict[str, Any] = update.model_dump(
        exclude_unset=True,
        exclude_none=True,
    )

    merged = current.model_dump()
    merged.update(update_data)

    saved = upsert_creator_profile(
        username,
        merged,
    )

    return CreatorProfile.model_validate(saved)