#!/usr/bin/env python3
"""Emit a truthful JSON capability manifest for a local or SSH compute node.

The probe is read-only, uses only the Python standard library, and never handles
or persists SSH credentials.  Remote authentication is delegated to the user's
normal ``ssh`` configuration or agent.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request


KNOWN_MODEL_ENDPOINTS = (
    ("lm-studio", "http://127.0.0.1:1234/v1/models"),
    ("ollama-openai", "http://127.0.0.1:11434/v1/models"),
    ("ollama", "http://127.0.0.1:11434/api/tags"),
    ("vllm", "http://127.0.0.1:8000/v1/models"),
    ("sglang", "http://127.0.0.1:30000/v1/models"),
)


def _read_first(paths: tuple[str, ...]) -> str | None:
    for path in paths:
        try:
            value = open(path, encoding="utf-8").read().strip()
        except OSError:
            continue
        if value:
            return value
    return None


def _limit_value(raw: str | None, *, divisor: int = 1) -> float | int | None:
    if not raw or raw == "max":
        return None
    try:
        value = int(raw) / divisor
    except ValueError:
        return None
    return round(value, 2) if divisor != 1 else int(value)


def _probe_url(name: str, url: str, timeout: float) -> dict | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            body = response.read(256 * 1024)
            payload = json.loads(body)
    except (OSError, ValueError, urllib.error.URLError):
        return None

    models: list[str] = []
    rows = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(rows, list) and isinstance(payload, dict):
        rows = payload.get("models")
    if isinstance(rows, list):
        for row in rows[:20]:
            if isinstance(row, dict):
                model = row.get("id") or row.get("name") or row.get("model")
                if model:
                    models.append(str(model))
    return {"kind": name, "url": url, "models": models}


def collect(timeout: float = 1.5) -> dict:
    cpu_quota = None
    cpu_max = _read_first(("/sys/fs/cgroup/cpu.max",))
    if cpu_max:
        parts = cpu_max.split()
        if len(parts) == 2 and parts[0] != "max":
            try:
                cpu_quota = round(int(parts[0]) / int(parts[1]), 2)
            except (ValueError, ZeroDivisionError):
                pass

    memory_raw = _read_first(
        ("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes")
    )
    memory_gib = _limit_value(memory_raw, divisor=1024**3)

    gpu_models: list[dict] = []
    if shutil.which("nvidia-smi"):
        command = [
            "nvidia-smi",
            "--query-gpu=name,memory.total,memory.free",
            "--format=csv,noheader,nounits",
        ]
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=8, check=True)
            for line in result.stdout.splitlines():
                parts = [part.strip() for part in line.split(",")]
                if len(parts) == 3:
                    gpu_models.append(
                        {
                            "name": parts[0],
                            "memory_total_mib": int(parts[1]),
                            "memory_free_mib": int(parts[2]),
                        }
                    )
        except (OSError, ValueError, subprocess.SubprocessError):
            pass

    services = [
        service
        for name, url in KNOWN_MODEL_ENDPOINTS
        if (service := _probe_url(name, url, timeout)) is not None
    ]
    usable_services = [service for service in services if service["models"]]
    if gpu_models and usable_services:
        mode = "local_model_available"
    elif usable_services:
        mode = "cpu_model_service_available"
    elif services:
        mode = "model_service_no_models"
    elif gpu_models:
        mode = "gpu_available_no_model_service"
    else:
        mode = "cloud_fallback"

    return {
        "hostname": os.uname().nodename,
        "gpu_available": bool(gpu_models),
        "gpus": gpu_models,
        "cpu_limit": cpu_quota,
        "cpu_affinity": len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else None,
        "memory_limit_gib": memory_gib,
        "model_services": services,
        "recommended_mode": mode,
    }


def _remote_collect(host: str, timeout: float) -> dict:
    source = (
        "import base64;"
        + f"exec(base64.b64decode({base64.b64encode(_REMOTE_SOURCE.encode()).decode()!r}))"
    )
    command = [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        host,
        "python3",
        "-c",
        source,
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=20, check=False)
    if result.returncode != 0:
        message = result.stderr.strip() or "SSH capability probe failed"
        raise RuntimeError(message)
    return json.loads(result.stdout)


# Keep the remotely executed payload dependency-free and self-contained.  It is
# deliberately smaller than the local probe: HTTP discovery remains the web
# application's responsibility, while SSH reports hardware/container limits.
_REMOTE_SOURCE = r'''
import json, os, shutil, subprocess, urllib.request

def read(path):
    try:
        return open(path, encoding="utf-8").read().strip()
    except OSError:
        return None

cpu = None
raw = read("/sys/fs/cgroup/cpu.max")
if raw:
    parts = raw.split()
    if len(parts) == 2 and parts[0] != "max":
        try: cpu = round(int(parts[0]) / int(parts[1]), 2)
        except Exception: pass

memory = read("/sys/fs/cgroup/memory.max") or read("/sys/fs/cgroup/memory/memory.limit_in_bytes")
try: memory = None if memory in (None, "max") else round(int(memory) / 1024**3, 2)
except Exception: memory = None

gpus = []
if shutil.which("nvidia-smi"):
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=8, check=True,
        ).stdout
        for line in out.splitlines():
            p = [x.strip() for x in line.split(",")]
            if len(p) == 3:
                gpus.append({"name": p[0], "memory_total_mib": int(p[1]), "memory_free_mib": int(p[2])})
    except Exception: pass

services = []
for name, url in (
    ("lm-studio", "http://127.0.0.1:1234/v1/models"),
    ("ollama-openai", "http://127.0.0.1:11434/v1/models"),
    ("ollama", "http://127.0.0.1:11434/api/tags"),
    ("vllm", "http://127.0.0.1:8000/v1/models"),
    ("sglang", "http://127.0.0.1:30000/v1/models"),
):
    try:
        with urllib.request.urlopen(url, timeout=1.5) as response:
            payload = json.loads(response.read(262144))
        rows = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(rows, list) and isinstance(payload, dict): rows = payload.get("models")
        models = []
        if isinstance(rows, list):
            for row in rows[:20]:
                if isinstance(row, dict):
                    model = row.get("id") or row.get("name") or row.get("model")
                    if model: models.append(str(model))
        services.append({"kind": name, "url": url, "models": models})
    except Exception: pass

usable = any(service["models"] for service in services)
mode = (
    "local_model_available" if gpus and usable else
    "cpu_model_service_available" if usable else
    "model_service_no_models" if services else
    "gpu_available_no_model_service" if gpus else
    "cloud_fallback"
)

print(json.dumps({
    "hostname": os.uname().nodename,
    "gpu_available": bool(gpus),
    "gpus": gpus,
    "cpu_limit": cpu,
    "cpu_affinity": len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else None,
    "memory_limit_gib": memory,
    "model_services": services,
    "recommended_mode": mode,
}))
'''


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ssh", metavar="HOST", help="probe HOST through the system ssh client")
    parser.add_argument("--timeout", type=float, default=1.5, help="local endpoint timeout in seconds")
    args = parser.parse_args()
    try:
        manifest = _remote_collect(args.ssh, args.timeout) if args.ssh else collect(args.timeout)
    except (RuntimeError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
