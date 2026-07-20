# Compute routing API

The compute API reports observed state only. It does not claim a GPU exists,
and it never stores model API keys, prompts, answers, or response content in
telemetry.

## Request-level model selection

Generation and grading endpoints accept these optional headers:

| Header | Meaning |
| --- | --- |
| `X-User-Api-Key` | Ephemeral bearer token for this request |
| `X-Model-Base-Url` | Public OpenAI-compatible base URL, with or without `/v1` |
| `X-Model-Name` | Model ID sent in the completion request |
| `X-Allow-Fallback` | `true` by default; `false` restricts a configured user route to that route |

User URLs must resolve exclusively to global IP addresses. Loopback, private,
link-local, multicast, reserved, and URL-credential targets are rejected.
Administrator-managed private/local endpoints must instead be supplied through
`MODEL_LOCAL_ENDPOINTS` as a JSON array:

```json
[{"name":"ollama","base_url":"http://127.0.0.1:11434/v1","model":"qwen2.5:7b"}]
```

## `GET /api/compute/status`

Returns `mode`, `status`, `providers`, aggregate `metrics`, and at most 20
`recent_routes`. The process-local event buffer is capped at 500; it resets on
restart and is intended as live demonstration telemetry rather than an audit log. A
provider can be reachable but unusable when it advertises zero models. An
unprobed configured provider has `status: "unknown"` rather than a fabricated
health result.

```json
{
  "mode": "hybrid",
  "status": "healthy",
  "degraded_operation_available": true,
  "success_rate": 1.0,
  "cache_hit_rate": 0.0,
  "calls_saved": 4,
  "providers": [{
    "name": "Ollama (auto-discovery)",
    "kind": "local",
    "model": "",
    "configured": false,
    "usable": false,
    "status": "unavailable",
    "healthy": false,
    "latency_ms": 2.1,
    "circuit": "closed",
    "consecutive_failures": 0,
    "inflight": 0,
    "concurrency_limit": 3,
    "health": {"reachable": true, "models": [], "checked_at": 1784561597.0}
  }],
  "metrics": {
    "events_retained": 8,
    "successful_requests": 1,
    "failed_requests": 0,
    "success_rate": 1.0,
    "average_latency_ms": 820.2,
    "rule_graded": 4,
    "bank_reused": 0,
    "fallbacks": 1
  },
  "recent_routes": [],
  "telemetry_limit": 500
}
```

## `POST /api/compute/probe`

Request:

```json
{"base_url":"https://models.example/v1","api_key":"optional","model":"qwen"}
```

Response:

```json
{
  "reachable": true,
  "provider": "user",
  "base_url": "https://models.example/v1",
  "latency_ms": 42.5,
  "models": ["qwen"],
  "selected_model_available": true,
  "error": null
}
```

Unsafe URLs return HTTP 422. Connectivity/authentication failures return HTTP
200 with `reachable: false` and a sanitized `error`, so the settings page can
show a connection-test result without exposing provider response bodies.

## `POST /api/compute/failover-drill`

This is an explicitly simulated, zero-cost routing exercise. It does not call a
model and does not present the simulated primary as a real outage.

```json
{
  "simulated": true,
  "outcome": "passed",
  "message": "Simulated failover selected a verified fallback",
  "steps": [
    {"provider":"Drill primary","result":"simulated_failure"},
    {"provider":"Built-in DeepSeek","result":"selected_without_network_request"}
  ],
  "selected_provider": "Built-in DeepSeek"
}
```

Model completions use a three-consecutive-failure circuit breaker. The provider
is skipped for 60 seconds, after which it is allowed a recovery attempt.
