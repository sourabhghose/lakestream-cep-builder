"""
Job status API router.

Provides endpoints to get status of deployed Databricks jobs and list active jobs.
"""

from fastapi import APIRouter, HTTPException

from app.services.deploy_history import DeployRecord, list_recent_deploys
from app.services.deploy_service import DeployService
from app.services.pipeline_store import get_pipeline_store

router = APIRouter()
deploy_service = DeployService()

# Standard status values for API response
JOB_STATUS = ("PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED")


def _job_id_from_record(r: DeployRecord) -> str | None:
    """Extract job_id from deploy record (job or pipeline)."""
    if r.databricks_job_id:
        return r.databricks_job_id
    if r.databricks_pipeline_id:
        return r.databricks_pipeline_id
    return None


def _deployment_type_from_record(r: DeployRecord) -> str:
    """Determine deployment_type from deploy record."""
    if r.databricks_pipeline_id:
        return "pipeline"
    return "job"


def _pipeline_name(pipeline_id: str) -> str:
    """Get pipeline name from pipeline store."""
    store = get_pipeline_store()
    pipeline = store.get(pipeline_id)
    return pipeline.name if pipeline else pipeline_id


@router.get("/active")
async def get_active_jobs() -> list[dict]:
    """
    List all active/running jobs for deployed pipelines.

    Returns jobs with status PENDING or RUNNING from recent deployments.
    """
    recent = list_recent_deploys(limit=50)
    active: list[dict] = []
    seen_job_ids: set[str] = set()

    for r in recent:
        job_id = _job_id_from_record(r)
        if not job_id or job_id in seen_job_ids:
            continue
        seen_job_ids.add(job_id)

        deployment_type = _deployment_type_from_record(r)
        result = deploy_service.get_job_status_detail(
            job_id=job_id,
            deployment_type=deployment_type,
            job_url=r.job_url,
        )
        status = result.get("status", "PENDING")
        if status not in JOB_STATUS:
            status = "PENDING"
        if status in ("PENDING", "RUNNING"):
            pipeline_name = _pipeline_name(r.pipeline_id)
            active.append({
                "job_id": job_id,
                "pipeline_id": r.pipeline_id,
                "pipeline_name": pipeline_name,
                "status": status,
                "job_url": result.get("run_url") or r.job_url,
                "start_time": result.get("start_time"),
                "duration_ms": result.get("duration_ms"),
            })

    return active


@router.get("/{job_id}/status")
async def get_job_status(job_id: str) -> dict:
    """
    Get current status of a Databricks job or pipeline.

    Returns: { job_id, status, run_url?, start_time?, duration_ms? }
    Status: PENDING | RUNNING | SUCCEEDED | FAILED | CANCELLED
    """
    # Infer deployment_type: numeric job_id = job, UUID = pipeline
    deployment_type = "job"
    try:
        int(job_id)
    except ValueError:
        deployment_type = "pipeline"

    result = deploy_service.get_job_status_detail(
        job_id=job_id,
        deployment_type=deployment_type,
    )
    # Normalize status to our enum (mock may return UNKNOWN)
    status = result.get("status", "PENDING")
    if status not in JOB_STATUS:
        result["status"] = "PENDING"
    return result
