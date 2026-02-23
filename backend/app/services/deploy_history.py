"""
Deploy history service for recording and querying pipeline deployments.

Uses Lakebase PostgreSQL (deploy_history table) when PGHOST is set.
When not using PostgreSQL, record_deploy is a no-op and list/get return empty/None.
"""

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.db import get_pool, is_postgres_available


@dataclass
class DeployRecord:
    """A single deploy history record."""

    id: str
    pipeline_id: str
    pipeline_version: int
    code_target: str
    databricks_job_id: str | None
    databricks_pipeline_id: str | None
    job_url: str | None
    deploy_status: str
    deployed_code: str | None
    cluster_config: dict[str, Any] | None
    deployed_by: str | None
    deployed_at: datetime
    error_message: str | None


def record_deploy(
    pipeline_id: str,
    version: int,
    code_target: str,
    job_id: str,
    job_url: str,
    status: str,
    code: str | None = None,
    error: str | None = None,
    cluster_config: dict[str, Any] | None = None,
    deployed_by: str | None = None,
    deployment_type: str = "job",
) -> None:
    """
    Record a deployment in the deploy_history table.

    When deployment_type is 'pipeline', job_id goes to databricks_pipeline_id.
    When deployment_type is 'job', job_id goes to databricks_job_id.
    """
    if not is_postgres_available():
        return
    pool = get_pool()
    databricks_job_id = job_id if deployment_type in ("job", "mock") else None
    databricks_pipeline_id = job_id if deployment_type == "pipeline" else None
    cluster_json = json.dumps(cluster_config) if cluster_config else None
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO deploy_history (
                    pipeline_id, pipeline_version, code_target,
                    databricks_job_id, databricks_pipeline_id, job_url,
                    deploy_status, deployed_code, cluster_config, deployed_by, error_message
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                """,
                (
                    pipeline_id,
                    version,
                    code_target,
                    databricks_job_id,
                    databricks_pipeline_id,
                    job_url,
                    status,
                    code,
                    cluster_json,
                    deployed_by,
                    error,
                ),
            )


def list_deploys(pipeline_id: str) -> list[DeployRecord]:
    """List deploy history for a pipeline. Returns empty list when not using PostgreSQL."""
    if not is_postgres_available():
        return []
    pool = get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, pipeline_id, pipeline_version, code_target,
                       databricks_job_id, databricks_pipeline_id, job_url,
                       deploy_status, deployed_code, cluster_config,
                       deployed_by, deployed_at, error_message
                FROM deploy_history
                WHERE pipeline_id = %s
                ORDER BY deployed_at DESC
                """,
                (pipeline_id,),
            )
            rows = cur.fetchall()
    return [
        DeployRecord(
            id=str(row[0]),
            pipeline_id=str(row[1]),
            pipeline_version=row[2],
            code_target=row[3],
            databricks_job_id=row[4],
            databricks_pipeline_id=row[5],
            job_url=row[6],
            deploy_status=row[7],
            deployed_code=row[8],
            cluster_config=row[9] if isinstance(row[9], dict) else (json.loads(row[9]) if row[9] else None),
            deployed_by=row[10],
            deployed_at=row[11],
            error_message=row[12],
        )
        for row in rows
    ]


def get_latest_deploy(pipeline_id: str) -> DeployRecord | None:
    """Get the most recent deployment for a pipeline."""
    if not is_postgres_available():
        return None
    pool = get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, pipeline_id, pipeline_version, code_target,
                       databricks_job_id, databricks_pipeline_id, job_url,
                       deploy_status, deployed_code, cluster_config,
                       deployed_by, deployed_at, error_message
                FROM deploy_history
                WHERE pipeline_id = %s
                ORDER BY deployed_at DESC
                LIMIT 1
                """,
                (pipeline_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return DeployRecord(
        id=str(row[0]),
        pipeline_id=str(row[1]),
        pipeline_version=row[2],
        code_target=row[3],
        databricks_job_id=row[4],
        databricks_pipeline_id=row[5],
        job_url=row[6],
        deploy_status=row[7],
        deployed_code=row[8],
        cluster_config=row[9] if isinstance(row[9], dict) else (json.loads(row[9]) if row[9] else None),
        deployed_by=row[10],
        deployed_at=row[11],
        error_message=row[12],
    )
