"""
Pipeline persistence layer.

Supports LocalFileStore (local dev), DatabricksVolumeStore (Unity Catalog volumes),
and LakebaseStore (Lakebase PostgreSQL when PGHOST is set).
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


def _history_base() -> Path:
    """Base directory for pipeline version history (local dev only)."""
    return Path.home() / ".lakestream" / "pipeline_history"


class LocalFileStore(PipelineStore):
    """Saves pipeline JSON files to a local directory (e.g., ~/.lakestream/pipelines/)."""

    def __init__(self, base_dir: str | Path | None = None):
        if base_dir is None:
            base_dir = Path.home() / ".lakestream" / "pipelines"
        self._base = Path(base_dir)
        self._base.mkdir(parents=True, exist_ok=True)

    def _path(self, pipeline_id: str) -> Path:
        return self._base / f"{pipeline_id}.json"

    def _history_dir(self, pipeline_id: str) -> Path:
        return _history_base() / pipeline_id

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
        # Save previous version to history before updating
        history_dir = self._history_dir(pipeline_id)
        history_dir.mkdir(parents=True, exist_ok=True)
        history_file = history_dir / f"{existing.version}.json"
        with open(history_file, "w") as f:
            json.dump(
                {
                    "version": existing.version,
                    "saved_at": existing.updated_at.isoformat(),
                    "canvas_json": existing.model_dump(mode="json"),
                    "name": existing.name,
                },
                f,
                indent=2,
            )
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

    def get_versions(self, pipeline_id: str) -> list[dict]:
        """Return list of saved version snapshots for local dev. Each item: version, saved_at, canvas_json, name."""
        history_dir = self._history_dir(pipeline_id)
        if not history_dir.exists():
            return []
        versions = []
        for f in history_dir.glob("*.json"):
            try:
                v = int(f.stem)
            except ValueError:
                continue
            with open(f) as fp:
                data = json.load(fp)
            versions.append(
                {
                    "version": data.get("version", v),
                    "saved_at": data.get("saved_at", ""),
                    "canvas_json": data.get("canvas_json", {}),
                    "name": data.get("name", ""),
                }
            )
        versions.sort(key=lambda x: x["version"])
        return versions


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

    def get_versions(self, pipeline_id: str) -> list[dict]:
        """Return list of saved version snapshots. For Databricks volume, returns empty."""
        return []


class LakebaseStore(PipelineStore):
    """Saves pipelines to Lakebase PostgreSQL (Databricks serverless PostgreSQL)."""

    def __init__(self):
        from app.db import get_pool

        self._pool = get_pool()

    def save(self, pipeline: PipelineDefinition) -> str:
        pipeline_id = _ensure_pipeline_id(pipeline)
        pipeline = _ensure_timestamps(pipeline, is_update=False)
        pipeline = pipeline.model_copy(update={"id": pipeline_id})
        canvas_json = json.dumps(pipeline.model_dump(mode="json"))
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO pipelines (
                        id, name, description, canvas_json, version, status,
                        created_at, updated_at, created_by
                    ) VALUES (
                        %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s
                    )
                    """,
                    (
                        pipeline_id,
                        pipeline.name,
                        pipeline.description or "",
                        canvas_json,
                        pipeline.version,
                        pipeline.status,
                        pipeline.created_at,
                        pipeline.updated_at,
                        pipeline.created_by,
                    ),
                )
        return pipeline_id

    def get(self, pipeline_id: str) -> PipelineDefinition | None:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT canvas_json, version, status, created_at, updated_at "
                    "FROM pipelines WHERE id = %s",
                    (pipeline_id,),
                )
                row = cur.fetchone()
        if not row:
            return None
        canvas_json, version, status, created_at, updated_at = row
        data = canvas_json if isinstance(canvas_json, dict) else json.loads(canvas_json)
        data["id"] = pipeline_id
        data["version"] = version
        data["status"] = status
        data["created_at"] = (
            created_at.isoformat() if hasattr(created_at, "isoformat") else created_at
        )
        data["updated_at"] = (
            updated_at.isoformat() if hasattr(updated_at, "isoformat") else updated_at
        )
        return PipelineDefinition.model_validate(data)

    def list_all(self) -> list[PipelineSummary]:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, name, description, updated_at,
                           jsonb_array_length(COALESCE(canvas_json->'nodes', '[]'::jsonb)) AS node_count,
                           jsonb_array_length(COALESCE(canvas_json->'edges', '[]'::jsonb)) AS edge_count
                    FROM pipelines
                    ORDER BY updated_at DESC
                    """
                )
                rows = cur.fetchall()
        return [
            PipelineSummary(
                id=str(row[0]),
                name=row[1],
                description=row[2] or "",
                updated_at=row[3],
                node_count=row[4] or 0,
                edge_count=row[5] or 0,
            )
            for row in rows
        ]

    def delete(self, pipeline_id: str) -> bool:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM pipelines WHERE id = %s", (pipeline_id,))
                return cur.rowcount > 0

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
        canvas_json = json.dumps(pipeline.model_dump(mode="json"))
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE pipelines SET
                        name = %s, description = %s, canvas_json = %s::jsonb,
                        version = %s, updated_at = %s
                    WHERE id = %s
                    """,
                    (
                        pipeline.name,
                        pipeline.description or "",
                        canvas_json,
                        pipeline.version,
                        pipeline.updated_at,
                        pipeline_id,
                    ),
                )
        return pipeline

    def get_versions(self, pipeline_id: str) -> list[dict]:
        """Return list of saved version snapshots. For Lakebase, returns empty (rely on deploy_history)."""
        return []


def get_pipeline_store() -> PipelineStore:
    """Return LakebaseStore if Lakebase is available, otherwise LocalFileStore."""
    from app.db import is_postgres_available
    if is_postgres_available():
        return LakebaseStore()
    return LocalFileStore()
