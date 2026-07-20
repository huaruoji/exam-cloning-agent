"""Resource-aware provider routing, safety checks, and bounded telemetry."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx

from config import AUTO_DISCOVER_LOCAL_MODELS, DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, MODEL_LOCAL_ENDPOINTS
from models.compute import ModelRequestConfig

MAX_EVENTS = 500
CIRCUIT_FAILURE_THRESHOLD = 3
CIRCUIT_OPEN_SECONDS = 60
PROVIDER_CONCURRENCY = 3


class UnsafeEndpointError(ValueError):
    pass


class CircuitOpenError(RuntimeError):
    pass


@dataclass(frozen=True)
class Provider:
    name: str
    kind: str
    base_url: str
    model: str
    api_key: str = ""
    trusted: bool = False

    @property
    def identity(self) -> str:
        parsed = urlparse(self.base_url)
        # Do not include path queries, credentials, or API keys in diagnostics.
        return f"{self.kind}:{parsed.hostname or 'unknown'}:{parsed.port or ''}:{self.model}"


@dataclass
class CircuitState:
    failures: int = 0
    opened_at: float | None = None


_circuits: dict[str, CircuitState] = defaultdict(CircuitState)
_events: deque[dict[str, Any]] = deque(maxlen=MAX_EVENTS)
_last_health: dict[str, dict[str, Any]] = {}
_provider_semaphores: dict[str, asyncio.Semaphore] = {}
_provider_inflight: dict[str, int] = defaultdict(int)
_state_lock = asyncio.Lock()


def _models_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    return f"{base}/models" if base.endswith("/v1") else f"{base}/v1/models"


def _chat_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    return f"{base}/chat/completions" if base.endswith("/v1") else f"{base}/v1/chat/completions"


def _safe_error(exc: Exception) -> str:
    if isinstance(exc, UnsafeEndpointError):
        return str(exc)
    if isinstance(exc, CircuitOpenError):
        return "Provider circuit is temporarily open"
    if isinstance(exc, httpx.TimeoutException):
        return "Connection timed out"
    if isinstance(exc, httpx.HTTPStatusError):
        return f"Provider returned HTTP {exc.response.status_code}"
    if isinstance(exc, (httpx.RequestError, OSError)):
        return "Could not connect to provider"
    return "Provider request failed"


async def _resolve_host_ips(hostname: str, port: int) -> set[str]:
    infos = await asyncio.to_thread(socket.getaddrinfo, hostname, port, type=socket.SOCK_STREAM)
    return {info[4][0] for info in infos}


async def validate_public_endpoint(base_url: str) -> str:
    """Reject endpoints which could access server-local/private infrastructure."""
    parsed = urlparse(base_url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise UnsafeEndpointError("Only HTTP(S) model endpoints are supported")
    if not parsed.hostname or parsed.username or parsed.password:
        raise UnsafeEndpointError("Endpoint must have a valid host and no URL credentials")
    if parsed.fragment:
        raise UnsafeEndpointError("Endpoint fragments are not allowed")
    if parsed.query:
        raise UnsafeEndpointError("Endpoint query parameters are not allowed")
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError as exc:
        raise UnsafeEndpointError("Endpoint port is invalid") from exc
    try:
        addresses = await _resolve_host_ips(parsed.hostname, port)
    except socket.gaierror as exc:
        raise UnsafeEndpointError("Endpoint host could not be resolved") from exc
    if not addresses:
        raise UnsafeEndpointError("Endpoint host could not be resolved")
    for raw in addresses:
        ip = ipaddress.ip_address(raw)
        if not ip.is_global:
            raise UnsafeEndpointError("User model endpoints must resolve only to public IP addresses")
    return base_url.strip().rstrip("/")


def builtin_provider() -> Provider | None:
    if not DEEPSEEK_API_KEY:
        return None
    return Provider("Built-in DeepSeek", "built-in", DEEPSEEK_BASE_URL.rstrip("/"), DEEPSEEK_MODEL, DEEPSEEK_API_KEY, True)


def local_providers() -> list[Provider]:
    configured = [
        Provider(e["name"], "local", e["base_url"], e["model"], e["api_key"], True)
        for e in MODEL_LOCAL_ENDPOINTS
    ]
    if not AUTO_DISCOVER_LOCAL_MODELS:
        return configured
    conventional = [
        Provider("Ollama (auto-discovery)", "local", "http://127.0.0.1:11434", "", trusted=True),
        Provider("LM Studio (auto-discovery)", "local", "http://127.0.0.1:1234/v1", "", trusted=True),
        Provider("vLLM (auto-discovery)", "local", "http://127.0.0.1:8000/v1", "", trusted=True),
    ]
    existing = {p.base_url for p in configured}
    return configured + [p for p in conventional if p.base_url not in existing]


async def provider_from_request(config: ModelRequestConfig | None) -> Provider | None:
    if not config or not config.base_url:
        return None
    base_url = await validate_public_endpoint(config.base_url)
    return Provider("User endpoint", "user", base_url, config.model or "", config.api_key or "", False)


def _circuit_is_open(provider: Provider, now: float | None = None) -> bool:
    state = _circuits[provider.identity]
    if state.opened_at is None:
        return False
    current = now if now is not None else time.monotonic()
    if current - state.opened_at >= CIRCUIT_OPEN_SECONDS:
        state.failures = 0
        state.opened_at = None
        return False
    return True


async def _record_event(
    provider: Provider,
    operation: str,
    outcome: str,
    latency_ms: float,
    *,
    route_reason: str = "",
    fallback_from: str | None = None,
    tokens: int | None = None,
    error: str | None = None,
) -> None:
    event = {
        "timestamp": time.time(),
        "provider": provider.name,
        "provider_kind": provider.kind,
        "model": provider.model,
        "operation": operation,
        "outcome": outcome,
        "latency_ms": round(latency_ms, 1),
        "route_reason": route_reason,
        "fallback_from": fallback_from,
        "tokens": tokens,
        "error": error,
    }
    async with _state_lock:
        _events.append(event)


async def _request_json(method: str, url: str, *, headers: dict, json_body: dict | None, timeout: float) -> dict:
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        response = await client.request(method, url, headers=headers, json=json_body)
        response.raise_for_status()
        return response.json()


async def probe_provider(provider: Provider, *, validate_public: bool = False) -> dict[str, Any]:
    if validate_public:
        await validate_public_endpoint(provider.base_url)
    started = time.monotonic()
    headers = {"Accept": "application/json"}
    if provider.api_key:
        headers["Authorization"] = f"Bearer {provider.api_key}"
    try:
        try:
            payload = await _request_json("GET", _models_url(provider.base_url), headers=headers, json_body=None, timeout=3.0 if provider.trusted else 8.0)
            models = [str(item.get("id")) for item in (payload.get("data") or []) if isinstance(item, dict) and item.get("id")]
        except httpx.HTTPStatusError as exc:
            # Older Ollama versions expose discovery at /api/tags even when
            # their OpenAI-compatible inference endpoint is enabled.
            if provider.kind != "local" or urlparse(provider.base_url).port != 11434 or exc.response.status_code == 401:
                raise
            payload = await _request_json("GET", f"{provider.base_url.rstrip('/')}/api/tags", headers=headers, json_body=None, timeout=3.0)
            models = [str(item.get("name")) for item in payload.get("models", []) if isinstance(item, dict) and item.get("name")]
        latency = (time.monotonic() - started) * 1000
        result = {"reachable": True, "latency_ms": round(latency, 1), "models": models, "error": None}
        async with _state_lock:
            _last_health[provider.identity] = {**result, "checked_at": time.time()}
        await _record_event(provider, "probe", "success", latency)
        return result
    except Exception as exc:
        latency = (time.monotonic() - started) * 1000
        error = _safe_error(exc)
        result = {"reachable": False, "latency_ms": round(latency, 1), "models": [], "error": error}
        async with _state_lock:
            _last_health[provider.identity] = {**result, "checked_at": time.time()}
        await _record_event(provider, "probe", "failed", latency, error=error)
        return result


async def chat_completion(
    provider: Provider,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    *,
    operation: str,
    route_reason: str,
    fallback_from: str | None = None,
) -> str:
    if _circuit_is_open(provider):
        raise CircuitOpenError("Provider circuit is temporarily open")
    if not provider.model:
        raise ValueError("No model name configured for provider")
    started = time.monotonic()
    headers = {"Content-Type": "application/json"}
    if provider.api_key:
        headers["Authorization"] = f"Bearer {provider.api_key}"
    semaphore = _provider_semaphores.setdefault(provider.identity, asyncio.Semaphore(PROVIDER_CONCURRENCY))
    try:
        async with semaphore:
            _provider_inflight[provider.identity] += 1
            try:
                payload = await _request_json(
                    "POST",
                    _chat_url(provider.base_url),
                    headers=headers,
                    json_body={
                        "model": provider.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": temperature,
                    },
                    timeout=120.0,
                )
            finally:
                _provider_inflight[provider.identity] -= 1
        content = payload["choices"][0]["message"]["content"]
        usage = payload.get("usage") or {}
        tokens = usage.get("total_tokens")
        state = _circuits[provider.identity]
        state.failures = 0
        state.opened_at = None
        await _record_event(provider, operation, "success", (time.monotonic() - started) * 1000, route_reason=route_reason, fallback_from=fallback_from, tokens=tokens)
        return content
    except Exception as exc:
        state = _circuits[provider.identity]
        state.failures += 1
        if state.failures >= CIRCUIT_FAILURE_THRESHOLD:
            state.opened_at = time.monotonic()
        await _record_event(provider, operation, "failed", (time.monotonic() - started) * 1000, route_reason=route_reason, fallback_from=fallback_from, error=_safe_error(exc))
        raise


def _provider_summary(provider: Provider) -> dict[str, Any]:
    state = _circuits[provider.identity]
    health = _last_health.get(provider.identity)
    configured = bool(provider.base_url and provider.model)
    reachable = health.get("reachable") if health else None
    usable = bool(configured and reachable is True)
    status = "healthy" if reachable and configured else ("unavailable" if reachable is False or not configured else "unknown")
    return {
        "name": provider.name,
        "kind": provider.kind,
        "model": provider.model,
        "configured": configured,
        "usable": usable,
        "status": status,
        "healthy": True if status == "healthy" else (False if status == "unavailable" else None),
        "latency_ms": health.get("latency_ms") if health else None,
        "circuit": "open" if _circuit_is_open(provider) else "closed",
        "consecutive_failures": state.failures,
        "inflight": _provider_inflight[provider.identity],
        "concurrency_limit": PROVIDER_CONCURRENCY,
        "health": health,
    }


async def compute_status() -> dict[str, Any]:
    providers = local_providers()
    built_in = builtin_provider()
    if built_in:
        providers.append(built_in)
    # Probe only auto-discovered local services. Configured endpoints retain
    # their most recent explicit health result, avoiding remote calls on every
    # dashboard refresh.
    auto = [p for p in providers if p.name.endswith("(auto-discovery)")]
    if auto:
        await asyncio.gather(*(probe_provider(p) for p in auto))
    async with _state_lock:
        events = list(_events)
    workload_events = [event for event in events if event["operation"] in {"completion", "generate", "grade"}]
    successful = sum(event["outcome"] == "success" for event in workload_events)
    failed = sum(event["outcome"] == "failed" for event in workload_events)
    rule_count = sum(event["provider_kind"] == "rule" for event in events)
    saved_count = sum(event["outcome"] == "saved" for event in events) + rule_count
    fallback_count = sum(bool(event.get("fallback_from")) for event in events)
    latencies = [event["latency_ms"] for event in workload_events if event["outcome"] == "success"]
    summaries = [_provider_summary(provider) for provider in providers]
    success_rate = round(successful / (successful + failed), 4) if successful + failed else None
    system_status = (
        "healthy"
        if any(p["usable"] for p in summaries)
        else ("unknown" if any(p["configured"] and p["status"] == "unknown" for p in summaries) else "degraded")
    )
    recent_routes = [
        {
            **event,
            "task": event["operation"],
            "task_type": event["operation"],
            "reason": event["route_reason"],
        }
        for event in events[-20:][::-1]
    ]
    return {
        "mode": "hybrid" if providers else "rules-only",
        "status": system_status,
        "degraded_operation_available": True,
        "providers": summaries,
        "success_rate": success_rate,
        "cache_hit_rate": 0.0,
        "cache_hits": 0,
        "calls_saved": saved_count,
        "metrics": {
            "events_retained": len(events),
            "successful_requests": successful,
            "failed_requests": failed,
            "success_rate": success_rate,
            "average_latency_ms": round(sum(latencies) / len(latencies), 1) if latencies else None,
            "rule_graded": rule_count,
            "bank_reused": sum(event["provider_kind"] == "bank" for event in events),
            "fallbacks": fallback_count,
        },
        "recent_routes": recent_routes,
        "telemetry_limit": MAX_EVENTS,
    }


async def record_rule_grade(question_type: str, correct: bool) -> None:
    provider = Provider("Deterministic rules", "rule", "rule://local", question_type, trusted=True)
    await _record_event(provider, "grade", "success", 0.0, route_reason="deterministic_question_type")


async def record_bank_reuse(operation: str) -> None:
    provider = Provider("Question bank", "bank", "bank://local", "stored-question", trusted=True)
    await _record_event(provider, operation, "saved", 0.0, route_reason="reused_existing_question")


async def failover_drill() -> dict[str, Any]:
    """Run a no-cost, explicitly simulated routing drill.

    This exercises selection and telemetry without claiming that a real GPU or
    third-party endpoint failed and without sending course/user content.
    """
    synthetic = Provider("Drill primary", "simulation", "simulation://unavailable", "test", trusted=True)
    await _record_event(synthetic, "failover_drill", "failed", 0.0, route_reason="explicit_simulation", error="Simulated provider outage")
    candidates = local_providers()
    built_in = builtin_provider()
    if built_in:
        candidates.append(built_in)
    selected = next(
        (
            p
            for p in candidates
            if p.model
            and not _circuit_is_open(p)
            and (_last_health.get(p.identity) or {}).get("reachable") is True
        ),
        None,
    )
    if selected:
        await _record_event(selected, "failover_drill", "success", 0.0, route_reason="fallback_selected", fallback_from=synthetic.name)
    return {
        "simulated": True,
        "outcome": "passed" if selected else "degraded",
        "message": "Simulated failover selected a verified fallback" if selected else "Simulated failover reached rules-only degraded mode",
        "steps": [
            {"provider": synthetic.name, "result": "simulated_failure"},
            {"provider": selected.name if selected else "rules-only", "result": "selected_without_network_request"},
        ],
        "selected_provider": selected.name if selected else None,
    }


def reset_compute_state_for_tests() -> None:
    _events.clear()
    _circuits.clear()
    _last_health.clear()
    _provider_semaphores.clear()
    _provider_inflight.clear()
