"""
Database module for Lakebase PostgreSQL.

Uses psycopg3 for PostgreSQL connection. Connection params are read from
environment variables (PGHOST, PGUSER, PGDATABASE, PGPORT, PGSSLMODE) which
are auto-injected by Databricks Apps when Lakebase is added as a resource.

When PGHOST is not set (local development), fall back to LocalFileStore.
"""

import os
from pathlib import Path

_pool = None


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

        conninfo = (
            f"host={host} "
            f"user={os.environ.get('PGUSER', 'postgres')} "
            f"dbname={os.environ.get('PGDATABASE', 'postgres')} "
            f"port={os.environ.get('PGPORT', '5432')} "
            f"sslmode={os.environ.get('PGSSLMODE', 'prefer')}"
        )
        if os.environ.get("PGPASSWORD"):
            conninfo += f" password={os.environ['PGPASSWORD']}"
        _pool = psycopg_pool.ConnectionPool(conninfo, min_size=1, max_size=10)
    return _pool


def is_postgres_available() -> bool:
    """True if PGHOST is set (Lakebase/PostgreSQL available)."""
    return bool(os.environ.get("PGHOST"))


def init_db() -> None:
    """
    Run schema DDL to create tables if they don't exist.
    No-op when PGHOST is not set (local dev with LocalFileStore).
    """
    if not is_postgres_available():
        return
    schema_path = Path(__file__).parent / "db_schema.sql"
    schema_sql = schema_path.read_text()
    pool = get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(schema_sql)
