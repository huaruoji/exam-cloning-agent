# Resource-Aware Exam Cloner Design

## Goal

Position Exam Cloner as a resource-aware adaptive learning agent that remains useful when model capacity fluctuates. The competition build must route each task to the least expensive capable path, expose truthful runtime evidence, recover clearly when a provider fails, and preserve the existing end-to-end learning workflow.

The implementation is intentionally compact for the July 24 demonstration. It does not claim an untested GPU deployment, implement autoscaling, or replace JSON persistence with a distributed database.

## Constraints and verified environment

- The deployed GPUnion container has no visible GPU or local inference service.
- Its effective cgroup limits are approximately two CPU cores and 4 GiB memory, so hosting a 7B–35B model in the current application container is out of scope.
- Computility lists GPU inventory, but an instance cannot currently be provisioned. GPU execution remains an acceptance-pending extension point.
- Runtime inference uses HTTP APIs. SSH is an administrator-only diagnostic/control-plane tool and is never used for each inference request.

## Architecture

### Providers

All model-backed operations use one provider contract with chat completion, model discovery, health probe, and normalized usage/error metadata.

- `RuleProvider`: deterministic grading for MCQ and true/false questions.
- `BuiltInProvider`: the server-configured DeepSeek-compatible endpoint.
- `UserProvider`: a user-supplied public OpenAI-compatible base URL, API key, and model name.
- `LocalProvider`: an administrator-configured localhost or private-network LM Studio, Ollama, vLLM, SGLang, or other compatible service.

User credentials and endpoint choices remain in browser storage and are supplied only to model-backed requests. Administrator endpoints come from environment configuration.

### Discovery and security

Administrator discovery probes a small explicit port list and configured endpoints. It may access loopback and private addresses. User endpoints must use HTTP or HTTPS, contain no embedded credentials, and resolve only to permitted public addresses. Loopback, private, link-local, multicast, and metadata-service destinations are rejected to prevent SSRF. Redirect targets are validated as well.

Supported discovery shapes are OpenAI-compatible `/v1/models` and Ollama `/api/tags`. A successful model listing does not imply generation success, so connection testing also performs a bounded completion request.

### Routing

The compact router applies these rules in order:

1. Grade MCQ and true/false questions locally when a reference answer exists.
2. Reuse a bank question or cached derived artifact when valid.
3. Try the user's selected healthy provider.
4. Try a healthy administrator-configured local provider.
5. Try the built-in provider when fallback is allowed.
6. Return an explicit degraded response without penalizing student mastery when no provider succeeds.

Each provider has a concurrency limit, bounded timeout, rolling latency/success counters, and a simple circuit breaker. Three consecutive retryable failures open the circuit for 60 seconds. A successful probe closes it. Retries are limited to prevent duplicated cost.

Fallback that could send course or student content to a different provider is visible to the user and governed by an `allow_fallback` preference.

### Caching and telemetry

Cache only reusable, non-answer artifacts such as document parse results, course style summaries, and explicitly generated question requests. Student answer grading is not shared or globally cached.

Persist a bounded stream of compute events containing timestamp, task type, provider, model, latency, outcome, fallback path, cache/rule hit, and token usage when returned by the provider. Never record API keys or full prompts. Aggregates expose actual request counts, success rate, latency, rule/cache savings, and estimated cost clearly labeled as estimated.

### SSH diagnostics

An administrator CLI can inspect a supplied SSH host for cgroup CPU/memory limits, `nvidia-smi`, GPU memory, and known local model endpoints, then emit a JSON capability manifest. It must not store SSH credentials or make unsupported claims when commands are unavailable.

## Compute Center

Add a bilingual `/compute` page and a compact dashboard status card.

The Compute Center shows:

- current routing mode and degraded/healthy status;
- provider cards with health, model, latency, and last probe;
- real request success rate, cache/rule savings, and queue/concurrency state;
- recent routing traces, including fallback paths;
- user actions to add/test/remove a public compatible endpoint and re-probe providers;
- a clearly labeled failover drill using non-sensitive test content.

Unavailable GPU information is shown as `hardware acceptance pending`, never as measured utilization.

## User experience changes

### Navigation and onboarding

- Add Compute before Settings and a persistent Chinese/English switch.
- Replace the permanent new-course input with a focused create action.
- Show skeletons while course counts load instead of temporarily displaying zero.
- Provide a three-step empty-state path: create/load course, add material, start practice.

### Dashboard

- Remove duplicated metric rows and add one primary next-action card.
- Collapse long topic lists after the most relevant eight topics.
- Surface the weakest-topic practice action and a compact compute status card.

### Materials

- Use a single-column empty state; reveal the job panel only when jobs exist.
- Present ingestion as understandable stages and show actionable retry/error states.
- Validate and explain upload limits and scanned-PDF limitations.

### Practice and mock exams

- Do not enter an indefinite spinner immediately. Show session choices, bounded loading, retry, and bank-only fallback.
- Label question source and model route as secondary metadata.
- Treat grading outages as ungraded, never wrong.
- Keep mock-exam defaults simple and move type/difficulty controls under Advanced.
- Show expected AI-generated question count and model-call estimate before generation.

### Settings

- Replace the DeepSeek-only card with Model Connections and routing preference cards.
- Each connection supports base URL, API key, model, fallback permission, test status, and latency.
- Move anonymous identity and raw diagnostics under Advanced.

## Bilingual behavior

Use a lightweight `zh-CN`/`en` message catalog for navigation, titles, actions, forms, toasts, errors, charts, empty states, and the Compute Center. Persist the UI language in browser storage. Question content is not mechanically translated; generation and feedback follow the detected course language with a user override.

## Correctness and safety fixes

Before feature work is considered complete, fix and cover with integration tests:

- per-user remapping of demo IDs;
- ownership checks for course upload, question submission, and job retry;
- the shadowed `/api/exam/styles` route;
- text-job retry behavior;
- complete, single-use exam submissions with saved answers;
- idempotent wrong-answer export that ignores grading failures;
- upload, text, question-count, answer-count, and prompt limits;
- propagation of the selected user provider to both generation and grading;
- frontend lint failures and avoidable initial bundle weight.

Anonymous IDs remain lightweight partition keys rather than production authentication; that limitation is documented rather than overstated.

## Error handling

Provider errors are normalized into timeout, authentication, rate-limit, unavailable, invalid-response, and unsafe-endpoint categories. User-facing messages state whether fallback occurred and whether work can be retried. Internal exception strings and filesystem paths are not returned directly. Background tasks preserve enough source metadata to retry the correct task type.

## Verification

Backend tests cover ownership, multi-user demo seeding, route precedence, text retry, exam invariants, idempotency, provider selection, SSRF validation, timeout/circuit/fallback behavior, and ungraded failure handling.

Frontend acceptance requires a clean production build and lint run, complete Chinese and English critical paths, responsive layouts, connection testing, explicit degradation, and successful upload-practice-exam smoke flows.

Performance evidence uses truthful CPU/API measurements: deterministic versus LLM grading latency, cache savings, failover time, and bounded concurrent requests. GPU deployment is reported as implemented at the interface/diagnostic level and pending hardware acceptance.

## Demonstration flow

1. Switch interface language and load a demo course.
2. Open Compute Center and inspect the real provider state.
3. Test a user-defined compatible provider or show its unavailable state.
4. Answer an objective question and show the saved model call.
5. Grade a free-form question and show the selected provider and latency.
6. Run the labeled failover drill and show the routing trace.
7. Return to the dashboard to show weak-topic guidance and resource savings.
