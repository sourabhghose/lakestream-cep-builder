"""
Deployment API router.

Deploys pipelines to Databricks as DLT pipelines (SDP) or Jobs (SSS).
Includes validate_connection, list_catalogs, list_schemas for UC browsing.
Deploy history is recorded when using Lakebase (PGHOST set).
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import UserInfo, get_current_user
from app.codegen.router import generate
from app.models.pipeline import DeployHistoryEntry, DeployRequest, DeployResponse
from app.services.deploy_history import DeployRecord, list_deploys, record_deploy
from app.services.deploy_service import DatabricksDeployError, DeployService
from app.services.pipeline_store import get_pipeline_store

router = APIRouter()
deploy_service = DeployService()


@router.post("", response_model=DeployResponse)
async def deploy_pipeline(
    request: DeployRequest,
    user: UserInfo = Depends(get_current_user),
) -> DeployResponse:
    """
    Deploy a pipeline to Databricks.

    Fetches the pipeline, generates code (SDP or SSS), creates a notebook
    in the workspace, and creates/updates a DLT pipeline (SDP) or Job (SSS).
    """
    pipeline = get_pipeline_store().get(request.pipeline_id)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    try:
        codegen_result = generate(pipeline)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Determine code target: from request, or from codegen (default sdp for hybrid)
    code_target = request.code_target
    if code_target is None:
        ct = codegen_result.code_target
        code_target = "sdp" if ct in ("sdp", "hybrid") else "sss"

    # Hybrid: deploy both SDP and SSS as a multi-task job
    # Auto-downgrade to single target if only one code type exists
    if code_target == "hybrid":
        sdp_code = codegen_result.sdp_code
        sss_code = codegen_result.sss_code
        if not sdp_code and not sss_code:
            raise HTTPException(
                status_code=400,
                detail="No code generated. Check pipeline nodes.",
            )
        if sdp_code and sss_code:
            try:
                result = deploy_service.deploy_hybrid(
                    pipeline_id=request.pipeline_id,
                    job_name=request.job_name,
                    cluster_config=request.cluster_config,
                    schedule=request.schedule,
                    sdp_code=sdp_code,
                    sss_code=sss_code,
                    pipeline_name=pipeline.name,
                    catalog=request.catalog,
                    schema=request.target_schema,
                )
                record_deploy(
                    pipeline_id=request.pipeline_id,
                    version=pipeline.version,
                    code_target="hybrid",
                    job_id=result["job_id"],
                    job_url=result["job_url"],
                    status=result["status"],
                    code=f"-- SDP --\n{sdp_code}\n\n# --- SSS ---\n{sss_code}",
                    cluster_config=request.cluster_config,
                    deployment_type=result.get("deployment_type", "job"),
                    deployed_by=user.email,
                )
                return DeployResponse(
                    job_id=result["job_id"],
                    job_url=result["job_url"],
                    status=result["status"],
                    deployment_type=result.get("deployment_type", "job"),
                )
            except DatabricksDeployError as e:
                raise HTTPException(status_code=502, detail=str(e)) from e
        else:
            code_target = "sdp" if sdp_code else "sss"

    # Select code to deploy
    if code_target == "sdp":
        code = codegen_result.sdp_code
        if not code:
            raise HTTPException(
                status_code=400,
                detail="Pipeline does not generate SDP code. Use code_target='sss' or adjust pipeline.",
            )
    else:
        code = codegen_result.sss_code
        if not code:
            raise HTTPException(
                status_code=400,
                detail="Pipeline does not generate SSS code. Use code_target='sdp' or adjust pipeline.",
            )

    try:
        result = deploy_service.deploy(
            pipeline_id=request.pipeline_id,
            job_name=request.job_name,
            cluster_config=request.cluster_config,
            schedule=request.schedule,
            code=code,
            code_target=code_target,
            pipeline_name=pipeline.name,
            catalog=request.catalog,
            schema=request.target_schema,
        )
        record_deploy(
            pipeline_id=request.pipeline_id,
            version=pipeline.version,
            code_target=code_target,
            job_id=result["job_id"],
            job_url=result["job_url"],
            status=result["status"],
            code=code,
            cluster_config=request.cluster_config,
            deployment_type=result.get("deployment_type", "job"),
            deployed_by=user.email,
        )
        return DeployResponse(
            job_id=result["job_id"],
            job_url=result["job_url"],
            status=result["status"],
            deployment_type=result.get("deployment_type", "job"),
        )
    except DatabricksDeployError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/history/{pipeline_id}/details", response_model=list[DeployHistoryEntry])
async def get_deploy_history_details(pipeline_id: str) -> list[DeployHistoryEntry]:
    """
    List full deploy history for a pipeline including deployed_code.

    Returns empty list when not using Lakebase (PGHOST not set).
    """
    records = list_deploys(pipeline_id)
    return [
        DeployHistoryEntry(
            id=r.id,
            pipeline_id=r.pipeline_id,
            pipeline_version=r.pipeline_version,
            code_target=r.code_target,
            databricks_job_id=r.databricks_job_id,
            databricks_pipeline_id=r.databricks_pipeline_id,
            job_url=r.job_url,
            deploy_status=r.deploy_status,
            deployed_code=r.deployed_code,
            cluster_config=r.cluster_config,
            deployed_by=r.deployed_by,
            deployed_at=r.deployed_at,
            error_message=r.error_message,
        )
        for r in records
    ]


@router.get("/history/{pipeline_id}", response_model=list[DeployHistoryEntry])
async def get_deploy_history(pipeline_id: str) -> list[DeployHistoryEntry]:
    """
    List deploy history for a pipeline.

    Returns empty list when not using Lakebase (PGHOST not set).
    Includes deployed_code in response.
    """
    records = list_deploys(pipeline_id)
    return [
        DeployHistoryEntry(
            id=r.id,
            pipeline_id=r.pipeline_id,
            pipeline_version=r.pipeline_version,
            code_target=r.code_target,
            databricks_job_id=r.databricks_job_id,
            databricks_pipeline_id=r.databricks_pipeline_id,
            job_url=r.job_url,
            deploy_status=r.deploy_status,
            deployed_code=r.deployed_code,
            cluster_config=r.cluster_config,
            deployed_by=r.deployed_by,
            deployed_at=r.deployed_at,
            error_message=r.error_message,
        )
        for r in records
    ]


@router.get("/validate", response_model=dict)
async def validate_connection() -> dict:
    """
    Test whether the Databricks connection is working.

    Returns success, message, and mode (mock or databricks).
    """
    return deploy_service.validate_connection()


@router.get("/catalogs")
async def list_catalogs() -> list[dict[str, str]]:
    """
    List Unity Catalog catalogs available to the user.

    Used for picking deployment target. Returns empty list when not connected.
    """
    return deploy_service.list_catalogs()


@router.get("/catalogs/{catalog_name}/schemas")
async def list_schemas(catalog_name: str) -> list[dict[str, str]]:
    """
    List schemas in a Unity Catalog catalog.

    Used for picking deployment target. Returns empty list when not connected.
    """
    return deploy_service.list_schemas(catalog_name)
