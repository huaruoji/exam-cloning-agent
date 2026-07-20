from typing import Optional

from fastapi import Header


async def get_user_id(x_user_id: Optional[str] = Header(default=None, alias="X-User-Id")) -> str:
    """Extract user ID from X-User-Id header; default to 'public'."""
    return x_user_id or "public"
