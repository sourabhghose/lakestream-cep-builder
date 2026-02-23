"""
Pipeline persistence layer.

Supports LocalFileStore (local dev) and DatabricksVolumeStore (Unity Catalog volumes).
"""

import io
import json
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path

from app.models.pipeline import PipelineDefinition, PipelineSummary


class PipelineStore(ABC):
    """Abstract base class for pipeline storage backends."""

    @abstractmethod
    def save(self, pipeline: PipelineDefinition) -> str:
        """Save a pipeline, return its ID."""
        ...

    @abstractmethod
    def get(self, pipeline_id: str) -> PipelineDefinition | None:
        """Retrieve a pipeline by ID."""
        ...

    @abstractmethod
    def list_all(self) -> list[PipelineSummary]:
        """List all saved pipelines (id, name, updated_at, etc.)."""
        ...

    @abstractmethod
    def delete(self, pipeline_id: str) -> bool:
        """Delete a pipeline. Returns True if deleted, False if not found."""
        ...

    @abstractmethod
    def update(self, pipeline_id: str, pipeline: PipelineDefinition) -> PipelineDefinition:
        """Update an existing pipeline."""
        ...


def _ensure_pipeline_id(pipeline: PipelineDefinition) -> str:
    """Ensure pipeline has a UUID; return the ID."""
    if not pipeline.id:
        return str(uuid.uuid4())
    return pipeline.id


def _ensure_timestamps(pipeline: PipelineDefinition, is_update: bool = False) -> PipelineDefinition:
    """Ensure pipeline has created_at and updated_at timestamps."""
    now = datetime.now(tz=timezone.utc)
    updates = {"updated_at": now}
    if not is_update and not getattr(pipeline, "created_at", None):
        updates["created_at"] = now
    return pipeline.model_copy(update=updates)


def _to_summary(pipeline: PipelineDefinition) -> PipelineSummary:
    """Convert PipelineDefinition to PipelineSummary."""
    return PipelineSummary(
        id=pipeline.id,
        name=pipeline.name,
        description=pipeline.description,
        updated_at=pipeline.updated_at,
        node_count=len(pipeline.nodes),
        edge_count=len(pipeline.edges),
    )


class LocalFileStore(PipelineStore):
    """Saves pipeline JSON files to a local directory (e.g., ~/.lakestream/pipelines/)."""

    def __init__(self, base_dir: str | Path | None = None):
        if base_dir is None:
            base_dir = Path.home() / ".lakestream" / "pipelines"
        self._base = Path(base_dir)
        self._base.mkdir(parents=True, exist_ok=True)

    def _path(self, pipeline_id: str) -> Path:
        return self._base / f"{pipeline_id}.json"

    def save(self, pipeline: PipelineDefinition) -> str:
        pipeline_id = _ensure_pipeline_id(pipeline)
        pipeline = _ensure_timestamps(pipeline, is_update=False)
        pipeline = pipeline.model_copy(update={"id": pipeline_id})
        path = self._path(pipeline_id)
        with open(path, "w") as f:
            json.dump(pipeline.model_dump(mode="json"), f, indent=2)
        return pipeline_id

    def get(self, pipeline_id: str) -> PipelineDefinition | None:
        path = self._path(pipeline_id)
        if not path.exists():
            return None
        with open(path) as f:
            data = json.load(f)
        return PipelineDefinition.model_validate(data)

    def list_all(self) -> list[PipelineSummary]:
        summaries = []
        for path in self._base.glob("*.json"):
            pipeline_id = path.stem
            pipeline = self.get(pipeline_id)
            if pipeline:
                summaries.append(_to_summary(pipeline))
        summaries.sort(key=lambda s: s.updated_at, reverse=True)
        return summaries

    def delete(self, pipeline_id: str) -> bool:
        path = self._path(pipeline_id)
        if not path.exists():
            return False
        path.unlink()
        return True

    def update(self, pipeline_id: str, pipeline: PipelineDefinition) -> PipelineDefinition:
        existing = self.get(pipeline_id)
        if not existing:
            raise FileNotFoundError(f"Pipeline {pipeline_id} not found")
        pipeline = pipeline.model_copy(
            update={
                "id": pipeline_id,
                "created_at": existing.created_at,
                "updated_at": datetime.now(tz=timezone.utc),
                "version": existing.version + 1,
            }
        )
        path = self._path(pipeline_id)
        with open(path, "w") as f:
            json.dump(pipeline.model_dump(mode="json"), f, indent=2)
        return pipeline


class DatabricksVolumeStore(PipelineStore):
    """Saves pipeline JSON files to a Unity Catalog volume using the Databricks SDK Files API."""

    def __init__(
        self,
        catalog: str | None = None,
        schema: str | None = None,
        volume_name: str = "lakestream_pipelines",
    ):
        self._catalog = catalog or os.environ.get("DATABRICKS_CATALOG", "main")
        self._schema = schema or os.environ.get("DATABRICKS_SCHEMA", "main")
        self._volume_name = volume_name
        self._base_path = f"/Volumes/{self._catalog}/{self._schema}/{self._volume_name}"
        self._init_client()

    def _init_client(self) -> None:
        from databricks.sdk import WorkspaceClient

        self._client = WorkspaceClient()
        self._ensure_directory()

    def _ensure_directory(self) -> None:
        try:
            self._client.files.create_directory(self._base_path)
        except Exception:
            pass  # Directory may already exist; create_directory is idempotent per docs

    def _file_path(self, pipeline_id: str) -> str:
        return f"{self._base_path}/{pipeline_id}.json"

    def save(self, pipeline: PipelineDefinition) -> str:
        pipeline_id = _ensure_pipeline_id(pipeline)
        pipeline = _ensure_timestamps(pipeline, is_update=False)
        pipeline = pipeline.model_copy(update={"id": pipeline_id})
        content = json.dumps(pipeline.model_dump(mode="json"), indent=2).encode("utf-8")
        self._client.files.upload(
            file_path=self._file_path(pipeline_id),
            contents=io.BytesIO(content),
            overwrite=True,
        )
        return pipeline_id

    def get(self, pipeline_id: str) -> PipelineDefinition | None:
        try:
            resp = self._client.files.download(file_path=self._file_path(pipeline_id))
            if not resp.contents:
                return None
            data = json.loads(resp.contents.read().decode("utf-8"))
            return PipelineDefinition.model_validate(data)
        except Exception:
            return None

    def list_all(self) -> list[PipelineSummary]:
        summaries = []
        try:
            for entry in self._client.files.list_directory_contents(directory_path=self._base_path):
                if entry.name and entry.name.endswith(".json"):
                    pipeline_id = entry.name[:-5]
                    pipeline = self.get(pipeline_id)
                    if pipeline:
                        summaries.append(_to_summary(pipeline))
        except Exception:
            pass
        summaries.sort(key=lambda s: s.updated_at, reverse=True)
        return summaries

    def delete(self, pipeline_id: str) -> bool:
        try:
            self._client.files.delete(file_path=self._file_path(pipeline_id))
            return True
        except Exception:
            return False

    def update(self, pipeline_id: str, pipeline: PipelineDefinition) -> PipelineDefinition:
        existing = self.get(pipeline_id)
        if not existing:
            raise FileNotFoundError(f"Pipeline {pipeline_id} not found")
        pipeline = pipeline.model_copy(
            update={
                "id": pipeline_id,
                "created_at": existing.created_at,
                "updated_at": datetime.now(tz=timezone.utc),
                "version": existing.version + 1,
            }
        )
        content = json.dumps(pipeline.model_dump(mode="json"), indent=2).encode("utf-8")
        self._client.files.upload(
            file_path=self._file_path(pipeline_id),
            contents=io.BytesIO(content),
            overwrite=True,
        )
        return pipeline


def get_pipeline_store() -> PipelineStore:
    """Return DatabricksVolumeStore if DATABRICKS_HOST is set, otherwise LocalFileStore."""
    if os.environ.get("DATABRICKS_HOST"):
        return DatabricksVolumeStore()
    return LocalFileStore()
