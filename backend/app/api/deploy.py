"""
Deployment API router.

Deploys pipelines to Databricks as jobs. Placeholder implementation returns mock responses.
"""

from fastapi import APIRouter, HTTPException

from app.models.pipeline import DeployRequest, DeployResponse
from app.services.deploy_service import DeployService

router = APIRouter()
deploy_service = DeployService()


@router.post("", response_model=DeployResponse)
async def deploy_pipeline(request: DeployRequest) -> DeployResponse:
    """
    Deploy a pipeline to Databricks as a job.

    Placeholder implementation - returns mock job_id and job_url.
    """
    # TODO: Fetch pipeline and generated code from storage
    # For now, use placeholder code
    code = "# Placeholder - integrate with codegen to get actual code"
    try:
        result = deploy_service.deploy(
            pipeline_id=request.pipeline_id,
            job_name=request.job_name,
            cluster_config=request.cluster_config,
            schedule=request.schedule,
            code=code,
        )
        return DeployResponse(
            job_id=result["job_id"],
            job_url=result["job_url"],
            status=result["status"],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
