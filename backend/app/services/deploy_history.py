"""
Deploy history service for recording and querying pipeline deployments.

Uses Lakebase PostgreSQL (deploy_history table) when PGHOST is set.
When not using PostgreSQL, uses LocalFileDeployStore (JSON files in ~/.lakestream/deploy_history/).
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
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


def _get_local_store(base_dir: Path | None = None) -> LocalFileDeployStore:
    """Return LocalFileDeployStore for testing or when PGHOST is not set."""
    if base_dir is None:
        base_dir = Path.home() / ".lakestream" / "deploy_history"
    return LocalFileDeployStore(base_dir=base_dir)


class LocalFileDeployStore:
    """Stores deploy records as JSON files for local dev/testing (no PostgreSQL)."""

    def __init__(self, base_dir: Path | str) -> None:
        self._base = Path(base_dir)
        self._base.mkdir(parents=True, exist_ok=True)

    def _path(self, pipeline_id: str) -> Path:
        safe_id = "".join(c if c.isalnum() or c in "-_" else "_" for c in pipeline_id)
        return self._base / f"{safe_id}.json"

    def _record_to_dict(self, r: DeployRecord) -> dict:
        return {
            "id": r.id,
            "pipeline_id": r.pipeline_id,
            "pipeline_version": r.pipeline_version,
            "code_target": r.code_target,
            "databricks_job_id": r.databricks_job_id,
            "databricks_pipeline_id": r.databricks_pipeline_id,
            "job_url": r.job_url,
            "deploy_status": r.deploy_status,
            "deployed_code": r.deployed_code,
            "cluster_config": r.cluster_config,
            "deployed_by": r.deployed_by,
            "deployed_at": r.deployed_at.isoformat() if r.deployed_at else None,
            "error_message": r.error_message,
        }

    def _dict_to_record(self, d: dict) -> DeployRecord:
        deployed_at = d.get("deployed_at")
        if isinstance(deployed_at, str):
            deployed_at = datetime.fromisoformat(deployed_at.replace("Z", "+00:00"))
        return DeployRecord(
            id=d["id"],
            pipeline_id=d["pipeline_id"],
            pipeline_version=d["pipeline_version"],
            code_target=d["code_target"],
            databricks_job_id=d.get("databricks_job_id"),
            databricks_pipeline_id=d.get("databricks_pipeline_id"),
            job_url=d.get("job_url"),
            deploy_status=d["deploy_status"],
            deployed_code=d.get("deployed_code"),
            cluster_config=d.get("cluster_config"),
            deployed_by=d.get("deployed_by"),
            deployed_at=deployed_at or datetime.now(tz=timezone.utc),
            error_message=d.get("error_message"),
        )

    def record_deploy(
        self,
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
        databricks_job_id = job_id if deployment_type in ("job", "mock") else None
        databricks_pipeline_id = job_id if deployment_type == "pipeline" else None
        record = DeployRecord(
            id=str(uuid.uuid4()),
            pipeline_id=pipeline_id,
            pipeline_version=version,
            code_target=code_target,
            databricks_job_id=databricks_job_id,
            databricks_pipeline_id=databricks_pipeline_id,
            job_url=job_url,
            deploy_status=status,
            deployed_code=code,
            cluster_config=cluster_config,
            deployed_by=deployed_by,
            deployed_at=datetime.now(tz=timezone.utc),
            error_message=error,
        )
        path = self._path(pipeline_id)
        records = []
        if path.exists():
            with open(path) as f:
                records = [self._dict_to_record(d) for d in json.load(f)]
        records.insert(0, record)
        with open(path, "w") as f:
            json.dump([self._record_to_dict(r) for r in records], f, indent=2)

    def list_deploys(self, pipeline_id: str) -> list[DeployRecord]:
        path = self._path(pipeline_id)
        if not path.exists():
            return []
        with open(path) as f:
            return [self._dict_to_record(d) for d in json.load(f)]

    def get_deploy(self, deploy_id: str) -> DeployRecord | None:
        for path in self._base.glob("*.json"):
            for d in json.loads(path.read_text()):
                if d.get("id") == deploy_id:
                    return self._dict_to_record(d)
        return None

    def get_latest_deploy(self, pipeline_id: str) -> DeployRecord | None:
        records = self.list_deploys(pipeline_id)
        return records[0] if records else None


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
    Uses LocalFileDeployStore when PGHOST is not set.
    """
    if is_postgres_available():
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
    else:
        _get_local_store().record_deploy(
            pipeline_id=pipeline_id,
            version=version,
            code_target=code_target,
            job_id=job_id,
            job_url=job_url,
            status=status,
            code=code,
            error=error,
            cluster_config=cluster_config,
            deployed_by=deployed_by,
            deployment_type=deployment_type,
        )


def list_deploys(pipeline_id: str) -> list[DeployRecord]:
    """List deploy history for a pipeline. Uses LocalFileDeployStore when PGHOST is not set."""
    if not is_postgres_available():
        return _get_local_store().list_deploys(pipeline_id)
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


def get_deploy(deploy_id: str) -> DeployRecord | None:
    """Fetch a single deploy record by ID. Uses LocalFileDeployStore when PGHOST is not set."""
    if not is_postgres_available():
        return _get_local_store().get_deploy(deploy_id)
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
                WHERE id = %s
                """,
                (deploy_id,),
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


def get_latest_deploy(pipeline_id: str) -> DeployRecord | None:
    """Get the most recent deployment for a pipeline. Uses LocalFileDeployStore when PGHOST is not set."""
    if not is_postgres_available():
        return _get_local_store().get_latest_deploy(pipeline_id)
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
