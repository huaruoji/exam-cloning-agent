# Operations — Exam Cloner

This is the repository-safe operations guide. It contains no platform
credentials or private hostnames. Keep deployment-specific access details in
the ignored `docs/operations-local.md` file described below.

## Local development

```bash
cp .env.example .env
cd backend && uv sync && uv run python main.py
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The backend serves the production frontend when `FRONTEND_DIST` points to the
built `frontend/dist` directory. The competition environment uses port `3000`.

## Competition deployment

1. Build the frontend with the platform prefix:

   ```bash
   cd frontend
   VITE_BASE=/apps/exam-clone/ npm run build
   ```

2. Configure persistent paths and provider settings through environment
   variables. See [.env.example](../.env.example) and
   [compute-api.md](compute-api.md).

3. Start one FastAPI process on port 3000:

   ```bash
   cd backend
   FRONTEND_DIST=../frontend/dist PORT=3000 uv run python main.py
   ```

4. Confirm the service:

   ```bash
   curl -fsS http://127.0.0.1:3000/api/health
   ```

## Persistent data

Set `DATA_DIR` and `UPLOAD_DIR` to persistent volumes supplied by the platform.
The application stores JSON records and uploaded source files there. Do not
delete or replace those directories during a routine code update.

## Resource diagnostics

The read-only probe reports cgroup limits, visible NVIDIA GPUs, and known local
model services. It never stores SSH credentials:

```bash
python scripts/probe_compute_node.py
python scripts/probe_compute_node.py --ssh user@host
```

The web application uses HTTP model APIs during inference. SSH is for
administrator diagnostics and deployment only.

## Health and troubleshooting

- `/api/health` fails: check the process, port, and `DATA_DIR` permissions.
- Compute Center reports `unknown`: a configured provider has not been
  explicitly probed yet.
- Provider is reachable but unusable: its model listing is empty or the
  configured model name is unavailable.
- Requests degrade to rules-only: inspect `/api/compute/status`, then test a
  compatible endpoint from Settings or configure an administrator-managed
  local endpoint.
- Uploaded jobs fail: inspect the job error in Materials and use Retry after
  confirming the source file and parser limits.

## Private deployment notes

Create `docs/operations-local.md` locally when platform-specific commands,
SSH usernames, hosts, ports, helper paths, or access URLs are needed. That file
is ignored by Git and must not be copied into a commit or shared archive.
