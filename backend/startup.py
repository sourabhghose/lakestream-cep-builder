"""Diagnostic startup script for Databricks Apps.

Wraps uvicorn startup with error handling to capture any import
or initialization errors that would otherwise cause a silent crash.
"""

import os
import sys
import traceback

def main():
    port = int(os.environ.get("DATABRICKS_APP_PORT", "8000"))
    print(f"[startup] Python {sys.version}", flush=True)
    print(f"[startup] Working directory: {os.getcwd()}", flush=True)
    print(f"[startup] Port: {port}", flush=True)
    print(f"[startup] PGHOST set: {bool(os.environ.get('PGHOST'))}", flush=True)
    print(f"[startup] DATABRICKS_HOST: {os.environ.get('DATABRICKS_HOST', 'not set')}", flush=True)

    try:
        print("[startup] Importing app...", flush=True)
        from app.main import app  # noqa: F401
        print("[startup] App imported successfully", flush=True)
    except Exception:
        print("[startup] FATAL: Failed to import app:", flush=True)
        traceback.print_exc()
        sys.exit(1)

    try:
        import uvicorn
        print(f"[startup] Starting uvicorn on 0.0.0.0:{port}", flush=True)
        uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
    except Exception:
        print("[startup] FATAL: Uvicorn failed:", flush=True)
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
