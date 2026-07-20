from fastapi import APIRouter, HTTPException

from models.compute import FailoverDrillResponse, ProbeRequest, ProbeResponse
from services.compute import Provider, UnsafeEndpointError, compute_status, failover_drill, probe_provider, validate_public_endpoint

router = APIRouter(prefix="/api/compute", tags=["compute"])


@router.get("/status")
async def get_compute_status():
    return await compute_status()


@router.post("/probe", response_model=ProbeResponse)
async def probe_user_endpoint(request: ProbeRequest):
    try:
        base_url = await validate_public_endpoint(request.base_url)
    except UnsafeEndpointError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    provider = Provider(
        name="User endpoint",
        kind="user",
        base_url=base_url,
        model=request.model or "",
        api_key=request.api_key or "",
    )
    result = await probe_provider(provider)
    return ProbeResponse(
        reachable=result["reachable"],
        base_url=base_url,
        latency_ms=result["latency_ms"],
        models=result["models"],
        selected_model_available=(request.model in result["models"]) if request.model and result["reachable"] else None,
        error=result["error"],
    )


@router.post("/failover-drill", response_model=FailoverDrillResponse)
async def run_failover_drill():
    return await failover_drill()
