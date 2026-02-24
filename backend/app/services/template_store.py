"""
Template persistence layer.

Supports LocalTemplateStore (JSON files in ~/.lakestream/templates/) and
LakebaseTemplateStore (saved_templates table in PostgreSQL when PGHOST is set).
Built-in templates are seeded with metadata only; canvas data lives in the frontend.
"""

import json
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Built-in template metadata (canvas_json is empty; frontend has full data)
BUILTIN_TEMPLATES = [
    {"id": "fraud-detection", "name": "Fraud Detection", "description": "Detect suspicious transaction patterns.", "industry": "FinServ"},
    {"id": "abandoned-cart", "name": "Abandoned Cart", "description": "Detect when users add items to cart but don't complete purchase.", "industry": "E-commerce"},
    {"id": "predictive-maintenance", "name": "Predictive Maintenance", "description": "Correlate temperature rise with vibration spikes.", "industry": "Manufacturing"},
    {"id": "realtime-anomaly", "name": "Real-Time Anomaly Detection", "description": "Detect metric anomalies using z-score.", "industry": "Any"},
    {"id": "user-session-analytics", "name": "User Session Analytics", "description": "Group clickstream events into sessions.", "industry": "SaaS"},
    {"id": "sla-breach-detection", "name": "SLA Breach Detection", "description": "Detect when service requests don't complete in time.", "industry": "Operations"},
    {"id": "clickstream-funnel", "name": "Clickstream Funnel", "description": "Track conversion funnel.", "industry": "Marketing"},
    {"id": "fleet-monitoring", "name": "Fleet Monitoring", "description": "Monitor vehicle GPS and geofence events.", "industry": "Logistics"},
    {"id": "security-threat-detection", "name": "Security Threat Detection", "description": "Detect brute force and credential stuffing.", "industry": "Cybersecurity"},
    {"id": "order-to-cash-tracking", "name": "Order-to-Cash Tracking", "description": "Track order lifecycle.", "industry": "Supply Chain"},
    {"id": "trucking-iot-analytics", "name": "Trucking IoT Analytics", "description": "Monitor truck fleet: join geo + speed streams, detect speeding, ML predictions.", "industry": "Transportation"},
]


class TemplateStore(ABC):
    """Abstract base class for template storage backends."""

    @abstractmethod
    def list_all(self) -> list[dict[str, Any]]:
        """List all templates (built-in + user-created)."""
        ...

    @abstractmethod
    def create(
        self,
        name: str,
        description: str,
        industry: str,
        canvas_json: dict,
        created_by: str | None = None,
    ) -> str:
        """Create a new user template. Return template ID."""
        ...

    @abstractmethod
    def delete(self, template_id: str) -> bool:
        """Delete a user template. Returns False if built-in or not found."""
        ...


class LocalTemplateStore(TemplateStore):
    """Saves template JSON files to ~/.lakestream/templates/."""

    def __init__(self, base_dir: str | Path | None = None):
        if base_dir is None:
            base_dir = Path.home() / ".lakestream" / "templates"
        self._base = Path(base_dir)
        self._base.mkdir(parents=True, exist_ok=True)

    def _path(self, template_id: str) -> Path:
        return self._base / f"{template_id}.json"

    def list_all(self) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        # Add built-in templates (metadata only, empty canvas)
        for t in BUILTIN_TEMPLATES:
            result.append({
                "id": t["id"],
                "name": t["name"],
                "description": t["description"],
                "industry": t["industry"],
                "canvas_json": {},
                "is_builtin": True,
                "created_by": None,
                "created_at": None,
            })
        # Add user templates from files
        for path in self._base.glob("*.json"):
            try:
                with open(path) as f:
                    data = json.load(f)
                result.append({
                    "id": data.get("id", path.stem),
                    "name": data.get("name", ""),
                    "description": data.get("description", ""),
                    "industry": data.get("industry", ""),
                    "canvas_json": data.get("canvas_json", {}),
                    "is_builtin": False,
                    "created_by": data.get("created_by"),
                    "created_at": data.get("created_at"),
                })
            except (json.JSONDecodeError, OSError):
                continue
        return result

    def create(
        self,
        name: str,
        description: str,
        industry: str,
        canvas_json: dict,
        created_by: str | None = None,
    ) -> str:
        template_id = str(uuid.uuid4())
        now = datetime.now(tz=timezone.utc).isoformat()
        data = {
            "id": template_id,
            "name": name,
            "description": description,
            "industry": industry,
            "canvas_json": canvas_json,
            "is_builtin": False,
            "created_by": created_by,
            "created_at": now,
        }
        path = self._path(template_id)
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
        return template_id

    def delete(self, template_id: str) -> bool:
        if any(t["id"] == template_id for t in BUILTIN_TEMPLATES):
            return False
        path = self._path(template_id)
        if not path.exists():
            return False
        path.unlink()
        return True


class LakebaseTemplateStore(TemplateStore):
    """Saves templates to Lakebase PostgreSQL (saved_templates table)."""

    def __init__(self):
        from app.db import get_pool

        self._pool = get_pool()

    def list_all(self) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        # Prepend built-in templates (id is string, canvas in frontend)
        for t in BUILTIN_TEMPLATES:
            result.append({
                "id": t["id"],
                "name": t["name"],
                "description": t["description"],
                "industry": t["industry"],
                "canvas_json": {},
                "is_builtin": True,
                "created_by": None,
                "created_at": None,
            })
        # Add user templates from DB
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, name, description, industry, canvas_json, is_builtin, created_by, created_at
                    FROM saved_templates
                    WHERE is_builtin = false
                    ORDER BY created_at DESC
                    """
                )
                rows = cur.fetchall()
        for row in rows:
            tid, name, desc, industry, canvas, is_builtin, created_by, created_at = row
            result.append({
                "id": str(tid),
                "name": name,
                "description": desc or "",
                "industry": industry or "",
                "canvas_json": canvas if isinstance(canvas, dict) else (json.loads(canvas) if canvas else {}),
                "is_builtin": bool(is_builtin),
                "created_by": created_by,
                "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else created_at,
            })
        return result

    def create(
        self,
        name: str,
        description: str,
        industry: str,
        canvas_json: dict,
        created_by: str | None = None,
    ) -> str:
        template_id = str(uuid.uuid4())
        canvas_str = json.dumps(canvas_json)
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO saved_templates
                    (id, name, description, industry, canvas_json, is_builtin, created_by, created_at)
                    VALUES (%s, %s, %s, %s, %s::jsonb, false, %s, now())
                    """,
                    (template_id, name, description, industry, canvas_str, created_by),
                )
        return template_id

    def delete(self, template_id: str) -> bool:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM saved_templates WHERE id = %s AND is_builtin = false",
                    (template_id,),
                )
                return cur.rowcount > 0


def get_template_store() -> TemplateStore:
    """Return LakebaseTemplateStore if PGHOST is set, else LocalTemplateStore."""
    if os.environ.get("PGHOST"):
        return LakebaseTemplateStore()
    return LocalTemplateStore()
