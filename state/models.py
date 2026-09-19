from pydantic import BaseModel, Field


class CreatorProfile(BaseModel):
    creator_name: str | None = None

    niche: str | None = None
    platforms: list[str] = Field(default_factory=list)

    region: str | None = None
    languages: list[str] = Field(default_factory=list)

    audience: list[str] = Field(default_factory=list)
    audience_description: str | None = None
    audience_size: int | None = None
    average_views: int | None = None
    engagement_rate: float | None = None

    def missing_required_fields(self) -> list[str]:
        missing: list[str] = []

        if not self.niche or not self.niche.strip():
            missing.append("niche")

        if not self.platforms:
            missing.append("platforms")

        if not self.region or not self.region.strip():
            missing.append("region")

        if self.audience_size is None or self.audience_size <= 0:
            missing.append("audience_size")

        return missing

class CreatorProfileUpdate(BaseModel):
    creator_name: str | None = None

    niche: str | None = None
    platforms: list[str] | None = None

    region: str | None = None
    languages: list[str] | None = None

    audience: list[str] | None = None
    audience_description: str | None = None
    audience_size: int | None = Field(default=None, ge=1)
    average_views: int | None = Field(default=None, ge=0)
    engagement_rate: float | None = Field(default=None, ge=0.0)