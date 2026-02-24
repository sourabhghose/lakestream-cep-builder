"""
Database module for Lakebase PostgreSQL.

Uses psycopg3 for PostgreSQL connection. Connection params are read from
environment variables (PGHOST, PGUSER, PGDATABASE, PGPORT, PGSSLMODE) which
are auto-injected by Databricks Apps when Lakebase is added as a resource.

When PGHOST is not set (local development), fall back to LocalFileStore.
"""

import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_pool = None
_pg_available = None


def _get_oauth_token() -> str | None:
    """Fetch a fresh Databricks OAuth token for Lakebase auth."""
    try:
        from databricks.sdk import WorkspaceClient
        w = WorkspaceClient()
        header_factory = w.config.authenticate()
        headers = header_factory("GET", "https://placeholder")
        auth_value = headers.get("Authorization", "")
        if auth_value.startswith("Bearer "):
            return auth_value[7:]
        return auth_value or None
    except Exception as e:
        logger.debug("Could not fetch Databricks OAuth token: %s", e)
        return None


def get_pool():
    """Return the connection pool singleton. Raises if PGHOST is not set."""
    global _pool
    if _pool is None:
        host = os.environ.get("PGHOST")
        if not host:
            raise RuntimeError(
                "PGHOST is not set. Use LocalFileStore for local development."
            )
        import psycopg_pool

        user = os.environ.get("PGUSER", "postgres")
        dbname = os.environ.get("PGDATABASE", "postgres")
        port = os.environ.get("PGPORT", "5432")
        sslmode = os.environ.get("PGSSLMODE", "require")

        password = os.environ.get("PGPASSWORD", "")
        if not password:
            password = _get_oauth_token() or ""

        conninfo = (
            f"host={host} "
            f"user={user} "
            f"dbname={dbname} "
            f"port={port} "
            f"sslmode={sslmode}"
        )
        if password:
            conninfo += f" password={password}"

        logger.info(
            "Creating Lakebase pool: host=%s, user=%s, db=%s, port=%s, sslmode=%s",
            host, user, dbname, port, sslmode,
        )

        _pool = psycopg_pool.ConnectionPool(
            conninfo,
            min_size=1,
            max_size=10,
        )
        logger.info("Lakebase connection pool created successfully")
    return _pool


def is_postgres_available() -> bool:
    """True if PGHOST is set (Lakebase/PostgreSQL available)."""
    global _pg_available
    if _pg_available is not None:
        return _pg_available
    _pg_available = bool(os.environ.get("PGHOST"))
    return _pg_available


def init_db() -> None:
    """
    Run schema DDL to create tables if they don't exist.
    No-op when PGHOST is not set (local dev with LocalFileStore).
    Falls back to LocalFileStore if the connection fails.
    """
    if not is_postgres_available():
        logger.info("PGHOST not set — using local file storage")
        return
    schema_path = Path(__file__).parent / "db_schema.sql"
    schema_sql = schema_path.read_text()
    try:
        pool = get_pool()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(schema_sql)
        logger.info("Lakebase schema initialized successfully")
    except Exception as e:
        global _pg_available
        logger.error("Failed to initialize Lakebase: %s — falling back to local storage", e)
        _pg_available = False
