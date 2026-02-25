"""
Pattern explainability history service.

Persists pattern test runs (matches + event flow + explainability payloads)
to Lakebase PostgreSQL when available, with local JSON fallback in dev mode.
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
class PatternTestRunRecord:
    """Stored record for one pattern test execution."""

    id: str
    pipeline_id: str | None
    total_events: int
    total_matches: int
    matches: list[dict[str, Any]]
    event_flow: list[dict[str, Any]]
    run_context: dict[str, Any] | None
    created_at: datetime


class LocalFilePatternExplainabilityStore:
    """Local JSON file store for pattern explainability history."""

    def __init__(self, base_dir: Path | str) -> None:
        self._base = Path(base_dir)
        self._base.mkdir(parents=True, exist_ok=True)

    def _path(self, run_id: str) -> Path:
        safe_id = "".join(c if c.isalnum() or c in "-_" else "_" for c in run_id)
        return self._base / f"{safe_id}.json"

    def _record_to_dict(self, r: PatternTestRunRecord) -> dict[str, Any]:
        return {
            "id": r.id,
            "pipeline_id": r.pipeline_id,
            "total_events": r.total_events,
            "total_matches": r.total_matches,
            "matches": r.matches,
            "event_flow": r.event_flow,
            "run_context": r.run_context,
            "created_at": r.created_at.isoformat(),
        }

    def _dict_to_record(self, d: dict[str, Any]) -> PatternTestRunRecord:
        created_at_raw = d.get("created_at")
        created_at = (
            datetime.fromisoformat(created_at_raw.replace("Z", "+00:00"))
            if isinstance(created_at_raw, str)
            else datetime.now(tz=timezone.utc)
        )
        return PatternTestRunRecord(
            id=str(d.get("id", "")),
            pipeline_id=d.get("pipeline_id"),
            total_events=int(d.get("total_events", 0)),
            total_matches=int(d.get("total_matches", 0)),
            matches=d.get("matches") if isinstance(d.get("matches"), list) else [],
            event_flow=d.get("event_flow")
            if isinstance(d.get("event_flow"), list)
            else [],
            run_context=d.get("run_context")
            if isinstance(d.get("run_context"), dict)
            else None,
            created_at=created_at,
        )

    def record_run(
        self,
        pipeline_id: str | None,
        total_events: int,
        total_matches: int,
        matches: list[dict[str, Any]],
        event_flow: list[dict[str, Any]],
        run_context: dict[str, Any] | None = None,
    ) -> str:
        run_id = str(uuid.uuid4())
        record = PatternTestRunRecord(
            id=run_id,
            pipeline_id=pipeline_id,
            total_events=total_events,
            total_matches=total_matches,
            matches=matches,
            event_flow=event_flow,
            run_context=run_context,
            created_at=datetime.now(tz=timezone.utc),
        )
        self._path(run_id).write_text(json.dumps(self._record_to_dict(record), indent=2))
        return run_id

    def list_runs(
        self, pipeline_id: str | None = None, limit: int = 20
    ) -> list[PatternTestRunRecord]:
        runs: list[PatternTestRunRecord] = []
        for path in self._base.glob("*.json"):
            try:
                data = json.loads(path.read_text())
                record = self._dict_to_record(data)
                if pipeline_id and record.pipeline_id != pipeline_id:
                    continue
                runs.append(record)
            except (json.JSONDecodeError, KeyError, ValueError):
                continue
        runs.sort(key=lambda r: r.created_at, reverse=True)
        return runs[:limit]

    def get_run(self, run_id: str) -> PatternTestRunRecord | None:
        path = self._path(run_id)
        if not path.exists():
            return None
        try:
            return self._dict_to_record(json.loads(path.read_text()))
        except (json.JSONDecodeError, KeyError, ValueError):
            return None


def _get_local_store(base_dir: Path | None = None) -> LocalFilePatternExplainabilityStore:
    if base_dir is None:
        base_dir = Path.home() / ".lakestream" / "pattern_test_history"
    return LocalFilePatternExplainabilityStore(base_dir)


def record_pattern_test_run(
    pipeline_id: str | None,
    total_events: int,
    total_matches: int,
    matches: list[dict[str, Any]],
    event_flow: list[dict[str, Any]],
    run_context: dict[str, Any] | None = None,
) -> str:
    """Persist one pattern test run and return run ID."""
    if not is_postgres_available():
        return _get_local_store().record_run(
            pipeline_id=pipeline_id,
            total_events=total_events,
            total_matches=total_matches,
            matches=matches,
            event_flow=event_flow,
            run_context=run_context,
        )

    pool = get_pool()
    run_id = str(uuid.uuid4())
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pattern_test_history (
                    id, pipeline_id, total_events, total_matches,
                    matches_json, event_flow_json, run_context
                ) VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb)
                """,
                (
                    run_id,
                    pipeline_id,
                    total_events,
                    total_matches,
                    json.dumps(matches),
                    json.dumps(event_flow),
                    json.dumps(run_context) if run_context else None,
                ),
            )
    return run_id


def list_pattern_test_runs(
    pipeline_id: str | None = None, limit: int = 20
) -> list[PatternTestRunRecord]:
    """List pattern test run history."""
    if not is_postgres_available():
        return _get_local_store().list_runs(pipeline_id=pipeline_id, limit=limit)

    pool = get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if pipeline_id:
                cur.execute(
                    """
                    SELECT id, pipeline_id, total_events, total_matches,
                           matches_json, event_flow_json, run_context, created_at
                    FROM pattern_test_history
                    WHERE pipeline_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (pipeline_id, limit),
                )
            else:
                cur.execute(
                    """
                    SELECT id, pipeline_id, total_events, total_matches,
                           matches_json, event_flow_json, run_context, created_at
                    FROM pattern_test_history
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
            rows = cur.fetchall()

    records: list[PatternTestRunRecord] = []
    for row in rows:
        matches = row[4] if isinstance(row[4], list) else (json.loads(row[4]) if row[4] else [])
        event_flow = row[5] if isinstance(row[5], list) else (json.loads(row[5]) if row[5] else [])
        run_context = row[6] if isinstance(row[6], dict) else (json.loads(row[6]) if row[6] else None)
        records.append(
            PatternTestRunRecord(
                id=str(row[0]),
                pipeline_id=row[1],
                total_events=int(row[2]),
                total_matches=int(row[3]),
                matches=matches,
                event_flow=event_flow,
                run_context=run_context,
                created_at=row[7],
            )
        )
    return records


def get_pattern_test_run(run_id: str) -> PatternTestRunRecord | None:
    """Get one run by ID."""
    if not is_postgres_available():
        return _get_local_store().get_run(run_id)

    pool = get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, pipeline_id, total_events, total_matches,
                       matches_json, event_flow_json, run_context, created_at
                FROM pattern_test_history
                WHERE id = %s
                """,
                (run_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    matches = row[4] if isinstance(row[4], list) else (json.loads(row[4]) if row[4] else [])
    event_flow = row[5] if isinstance(row[5], list) else (json.loads(row[5]) if row[5] else [])
    run_context = row[6] if isinstance(row[6], dict) else (json.loads(row[6]) if row[6] else None)
    return PatternTestRunRecord(
        id=str(row[0]),
        pipeline_id=row[1],
        total_events=int(row[2]),
        total_matches=int(row[3]),
        matches=matches,
        event_flow=event_flow,
        run_context=run_context,
        created_at=row[7],
    )
