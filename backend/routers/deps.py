from typing import Optional

from fastapi import Header

from models.compute import ModelRequestConfig


async def get_user_id(x_user_id: Optional[str] = Header(default=None, alias="X-User-Id")) -> str:
    """Extract user ID from X-User-Id header; default to 'public'."""
    return x_user_id or "public"


async def get_model_request_config(
    x_user_api_key: Optional[str] = Header(default=None, alias="X-User-Api-Key"),
    x_model_base_url: Optional[str] = Header(default=None, alias="X-Model-Base-Url"),
    x_model_name: Optional[str] = Header(default=None, alias="X-Model-Name"),
    x_allow_fallback: Optional[str] = Header(default="true", alias="X-Allow-Fallback"),
) -> ModelRequestConfig:
    """Build an ephemeral model route from request headers.

    Routers should inject this dependency and pass it to generation/grading.
    No value returned here is persisted by the backend.
    """
    allow_fallback = (x_allow_fallback or "true").strip().lower() not in {"0", "false", "no"}
    return ModelRequestConfig(
        base_url=(x_model_base_url or "").strip() or None,
        api_key=(x_user_api_key or "").strip() or None,
        model=(x_model_name or "").strip() or None,
        allow_fallback=allow_fallback,
    )
