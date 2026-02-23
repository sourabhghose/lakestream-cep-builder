"""
Deployment service for Databricks jobs and DLT pipelines.

Uses the Databricks SDK to create notebooks, DLT pipelines (SDP), and Jobs (SSS).
Falls back to mock behavior when DATABRICKS_HOST is not set.
"""

import io
import re
import time
import uuid
from typing import Any, Literal

from databricks.sdk import WorkspaceClient
from databricks.sdk.service import jobs, pipelines, workspace

from app.config import DatabricksConfig


class DatabricksDeployError(Exception):
    """Raised when Databricks deployment fails."""

    pass


class DeployService:
    """
    Service for deploying pipelines to Databricks.

    - SDP code -> Lakeflow/DLT pipeline via pipelines API
    - SSS code -> Job with streaming task via jobs API
    - Creates notebook in user workspace before deployment
    """

    def __init__(self, config: DatabricksConfig | None = None) -> None:
        self._config = config or DatabricksConfig()

    def _get_client(self) -> WorkspaceClient:
        """Create WorkspaceClient; raises if credentials are missing."""
        if not self._config.host or not self._config.host.strip():
            raise DatabricksDeployError(
                "DATABRICKS_HOST is not set. Configure Databricks credentials for real deployment."
            )
        try:
            return WorkspaceClient(
                host=self._config.host,
                token=self._config.token,
            )
        except Exception as e:
            raise DatabricksDeployError(
                f"Failed to create Databricks client: {e}"
            ) from e

    def _safe_path(self, name: str) -> str:
        """Sanitize name for use in workspace path."""
        return re.sub(r"[^\w\-.]", "_", name)[:64]

    def _upload_notebook(
        self,
        w: WorkspaceClient,
        code: str,
        pipeline_name: str,
        pipeline_id: str,
        suffix: str,
    ) -> str:
        """Upload code as a notebook/file to workspace. Returns workspace path."""
        prefix = self._config.workspace_path_prefix
        safe_name = self._safe_path(pipeline_name)
        ts = int(time.time_ns() / 1000)
        path = f"/Users/{w.current_user.me().user_name}/{prefix}/{safe_name}_{pipeline_id[:8]}_{ts}.py"

        # Ensure parent directory exists
        parent = "/".join(path.split("/")[:-1])
        w.workspace.mkdirs(parent)

        # Upload as Python source
        content = code.encode("utf-8")
        w.workspace.upload(
            path,
            io.BytesIO(content),
            format=workspace.ImportFormat.SOURCE,
            language=workspace.Language.PYTHON,
            overwrite=True,
        )
        return path

    def _build_cluster_config(self, cluster_config: dict[str, Any]) -> dict[str, Any]:
        """Build new_cluster spec from cluster_config."""
        cfg = cluster_config or {}
        return {
            "spark_version": cfg.get("spark_version", "auto:latest-lts"),
            "node_type_id": cfg.get("node_type_id", "i3.xlarge"),
            "num_workers": cfg.get("num_workers", 1),
            **(cfg.get("custom_config") or {}),
        }

    def _build_pipeline_clusters(
        self, cluster_config: dict[str, Any]
    ) -> list[pipelines.PipelineCluster]:
        """Build PipelineCluster list for DLT pipeline."""
        cfg = self._build_cluster_config(cluster_config)
        cluster_kw: dict[str, Any] = {
            "label": "default",
            "num_workers": cfg.get("num_workers", 1),
            "custom_tags": {"cluster_type": "default"},
        }
        if cfg.get("node_type_id"):
            cluster_kw["node_type_id"] = cfg["node_type_id"]
        if cfg.get("spark_version"):
            cluster_kw["spark_version"] = cfg["spark_version"]
        return [pipelines.PipelineCluster(**cluster_kw)]

    def _build_job_clusters(
        self, cluster_config: dict[str, Any]
    ) -> list[jobs.JobCluster]:
        """Build JobCluster list for Jobs API."""
        cfg = self._build_cluster_config(cluster_config)
        return [
            jobs.JobCluster(
                job_cluster_key="main_cluster",
                new_cluster=cfg,
            )
        ]

    def _job_url(self, host: str, job_id: int) -> str:
        """Build Databricks job URL."""
        base = host.rstrip("/")
        return f"{base}/#job/{job_id}"

    def _pipeline_url(self, host: str, pipeline_id: str) -> str:
        """Build Databricks pipeline URL."""
        base = host.rstrip("/")
        return f"{base}/#joblist/pipelines/{pipeline_id}"

    def deploy(
        self,
        pipeline_id: str,
        job_name: str,
        cluster_config: dict[str, Any],
        schedule: str | None,
        code: str,
        code_target: Literal["sdp", "sss"],
        pipeline_name: str = "pipeline",
        catalog: str | None = None,
        schema: str | None = None,
    ) -> dict[str, str]:
        """
        Deploy pipeline code to Databricks.

        For SDP: creates DLT pipeline. For SSS: creates Job with notebook task.
        Creates notebook in workspace first, then creates/updates pipeline or job.
        """
        if not self._config.is_configured:
            return self._deploy_mock(job_name)

        w = self._get_client()
        suffix = "sdp" if code_target == "sdp" else "sss"
        notebook_path = self._upload_notebook(
            w, code, pipeline_name, pipeline_id, suffix
        )

        if code_target == "sdp":
            return self._deploy_sdp(
                w, job_name, notebook_path, cluster_config, schedule, catalog, schema
            )
        return self._deploy_sss(
            w, job_name, notebook_path, cluster_config, schedule
        )

    def _deploy_sdp(
        self,
        w: WorkspaceClient,
        job_name: str,
        notebook_path: str,
        cluster_config: dict[str, Any],
        schedule: str | None,
        catalog: str | None,
        schema: str | None,
    ) -> dict[str, str]:
        """Create or update DLT pipeline for SDP code."""
        lib = pipelines.PipelineLibrary(
            notebook=pipelines.NotebookLibrary(path=notebook_path)
        )
        pipeline_clusters = self._build_pipeline_clusters(cluster_config)

        # Check for existing pipeline by name
        existing_id: str | None = None
        for p in w.pipelines.list_pipelines():
            if p.name and p.name.strip().lower() == job_name.strip().lower():
                existing_id = p.pipeline_id
                break

        update_kw: dict[str, Any] = {
            "libraries": [lib],
            "clusters": pipeline_clusters,
            "continuous": False,
        }
        if catalog:
            update_kw["catalog"] = catalog
        if schema:
            update_kw["schema"] = schema

        if existing_id:
            w.pipelines.update(
                pipeline_id=existing_id,
                name=job_name,
                **update_kw,
            )
            url = self._pipeline_url(str(w.config.host), existing_id)
            return {
                "job_id": existing_id,
                "job_url": url,
                "status": "updated",
                "deployment_type": "pipeline",
            }

        created = w.pipelines.create(
            name=job_name,
            libraries=[lib],
            clusters=pipeline_clusters,
            continuous=False,
            catalog=catalog or None,
            schema=schema or None,
        )
        url = self._pipeline_url(str(w.config.host), created.pipeline_id)
        return {
            "job_id": created.pipeline_id,
            "job_url": url,
            "status": "created",
            "deployment_type": "pipeline",
        }

    def _deploy_sss(
        self,
        w: WorkspaceClient,
        job_name: str,
        notebook_path: str,
        cluster_config: dict[str, Any],
        schedule: str | None,
    ) -> dict[str, str]:
        """Create or update Job with streaming notebook task for SSS code."""
        job_clusters = self._build_job_clusters(cluster_config)
        task = jobs.Task(
            task_key="streaming_main",
            notebook_task=jobs.NotebookTask(
                notebook_path=notebook_path,
                source=jobs.Source.WORKSPACE,
            ),
            job_cluster_key="main_cluster",
        )

        schedule_spec = (
            jobs.CronSchedule(quartz_cron_expression=schedule, timezone_id="UTC")
            if schedule
            else None
        )

        # Check for existing job by name
        existing_job: jobs.Job | None = None
        for j in w.jobs.list(name=job_name):
            existing_job = j
            break

        if existing_job and getattr(existing_job, "job_id", None):
            w.jobs.reset(
                job_id=existing_job.job_id,
                new_settings=jobs.JobSettings(
                    name=job_name,
                    tasks=[task],
                    job_clusters=job_clusters,
                    schedule=schedule_spec,
                ),
            )
            url = self._job_url(str(w.config.host), existing_job.job_id)
            return {
                "job_id": str(existing_job.job_id),
                "job_url": url,
                "status": "updated",
                "deployment_type": "job",
            }

        created = w.jobs.create(
            name=job_name,
            tasks=[task],
            job_clusters=job_clusters,
            schedule=schedule_spec,
        )
        url = self._job_url(str(w.config.host), created.job_id)
        return {
            "job_id": str(created.job_id),
            "job_url": url,
            "status": "created",
            "deployment_type": "job",
        }

    def _deploy_mock(self, job_name: str) -> dict[str, str]:
        """Mock deployment when Databricks is not configured."""
        job_id = str(uuid.uuid4())
        job_url = f"https://databricks.example.com/#job/{job_id}"
        return {
            "job_id": job_id,
            "job_url": job_url,
            "status": "created",
            "deployment_type": "mock",
        }

    def validate_connection(self) -> dict[str, Any]:
        """
        Test whether the Databricks connection is working.

        Returns dict with success, message, and optional host.
        """
        if not self._config.is_configured:
            return {
                "success": False,
                "message": "DATABRICKS_HOST is not set. Using mock mode for local development.",
                "mode": "mock",
            }
        try:
            w = self._get_client()
            _ = w.current_user.me()
            return {
                "success": True,
                "message": "Connection successful",
                "host": self._config.host,
                "mode": "databricks",
            }
        except Exception as e:
            return {
                "success": False,
                "message": str(e),
                "host": self._config.host,
                "mode": "databricks",
            }

    def list_catalogs(self) -> list[dict[str, str]]:
        """List Unity Catalog catalogs available to the user."""
        if not self._config.is_configured:
            return []
        try:
            w = self._get_client()
            return [
                {"name": c.name, "comment": getattr(c, "comment", None) or ""}
                for c in w.catalogs.list()
            ]
        except Exception:
            return []

    def list_schemas(self, catalog_name: str) -> list[dict[str, str]]:
        """List schemas in a Unity Catalog catalog."""
        if not self._config.is_configured:
            return []
        try:
            w = self._get_client()
            return [
                {
                    "name": s.name,
                    "comment": getattr(s, "comment", None) or "",
                }
                for s in w.schemas.list(catalog_name=catalog_name)
            ]
        except Exception:
            return []

    def get_job_status(self, job_id: str, deployment_type: str = "job") -> str:
        """
        Get the status of a deployed job or pipeline run.

        For jobs: returns run state. For pipelines: returns pipeline state.
        """
        if not self._config.is_configured:
            return "PENDING"
        try:
            w = self._get_client()
            if deployment_type == "pipeline":
                p = w.pipelines.get(pipeline_id=job_id)
                return getattr(p, "state", "UNKNOWN") or "UNKNOWN"
            # Job
            runs = list(w.jobs.list_runs(job_id=int(job_id), limit=1))
            if not runs:
                return "PENDING"
            return runs[0].state.life_cycle_state or "PENDING"
        except Exception:
            return "UNKNOWN"
