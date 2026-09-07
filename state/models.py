from pydantic import BaseModel, Field


class CreatorProfile(BaseModel):
    creator_name: str | None = None

    niche: str | None = None
    platforms: list[str] = Field(default_factory=list)

    region: str | None = None
    languages: list[str] = Field(default_factory=list)

    audience_description: str | None = None
    audience_size: int | None = None
    average_views: int | None = None
    engagement_rate: float | None = None

    def missing_required_fields(self) -> list[str]:
        missing: list[str] = []

        if not self.niche:
            missing.append("niche")

        if not self.platforms:
            missing.append("platforms")

        if not self.region:
            missing.append("region")

        return missing

class CreatorProfileUpdate(BaseModel):
    creator_name: str | None = None

    niche: str | None = None
    platforms: list[str] | None = None

    region: str | None = None
    languages: list[str] | None = None

    audience_description: str | None = None
    audience_size: int | None = None
    average_views: int | None = None
    engagement_rate: float | None = None