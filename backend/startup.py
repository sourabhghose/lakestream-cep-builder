"""Startup script for Databricks Apps deployment."""
import os
import sys
import traceback

def main():
    port = int(os.environ.get("DATABRICKS_APP_PORT", "8000"))
    print(f"[startup] Python {sys.version}", flush=True)
    print(f"[startup] CWD: {os.getcwd()}", flush=True)
    print(f"[startup] Port: {port}", flush=True)
    print(f"[startup] Files: {os.listdir('.')}", flush=True)

    try:
        sys.path.insert(0, os.getcwd())
        print("[startup] Importing app...", flush=True)
        from app.main import app
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
