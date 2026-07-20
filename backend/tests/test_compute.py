import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from main import app
from models.compute import ModelRequestConfig
from services import compute
from services.compute import CircuitOpenError, Provider, chat_completion, compute_status, record_bank_reuse, reset_compute_state_for_tests
from services.grader import grade
from services.llm_client import call_llm


@pytest.fixture(autouse=True)
def reset_state(monkeypatch):
    reset_compute_state_for_tests()
    monkeypatch.setattr(compute, "AUTO_DISCOVER_LOCAL_MODELS", False)
    yield
    reset_compute_state_for_tests()


@pytest.mark.asyncio
async def test_public_endpoint_rejects_private_and_loopback(monkeypatch):
    async def resolve_private(hostname, port):
        return {"127.0.0.1", "10.0.0.2"}

    monkeypatch.setattr(compute, "_resolve_host_ips", resolve_private)
    with pytest.raises(compute.UnsafeEndpointError):
        await compute.validate_public_endpoint("http://example.test:8000/v1")


@pytest.mark.asyncio
async def test_public_endpoint_accepts_only_global_addresses(monkeypatch):
    async def resolve_public(hostname, port):
        return {"8.8.8.8", "2606:4700:4700::1111"}

    monkeypatch.setattr(compute, "_resolve_host_ips", resolve_public)
    assert await compute.validate_public_endpoint("https://models.example/v1") == "https://models.example/v1"


@pytest.mark.asyncio
async def test_probe_reports_reachable_with_zero_models(monkeypatch):
    async def fake_request(method, url, **kwargs):
        return {"data": []}

    monkeypatch.setattr(compute, "_request_json", fake_request)
    provider = Provider("Ollama", "local", "http://127.0.0.1:11434/v1", "", trusted=True)
    result = await compute.probe_provider(provider)
    assert result["reachable"] is True
    assert result["models"] == []
    summary = compute._provider_summary(provider)
    assert summary["usable"] is False


def test_configured_but_unprobed_provider_is_unknown_not_usable():
    provider = Provider("configured", "local", "http://127.0.0.1:8000/v1", "qwen", trusted=True)
    summary = compute._provider_summary(provider)
    assert summary["status"] == "unknown"
    assert summary["usable"] is False
    assert summary["concurrency_limit"] == compute.PROVIDER_CONCURRENCY


@pytest.mark.asyncio
async def test_circuit_opens_after_three_failures(monkeypatch):
    async def fail(*args, **kwargs):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(compute, "_request_json", fail)
    provider = Provider("test", "user", "https://models.example/v1", "model")
    for _ in range(3):
        with pytest.raises(httpx.ConnectError):
            await chat_completion(provider, "system", "user", 0.1, operation="completion", route_reason="test")
    with pytest.raises(CircuitOpenError):
        await chat_completion(provider, "system", "user", 0.1, operation="completion", route_reason="test")
    status = await compute_status()
    assert status["metrics"]["failed_requests"] == 3


@pytest.mark.asyncio
async def test_custom_provider_falls_back_to_builtin(monkeypatch):
    async def resolve_public(hostname, port):
        return {"8.8.8.8"}

    calls = []

    async def fake_completion(provider, *args, **kwargs):
        calls.append(provider.name)
        if provider.kind == "user":
            raise httpx.ConnectError("offline")
        return "fallback response"

    monkeypatch.setattr(compute, "_resolve_host_ips", resolve_public)
    monkeypatch.setattr("services.llm_client.chat_completion", fake_completion)
    monkeypatch.setattr("services.llm_client.builtin_provider", lambda: Provider("built-in", "built-in", "https://api.example", "fallback", "key", True))
    monkeypatch.setattr("services.llm_client.local_providers", lambda: [])
    result = await call_llm(
        "system",
        "user",
        model_config=ModelRequestConfig(base_url="https://models.example/v1", model="primary", allow_fallback=True),
    )
    assert result == "fallback response"
    assert calls == ["User endpoint", "built-in"]


@pytest.mark.asyncio
async def test_rule_provider_grades_mcq_without_llm():
    result = await grade(
        {"question_type": "mcq", "answer": "B", "options": ["Alpha", "Beta", "Gamma"]},
        "Beta",
    )
    assert result["correct"] is True
    assert result["provider"] == "rule"
    status = await compute_status()
    assert status["metrics"]["rule_graded"] == 1


@pytest.mark.asyncio
async def test_bank_reuse_counts_as_saved_model_call():
    await record_bank_reuse("practice")
    status = await compute_status()
    assert status["calls_saved"] == 1
    assert status["metrics"]["bank_reused"] == 1


@pytest.mark.asyncio
async def test_provider_concurrency_is_bounded(monkeypatch):
    active = 0
    peak = 0

    async def fake_request(*args, **kwargs):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.01)
        active -= 1
        return {"choices": [{"message": {"content": "ok"}}]}

    monkeypatch.setattr(compute, "_request_json", fake_request)
    provider = Provider("bounded", "local", "http://127.0.0.1:8000/v1", "qwen", trusted=True)
    await asyncio.gather(*[
        chat_completion(provider, "system", "user", 0.1, operation="completion", route_reason="test")
        for _ in range(8)
    ])
    assert peak == compute.PROVIDER_CONCURRENCY
    assert compute._provider_summary(provider)["inflight"] == 0


def test_compute_api_shapes(monkeypatch):
    async def resolve_public(hostname, port):
        return {"8.8.8.8"}

    async def fake_request(method, url, **kwargs):
        return {"data": [{"id": "qwen-test"}]}

    monkeypatch.setattr(compute, "_resolve_host_ips", resolve_public)
    monkeypatch.setattr(compute, "_request_json", fake_request)
    client = TestClient(app)
    probe = client.post(
        "/api/compute/probe",
        json={"base_url": "https://models.example/v1", "api_key": "secret", "model": "qwen-test"},
    )
    assert probe.status_code == 200
    assert probe.json()["selected_model_available"] is True
    assert "secret" not in probe.text

    drill = client.post("/api/compute/failover-drill")
    assert drill.status_code == 200
    assert drill.json()["simulated"] is True

    status = client.get("/api/compute/status")
    assert status.status_code == 200
    assert "recent_routes" in status.json()
    assert "secret" not in status.text
