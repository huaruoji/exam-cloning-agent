from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ModelRequestConfig(BaseModel):
    """Ephemeral model selection supplied with one request.

    API keys must never be serialized into telemetry or persisted server-side.
    """

    base_url: str | None = None
    api_key: str | None = None
    model: str | None = None
    allow_fallback: bool = True


class ProbeRequest(BaseModel):
    base_url: str = Field(min_length=8, max_length=2048)
    api_key: str | None = Field(default=None, max_length=4096)
    model: str | None = Field(default=None, max_length=160)

    @field_validator("base_url")
    @classmethod
    def strip_url(cls, value: str) -> str:
        return value.strip().rstrip("/")


class ProbeResponse(BaseModel):
    reachable: bool
    provider: Literal["user"] = "user"
    base_url: str
    latency_ms: float | None = None
    models: list[str] = Field(default_factory=list)
    selected_model_available: bool | None = None
    error: str | None = None


class FailoverDrillResponse(BaseModel):
    simulated: bool = True
    outcome: Literal["passed", "degraded"]
    message: str
    steps: list[dict]
    selected_provider: str | None = None
