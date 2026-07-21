# Deployment — Campus AI (HKUST(GZ) AI+ Competition)

## Platform Info

| Item | Value |
|------|-------|
| Platform | Campus AI Community (SusCom Lab, HKUST(GZ)) |
| Devbox | SSH: `<user>@<devbox-host> -p <port>` |
| App name | `exam-clone` |
| Access URL | `https://<platform-host>/apps/exam-clone/` |

## Environment

| Tool | Version |
|------|---------|
| OS | Debian 12 (bookworm) |
| Node.js | v24.11.0 |
| npm | 11.6.1 |
| Python | Not pre-installed |
| Docker | Not available |

Persistent storage is mounted at `/mydata` (63 GB).

## Platform Requirements

- App must listen on **port 3000**
- Base path must be set to `/apps/exam-clone/`
- Platform forwards the full prefixed path (does NOT strip the prefix)

## Deployment Steps

### Backend (Python / FastAPI — using uv)

```bash
# Install uv (standalone, no sudo needed)
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env

# Create .env with optional built-in provider settings
cp .env.example .env
# edit .env → set DEEPSEEK_API_KEY or MODEL_LOCAL_ENDPOINTS if needed

cd backend
uv sync                     # Installs Python + deps
uv run python main.py       # Starts on port 3000
```

### Frontend (React / Vite)

```bash
cd frontend
npm install

# Build for production with base path (REQUIRED for platform)
VITE_BASE=/apps/exam-clone/ npm run build
```

### Serve Frontend

In production, the backend serves the frontend build directly via StaticFiles.
Set `FRONTEND_DIST=../frontend/dist` when starting the backend, or it defaults
to `../frontend/dist` relative to the backend directory.

For local dev, Vite proxies `/api` to `localhost:3000`.

### Single-Process Production (Platform Requirement)

The platform requires one process on port 3000. The backend serves:
- API routes at `/api/*` (also accessible at `/apps/exam-clone/api/*` via a path rewrite middleware)
- Frontend static files at `/apps/exam-clone/` and `/`
- SPA fallback (React Router) for client-side routes

```bash
cd backend
FRONTEND_DIST=../frontend/dist PORT=3000 nohup uv run python main.py > ~/exam-cloner.log 2>&1 &
```

### Data Persistence

Configure `DATA_DIR=/mydata/exam-cloner-data/data` and
`UPLOAD_DIR=/mydata/exam-cloner-data/uploads` in the environment. Create those
directories on the platform before the first start. This avoids replacing an
existing data directory during a routine deployment.

## API Authentication

The API uses the `X-User-Id` header for user isolation. Every request should include this header
with a unique user identifier. If omitted, requests default to the "public" user.

## Notes

- The devbox has **no Docker**, so `docker-compose.yml` cannot be used directly.
- `/mydata` is persistent across rebuilds — use it for uploaded files and JSON data if the devbox is recreated.
- Docker now uses port 3000 (matching the platform requirement), proxied through nginx on the frontend side.
- The app was originally built for the **HKUST(GZ) AI+ Competition** and may need adjustments for other platforms.
