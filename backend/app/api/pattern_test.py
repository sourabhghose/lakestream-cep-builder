"""
Pattern testing API router.

Simulates pattern matching against sample events and returns matches
plus event flow (which events reached which nodes).
"""

import json
import os
import re
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
import httpx
from pydantic import BaseModel, Field

from app.codegen.graph_utils import get_upstream_nodes, topological_sort
from app.models.pipeline import PipelineEdge, PipelineNode
from app.services.pattern_explainability import (
    get_pattern_test_run,
    list_pattern_test_runs,
    record_pattern_test_run,
)

router = APIRouter()
logger = logging.getLogger(__name__)

CEP_PATTERN_TYPES = {
    "sequence-detector", "absence-detector", "count-threshold", "velocity-detector",
    "geofence-location", "temporal-correlation", "trend-detector", "outlier-anomaly",
    "session-detector", "deduplication", "match-recognize-sql", "custom-stateful-processor",
}


class PatternTestRequest(BaseModel):
    """Request body for pattern test endpoint."""

    pipeline: dict[str, Any] = Field(
        ...,
        description="Pipeline definition with nodes and edges",
    )
    events: list[dict[str, Any]] = Field(
        ...,
        description="Sample events to test against (each with timestamp, event_type, etc.)",
    )


class PatternMatch(BaseModel):
    """A single pattern match result."""

    pattern_node_id: str = Field(..., description="ID of the pattern node")
    pattern_name: str = Field(..., description="Display name of the pattern")
    matched_events: list[int] = Field(..., description="Indices of matched events")
    match_time: str = Field(..., description="Timestamp when match completed")
    details: str = Field(..., description="Human-readable match description")
    matched_event_payloads: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Subset of matched event payloads for explainability",
    )
    timeline: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Timeline of matched events with timestamps",
    )
    state_snapshot: dict[str, Any] = Field(
        default_factory=dict,
        description="Pattern-specific state snapshot at trigger time",
    )


class EventFlowEntry(BaseModel):
    """Which nodes an event reached."""

    event_index: int = Field(..., description="Index of the event")
    reached_nodes: list[str] = Field(..., description="Node IDs this event reached")


class PatternTestResponse(BaseModel):
    """Response from pattern test endpoint."""

    matches: list[PatternMatch] = Field(default_factory=list, description="Pattern matches")
    event_flow: list[EventFlowEntry] = Field(..., description="Per-event node reachability")
    total_events: int = Field(..., description="Number of events tested")
    total_matches: int = Field(..., description="Number of matches found")
    run_id: str | None = Field(
        default=None,
        description="Persisted run identifier for explainability history",
    )


class PatternTestRunSummary(BaseModel):
    """Summary for stored pattern test run history."""

    id: str
    pipeline_id: str | None
    total_events: int
    total_matches: int
    created_at: str


class PatternTestRunDetail(BaseModel):
    """Detailed stored pattern test run."""

    id: str
    pipeline_id: str | None
    total_events: int
    total_matches: int
    matches: list[dict[str, Any]]
    event_flow: list[dict[str, Any]]
    run_context: dict[str, Any] | None = None
    created_at: str


class NLPatternGenerateRequest(BaseModel):
    """Request body for natural language CEP pattern generation."""

    prompt: str = Field(
        ...,
        min_length=5,
        description="Natural language description of the CEP pattern intent",
    )
    preferred_model: str = Field(
        default="sonnet",
        description="Preferred model endpoint family: sonnet or opus",
    )


class NLPatternSuggestion(BaseModel):
    """Suggested CEP pattern node based on NL prompt."""

    node_type: str = Field(..., description="CEP node type identifier")
    label: str = Field(..., description="Suggested node label")
    config: dict[str, Any] = Field(
        default_factory=dict, description="Suggested node configuration"
    )
    reasoning: str = Field(default="", description="Brief reasoning for selected config")
    model_used: str | None = Field(
        default=None, description="Databricks endpoint used for generation"
    )


class NLPatternGenerateResponse(BaseModel):
    """Response for NL pattern generation."""

    suggestion: NLPatternSuggestion
    warnings: list[str] = Field(default_factory=list)
    fallback_used: bool = Field(default=False)


def _parse_duration(config_val: Any) -> timedelta:
    """Parse duration from config (value + unit) to timedelta."""
    if isinstance(config_val, (int, float)):
        return timedelta(seconds=float(config_val))
    if isinstance(config_val, dict):
        val = config_val.get("value", 5)
        unit = (config_val.get("unit") or "minutes").lower()
        if unit in ("second", "seconds", "sec"):
            return timedelta(seconds=float(val))
        if unit in ("minute", "minutes", "min"):
            return timedelta(minutes=float(val))
        if unit in ("hour", "hours", "hr"):
            return timedelta(hours=float(val))
        return timedelta(minutes=float(val))
    if isinstance(config_val, str):
        m = re.match(r"(\d+)\s*(s|sec|m|min|h|hr)?", str(config_val).strip(), re.I)
        if m:
            num = float(m.group(1))
            u = (m.group(2) or "m").lower()
            if u in ("s", "sec"):
                return timedelta(seconds=num)
            if u in ("m", "min"):
                return timedelta(minutes=num)
            if u in ("h", "hr"):
                return timedelta(hours=num)
            return timedelta(minutes=num)
    return timedelta(minutes=5)


def _get_ts(ev: dict, idx: int) -> datetime:
    """Extract timestamp from event. Fallback to index-based fake ts."""
    ts = ev.get("timestamp") or ev.get("event_time") or ev.get("ts")
    if ts is None:
        base = datetime(2024, 1, 1, 0, 0, 0)
        return base + timedelta(seconds=idx)
    if isinstance(ts, (int, float)):
        return datetime.utcfromtimestamp(ts / 1000.0 if ts > 1e12 else ts)
    if isinstance(ts, str):
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            pass
    base = datetime(2024, 1, 1, 0, 0, 0)
    return base + timedelta(seconds=idx)


def _eval_filter(ev: dict, filter_expr: str) -> bool:
    """Best-effort evaluation of a filter expression against an event dict."""
    if not filter_expr or not filter_expr.strip():
        return True
    expr = filter_expr.strip().lower()
    ev_lower = {k.lower(): v for k, v in ev.items()}
    ev_upper = {k: v for k, v in ev.items()}

    # event_type = 'X' or event_type = "X"
    m = re.search(r"(\w+)\s*=\s*['\"]([^'\"]*)['\"]", filter_expr, re.I)
    if m:
        col, val = m.group(1).strip(), m.group(2)
        col_lower = col.lower()
        for k, v in ev_upper.items():
            if k.lower() == col_lower:
                return str(v) == val
        return False

    # amount > 100, amount < 500
    for op in (">", "<", ">=", "<=", "==", "!="):
        if op in filter_expr:
            parts = filter_expr.split(op, 1)
            if len(parts) == 2:
                col = parts[0].strip().split()[-1] if parts[0] else ""
                col_lower = col.lower()
                rest = parts[1].strip()
                num_match = re.search(r"-?\d+\.?\d*", rest)
                threshold = float(num_match.group()) if num_match else 0
                for k, v in ev_upper.items():
                    if k.lower() == col_lower and isinstance(v, (int, float)):
                        if op == ">":
                            return v > threshold
                        if op == "<":
                            return v < threshold
                        if op == ">=":
                            return v >= threshold
                        if op == "<=":
                            return v <= threshold
                        if op == "==":
                            return v == threshold
                        if op == "!=":
                            return v != threshold
                return False

    return True


def _match_sequence(
    events: list[dict],
    steps: list[dict],
    within: timedelta,
    node_id: str,
    pattern_name: str,
) -> list[tuple[list[int], str]]:
    """Check for sequence matches. Returns list of (matched_indices, details)."""
    results: list[tuple[list[int], str]] = []
    if not steps or not events:
        return results

    step_filters = []
    for s in steps:
        f = s.get("filter", "") if isinstance(s, dict) else ""
        step_filters.append(f)

    n = len(events)
    for i in range(n):
        matched: list[int] = []
        step_idx = 0
        start_ts = _get_ts(events[i], i)
        for j in range(i, n):
            ev = events[j]
            ts = _get_ts(ev, j)
            if (ts - start_ts) > within:
                break
            if step_idx < len(step_filters) and _eval_filter(ev, step_filters[step_idx]):
                matched.append(j)
                step_idx += 1
                if step_idx >= len(step_filters):
                    step_names = [s.get("name", f"step{k}") for k, s in enumerate(steps) if isinstance(s, dict)]
                    details = "Matched sequence: " + " → ".join(step_names) + f" within {within}"
                    results.append((list(matched), details))
                    break
    return results


def _match_count_threshold(
    events: list[dict],
    event_filter: str,
    threshold: int,
    window: timedelta,
    node_id: str,
    pattern_name: str,
) -> list[tuple[list[int], str]]:
    """Count events matching filter in sliding window; emit when >= threshold."""
    results: list[tuple[list[int], str]] = []
    n = len(events)
    for i in range(n):
        start_ts = _get_ts(events[i], i)
        matched: list[int] = []
        for j in range(i, n):
            ev = events[j]
            ts = _get_ts(ev, j)
            if (ts - start_ts) > window:
                break
            if _eval_filter(ev, event_filter):
                matched.append(j)
                if len(matched) >= threshold:
                    results.append((matched, f"Count reached {len(matched)} (threshold {threshold}) within window"))
                    break
    return results


def _match_absence(
    events: list[dict],
    trigger_filter: str,
    expected_filter: str,
    timeout: timedelta,
    node_id: str,
    pattern_name: str,
) -> list[tuple[list[int], str]]:
    """Detect when expected event is missing after trigger."""
    results: list[tuple[list[int], str]] = []
    n = len(events)
    for i in range(n):
        if not _eval_filter(events[i], trigger_filter):
            continue
        trigger_ts = _get_ts(events[i], i)
        found_expected = False
        for j in range(i + 1, n):
            ev = events[j]
            ts = _get_ts(ev, j)
            if (ts - trigger_ts) > timeout:
                break
            if _eval_filter(ev, expected_filter):
                found_expected = True
                break
        if not found_expected:
            # Check if we have events after trigger within timeout
            for j in range(i + 1, n):
                ts = _get_ts(events[j], j)
                if (ts - trigger_ts) > timeout:
                    results.append(([i], "Expected event absent within timeout"))
                    break
            else:
                if n > i + 1:
                    results.append(([i], "Expected event absent within timeout"))
    return results


def _match_velocity(
    events: list[dict],
    event_filter: str,
    rate_threshold: float,
    rate_unit: str,
    window: timedelta,
    node_id: str,
    pattern_name: str,
) -> list[tuple[list[int], str]]:
    """Count events per time unit; emit when rate exceeds threshold."""
    results: list[tuple[list[int], str]] = []
    unit_seconds = 60.0 if "min" in (rate_unit or "").lower() else 3600.0 if "hour" in (rate_unit or "").lower() else 1.0
    n = len(events)
    for i in range(n):
        start_ts = _get_ts(events[i], i)
        matched: list[int] = []
        for j in range(i, n):
            ev = events[j]
            ts = _get_ts(ev, j)
            if (ts - start_ts) > window:
                break
            if _eval_filter(ev, event_filter):
                matched.append(j)
        if matched:
            window_sec = window.total_seconds()
            rate = len(matched) / (window_sec / unit_seconds) if window_sec > 0 else 0
            if rate >= rate_threshold:
                results.append((matched, f"Rate {rate:.1f} per unit (threshold {rate_threshold})"))
    return results


def _match_temporal_correlation(
    events: list[dict],
    stream_a_filter: str,
    stream_b_filter: str,
    max_gap: timedelta,
    node_id: str,
    pattern_name: str,
) -> list[tuple[list[int], str]]:
    """Check if events from both streams occur within time window."""
    results: list[tuple[list[int], str]] = []
    a_indices = [i for i, e in enumerate(events) if _eval_filter(e, stream_a_filter)]
    b_indices = [i for i, e in enumerate(events) if _eval_filter(e, stream_b_filter)]
    for ai in a_indices:
        ta = _get_ts(events[ai], ai)
        for bi in b_indices:
            tb = _get_ts(events[bi], bi)
            if abs((ta - tb).total_seconds()) <= max_gap.total_seconds():
                results.append(([ai, bi], "Events from both streams within time window"))
                break
    return results


def _match_deduplication(
    events: list[dict],
    key_fields: list[str],
    node_id: str,
    pattern_name: str,
) -> list[tuple[list[int], str]]:
    """Flag duplicate events by key (first is kept, rest are duplicates)."""
    results: list[tuple[list[int], str]] = []
    seen: dict[tuple, int] = {}
    keys = key_fields if isinstance(key_fields, list) else [key_fields] if key_fields else ["id"]
    for i, ev in enumerate(events):
        key_parts = []
        for k in keys:
            v = ev.get(k) if isinstance(k, str) else ev.get(str(k))
            key_parts.append((k, v))
        key = tuple((k, v) for k, v in key_parts)
        if key in seen:
            results.append(([seen[key], i], "Duplicate event by key"))
        else:
            seen[key] = i
    return results


def _build_pattern_match(
    node_id: str,
    node_type: str,
    pattern_name: str,
    config: dict[str, Any],
    events: list[dict[str, Any]],
    matched_idx: list[int],
    details: str,
) -> PatternMatch:
    last_ts = _get_ts(events[matched_idx[-1]], matched_idx[-1]) if matched_idx else None
    match_time = last_ts.isoformat() if last_ts else ""
    payloads, timeline, snapshot = _build_match_explainability(
        events, matched_idx, node_type, config
    )
    return PatternMatch(
        pattern_node_id=node_id,
        pattern_name=pattern_name,
        matched_events=matched_idx,
        match_time=match_time,
        details=details,
        matched_event_payloads=payloads,
        timeline=timeline,
        state_snapshot=snapshot,
    )


def _match_pattern(
    node_id: str,
    node_type: str,
    pattern_name: str,
    config: dict,
    events: list[dict],
) -> list[PatternMatch]:
    """Run pattern matching for a single CEP pattern node."""
    matches: list[PatternMatch] = []

    if node_type == "sequence-detector":
        steps_raw = config.get("steps", [])
        if isinstance(steps_raw, str):
            try:
                steps_raw = json.loads(steps_raw) if steps_raw else []
            except json.JSONDecodeError:
                steps_raw = []
        steps = steps_raw if isinstance(steps_raw, list) else []
        within = _parse_duration(config.get("withinDuration", {"value": 5, "unit": "minutes"}))
        for matched_idx, details in _match_sequence(events, steps, within, node_id, pattern_name):
            matches.append(
                _build_pattern_match(
                    node_id, node_type, pattern_name, config, events, matched_idx, details
                )
            )

    elif node_type == "count-threshold":
        event_filter = config.get("eventFilter", "true")
        threshold = int(config.get("thresholdCount", 10))
        window = _parse_duration(config.get("windowDuration", {"value": 5, "unit": "minutes"}))
        for matched_idx, details in _match_count_threshold(
            events, event_filter, threshold, window, node_id, pattern_name
        ):
            matches.append(
                _build_pattern_match(
                    node_id, node_type, pattern_name, config, events, matched_idx, details
                )
            )

    elif node_type == "absence-detector":
        trigger_filter = config.get("triggerEventFilter", "true")
        expected_filter = config.get("expectedEventFilter", "false")
        timeout = _parse_duration(config.get("timeoutDuration", {"value": 5, "unit": "minutes"}))
        for matched_idx, details in _match_absence(
            events, trigger_filter, expected_filter, timeout, node_id, pattern_name
        ):
            matches.append(
                _build_pattern_match(
                    node_id, node_type, pattern_name, config, events, matched_idx, details
                )
            )

    elif node_type == "velocity-detector":
        event_filter = config.get("eventFilter", "true")
        rate_threshold = float(config.get("rateThreshold", 100))
        rate_unit = config.get("rateUnit", "per_min")
        window = _parse_duration(config.get("windowDuration", {"value": 1, "unit": "minutes"}))
        for matched_idx, details in _match_velocity(
            events, event_filter, rate_threshold, rate_unit, window, node_id, pattern_name
        ):
            matches.append(
                _build_pattern_match(
                    node_id, node_type, pattern_name, config, events, matched_idx, details
                )
            )

    elif node_type == "temporal-correlation":
        stream_a = config.get("streamAFilter", "true")
        stream_b = config.get("streamBFilter", "true")
        max_gap = _parse_duration(config.get("maxTimeGap", {"value": 5, "unit": "minutes"}))
        for matched_idx, details in _match_temporal_correlation(
            events, stream_a, stream_b, max_gap, node_id, pattern_name
        ):
            matches.append(
                _build_pattern_match(
                    node_id, node_type, pattern_name, config, events, matched_idx, details
                )
            )

    elif node_type == "deduplication":
        key_fields = config.get("dedupKeyFields", [])
        if isinstance(key_fields, str):
            key_fields = [key_fields] if key_fields else []
        for matched_idx, details in _match_deduplication(events, key_fields, node_id, pattern_name):
            matches.append(
                _build_pattern_match(
                    node_id, node_type, pattern_name, config, events, matched_idx, details
                )
            )

    else:
        # Simplified matching for other patterns (geofence, trend, outlier, session, etc.)
        matches.append(
            _build_pattern_match(
                node_id,
                node_type,
                pattern_name,
                config,
                events,
                [],
                f"Pattern {pattern_name} (simplified matching not implemented for {node_type})",
            )
        )

    return matches


def _compute_event_flow(
    nodes: list[PipelineNode],
    edges: list[PipelineEdge],
    events: list[dict],
    matches: list[PatternMatch],
) -> list[EventFlowEntry]:
    """Compute which events reach which nodes by simulating flow in topological order."""
    node_by_id = {n.id: n for n in nodes}
    order = topological_sort(nodes, edges)
    source_ids = {nid for nid in order if node_by_id.get(nid) and _is_source(node_by_id[nid].type)}
    if not source_ids:
        source_ids = {order[0]} if order else set()

    # Pattern nodes that emitted (matched) by event index - sink gets data only when pattern emits
    pattern_emitted_by_event: dict[int, set[str]] = {}
    for m in matches:
        if m.matched_events:
            last_ev = max(m.matched_events)
            pattern_emitted_by_event.setdefault(last_ev, set()).add(m.pattern_node_id)

    pattern_node_ids = {n.id for n in nodes if n.type in CEP_PATTERN_TYPES}

    event_flow: list[EventFlowEntry] = []
    for ev_idx in range(len(events)):
        emitted_patterns: set[str] = set()
        for i in range(ev_idx + 1):
            emitted_patterns.update(pattern_emitted_by_event.get(i, set()))

        reached: set[str] = set()
        for nid in order:
            upstream = get_upstream_nodes(nid, edges)
            if not upstream:
                if nid in source_ids:
                    reached.add(nid)
            else:
                # Sinks downstream of pattern: only reached when pattern has emitted
                if nid not in pattern_node_ids and nid not in source_ids:
                    pattern_upstreams = [u for u in upstream if u in pattern_node_ids]
                    if pattern_upstreams:
                        if any(p in emitted_patterns for p in pattern_upstreams):
                            reached.add(nid)
                        continue
                if any(u in reached for u in upstream):
                    reached.add(nid)
        event_flow.append(EventFlowEntry(event_index=ev_idx, reached_nodes=sorted(reached)))
    return event_flow


def _is_source(node_type: str) -> bool:
    sources = {
        "kafka-topic", "delta-table-source", "auto-loader", "rest-webhook-source",
        "cdc-stream", "event-hub-kinesis", "mqtt", "custom-python-source",
    }
    return node_type in sources


def _get_pattern_label(node: dict) -> str:
    return node.get("label") or _pattern_type_label(node.get("type", ""))


def _pattern_type_label(t: str) -> str:
    labels = {
        "sequence-detector": "Sequence Detector",
        "absence-detector": "Absence Detector",
        "count-threshold": "Count Threshold",
        "velocity-detector": "Velocity Detector",
        "temporal-correlation": "Temporal Correlation",
        "deduplication": "Deduplication",
        "geofence-location": "Geofence",
        "trend-detector": "Trend Detector",
        "outlier-anomaly": "Outlier",
        "session-detector": "Session Detector",
        "match-recognize-sql": "MATCH_RECOGNIZE",
        "custom-stateful-processor": "Custom Processor",
    }
    return labels.get(t, t.replace("-", " ").title())


def _default_pattern_config(node_type: str) -> dict[str, Any]:
    if node_type == "sequence-detector":
        return {
            "steps": [
                {"name": "step1", "filter": "event_type = 'A'"},
                {"name": "step2", "filter": "event_type = 'B'"},
            ],
            "contiguityMode": "strict",
            "withinDuration": {"value": 5, "unit": "minutes"},
            "timeoutAction": "ignore",
        }
    if node_type == "absence-detector":
        return {
            "triggerEventFilter": "event_type = 'heartbeat'",
            "expectedEventFilter": "event_type = 'heartbeat'",
            "timeoutDuration": {"value": 5, "unit": "minutes"},
            "withinDuration": {"value": 10, "unit": "minutes"},
        }
    if node_type == "count-threshold":
        return {
            "eventFilter": "event_type = 'login_attempt'",
            "thresholdCount": 10,
            "windowDuration": {"value": 5, "unit": "minutes"},
        }
    if node_type == "velocity-detector":
        return {
            "eventFilter": "event_type = 'api_call'",
            "rateThreshold": 100,
            "rateUnit": "per_min",
            "windowDuration": {"value": 1, "unit": "minutes"},
        }
    if node_type == "temporal-correlation":
        return {
            "streamAFilter": "event_type = 'A'",
            "streamBFilter": "event_type = 'B'",
            "maxTimeGap": {"value": 5, "unit": "minutes"},
        }
    return {}


def _extract_json_from_text(text: str) -> dict[str, Any] | None:
    """Extract JSON object from plain text or markdown code fences."""
    if not text:
        return None
    stripped = text.strip()
    # Try direct JSON parse first.
    try:
        parsed = json.loads(stripped)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    # Try fenced code block.
    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", stripped, re.I)
    if fenced:
        try:
            parsed = json.loads(fenced.group(1))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    # Best-effort first object extraction.
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end > start:
        try:
            parsed = json.loads(stripped[start : end + 1])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return None
    return None


def _sanitize_expression(value: Any, default_value: str = "true") -> str:
    """Allow a constrained expression subset suitable for demo/test evaluation."""
    if not isinstance(value, str):
        return default_value
    expr = value.strip()
    if not expr:
        return default_value
    if len(expr) > 200:
        expr = expr[:200]
    # Block obvious SQL/comment injection patterns.
    if ";" in expr or "--" in expr or "/*" in expr or "*/" in expr:
        return default_value
    # Conservative character allowlist.
    if not re.fullmatch(r"[\w\s\.\'\"\=\<\>\!\(\)\-\+\*\/\:\,%]+", expr):
        return default_value
    return expr


def _sanitize_duration(value: Any, default_value: dict[str, Any]) -> dict[str, Any]:
    """Normalize duration object and clamp to safe bounds."""
    duration = value if isinstance(value, dict) else default_value
    raw_num = duration.get("value", default_value.get("value", 5))
    try:
        num = float(raw_num)
    except (TypeError, ValueError):
        num = float(default_value.get("value", 5))
    # Clamp for safety and UX sanity.
    num = max(1.0, min(num, 10080.0))  # up to 7 days
    unit = str(duration.get("unit", default_value.get("unit", "minutes"))).lower()
    if unit not in ("seconds", "minutes", "hours"):
        if unit in ("sec", "second", "s"):
            unit = "seconds"
        elif unit in ("min", "minute", "m"):
            unit = "minutes"
        elif unit in ("hr", "hour", "h"):
            unit = "hours"
        else:
            unit = str(default_value.get("unit", "minutes"))
    # Keep integer when possible for cleaner config.
    out_num: int | float = int(num) if float(num).is_integer() else round(num, 2)
    return {"value": out_num, "unit": unit}


def _sanitize_steps(value: Any) -> list[dict[str, str]]:
    steps_raw: list[Any] = []
    if isinstance(value, list):
        steps_raw = value
    elif isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                steps_raw = parsed
        except json.JSONDecodeError:
            steps_raw = []
    sanitized: list[dict[str, str]] = []
    for i, step in enumerate(steps_raw[:8]):  # cap step count
        if not isinstance(step, dict):
            continue
        name = str(step.get("name") or f"step{i + 1}").strip()[:40]
        name = re.sub(r"[^\w\-\s]", "", name).strip() or f"step{i + 1}"
        filter_expr = _sanitize_expression(step.get("filter"), "true")
        sanitized.append({"name": name, "filter": filter_expr})
    return sanitized


def _sanitize_label(label: Any, fallback: str) -> str:
    if not isinstance(label, str):
        return fallback
    cleaned = re.sub(r"[^\w\s\-\(\)\/]", "", label).strip()
    return (cleaned or fallback)[:80]


def _sanitize_reasoning(reasoning: Any) -> str:
    if not isinstance(reasoning, str):
        return ""
    cleaned = " ".join(reasoning.strip().split())
    return cleaned[:240]


def _sanitize_suggestion_config(node_type: str, config: dict[str, Any]) -> dict[str, Any]:
    """Filter and sanitize config keys per supported node type."""
    cfg = {**_default_pattern_config(node_type), **(config or {})}
    if node_type == "sequence-detector":
        mode = str(cfg.get("contiguityMode", "strict")).strip().lower()
        if mode not in ("strict", "relaxed", "non-deterministic"):
            mode = "strict"
        timeout_action = str(cfg.get("timeoutAction", "ignore")).strip().lower()
        if timeout_action not in ("ignore", "emit"):
            timeout_action = "ignore"
        return {
            "steps": _sanitize_steps(cfg.get("steps")),
            "contiguityMode": mode,
            "withinDuration": _sanitize_duration(
                cfg.get("withinDuration"), {"value": 5, "unit": "minutes"}
            ),
            "timeoutAction": timeout_action,
        }
    if node_type == "absence-detector":
        return {
            "triggerEventFilter": _sanitize_expression(
                cfg.get("triggerEventFilter"), "event_type = 'heartbeat'"
            ),
            "expectedEventFilter": _sanitize_expression(
                cfg.get("expectedEventFilter"), "event_type = 'heartbeat'"
            ),
            "timeoutDuration": _sanitize_duration(
                cfg.get("timeoutDuration"), {"value": 5, "unit": "minutes"}
            ),
            "withinDuration": _sanitize_duration(
                cfg.get("withinDuration"), {"value": 10, "unit": "minutes"}
            ),
        }
    if node_type == "count-threshold":
        try:
            threshold = int(cfg.get("thresholdCount", 10))
        except (TypeError, ValueError):
            threshold = 10
        threshold = max(1, min(threshold, 100000))
        return {
            "eventFilter": _sanitize_expression(
                cfg.get("eventFilter"), "event_type = 'login_attempt'"
            ),
            "thresholdCount": threshold,
            "windowDuration": _sanitize_duration(
                cfg.get("windowDuration"), {"value": 5, "unit": "minutes"}
            ),
        }
    if node_type == "velocity-detector":
        try:
            rate_threshold = float(cfg.get("rateThreshold", 100))
        except (TypeError, ValueError):
            rate_threshold = 100.0
        rate_threshold = max(1.0, min(rate_threshold, 1000000.0))
        rate_unit = str(cfg.get("rateUnit", "per_min")).strip().lower()
        if rate_unit not in ("per_sec", "per_min", "per_hour"):
            rate_unit = "per_min"
        return {
            "eventFilter": _sanitize_expression(
                cfg.get("eventFilter"), "event_type = 'api_call'"
            ),
            "rateThreshold": int(rate_threshold)
            if float(rate_threshold).is_integer()
            else round(rate_threshold, 2),
            "rateUnit": rate_unit,
            "windowDuration": _sanitize_duration(
                cfg.get("windowDuration"), {"value": 1, "unit": "minutes"}
            ),
        }
    if node_type == "temporal-correlation":
        correlation_key = cfg.get("correlationKey", "user_id")
        correlation_key_clean = (
            re.sub(r"[^\w\.]", "", str(correlation_key)).strip()[:64] or "user_id"
        )
        return {
            "streamAFilter": _sanitize_expression(
                cfg.get("streamAFilter"), "event_type = 'A'"
            ),
            "streamBFilter": _sanitize_expression(
                cfg.get("streamBFilter"), "event_type = 'B'"
            ),
            "correlationKey": correlation_key_clean,
            "maxTimeGap": _sanitize_duration(
                cfg.get("maxTimeGap"), {"value": 5, "unit": "minutes"}
            ),
        }
    return _default_pattern_config(node_type)


def _build_match_explainability(
    events: list[dict[str, Any]],
    matched_idx: list[int],
    node_type: str,
    config: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    safe_idx = [i for i in matched_idx if 0 <= i < len(events)]
    payloads: list[dict[str, Any]] = []
    timeline: list[dict[str, Any]] = []
    for i in safe_idx[:8]:
        ev = events[i]
        payloads.append(ev if isinstance(ev, dict) else {"value": str(ev)})
        timeline.append(
            {
                "event_index": i,
                "timestamp": _get_ts(events[i], i).isoformat(),
                "event_type": str(ev.get("event_type", "")) if isinstance(ev, dict) else "",
            }
        )
    snapshot: dict[str, Any] = {
        "node_type": node_type,
        "matched_count": len(safe_idx),
    }
    if node_type == "sequence-detector":
        steps = config.get("steps", [])
        snapshot.update(
            {
                "expected_steps": len(steps) if isinstance(steps, list) else 0,
                "matched_steps": len(safe_idx),
                "contiguity_mode": config.get("contiguityMode", "strict"),
                "within_duration": config.get("withinDuration", {"value": 5, "unit": "minutes"}),
            }
        )
    elif node_type == "count-threshold":
        snapshot.update(
            {
                "threshold_count": config.get("thresholdCount", 10),
                "window_duration": config.get("windowDuration", {"value": 5, "unit": "minutes"}),
            }
        )
    elif node_type == "absence-detector":
        snapshot.update(
            {
                "trigger_filter": config.get("triggerEventFilter", "true"),
                "expected_filter": config.get("expectedEventFilter", "false"),
                "timeout_duration": config.get("timeoutDuration", {"value": 5, "unit": "minutes"}),
                "expected_seen": False,
            }
        )
    elif node_type == "velocity-detector":
        snapshot.update(
            {
                "rate_threshold": config.get("rateThreshold", 100),
                "rate_unit": config.get("rateUnit", "per_min"),
                "window_duration": config.get("windowDuration", {"value": 1, "unit": "minutes"}),
            }
        )
    elif node_type == "temporal-correlation":
        snapshot.update(
            {
                "correlation_key": config.get("correlationKey", "user_id"),
                "max_time_gap": config.get("maxTimeGap", {"value": 5, "unit": "minutes"}),
            }
        )
    return payloads, timeline, snapshot


def _extract_text_from_databricks_response(data: Any) -> str:
    """Normalize Databricks serving responses to text payload."""
    if isinstance(data, dict):
        choices = data.get("choices")
        if isinstance(choices, list) and choices:
            c0 = choices[0]
            if isinstance(c0, dict):
                message = c0.get("message")
                if isinstance(message, dict) and isinstance(message.get("content"), str):
                    return message["content"]
                if isinstance(c0.get("text"), str):
                    return c0["text"]
        if isinstance(data.get("output_text"), str):
            return data["output_text"]
        predictions = data.get("predictions")
        if isinstance(predictions, list) and predictions:
            p0 = predictions[0]
            if isinstance(p0, str):
                return p0
            if isinstance(p0, dict):
                for key in ("content", "text", "output_text", "response"):
                    if isinstance(p0.get(key), str):
                        return p0[key]
    return ""


def _select_llm_endpoint(preferred_model: str) -> str | None:
    preferred = (preferred_model or "sonnet").strip().lower()
    sonnet_endpoint = os.getenv("DATABRICKS_LLM_SONNET_ENDPOINT", "").strip()
    opus_endpoint = os.getenv("DATABRICKS_LLM_OPUS_ENDPOINT", "").strip()
    generic_endpoint = os.getenv("DATABRICKS_LLM_ENDPOINT", "").strip()
    if preferred == "opus":
        return opus_endpoint or sonnet_endpoint or generic_endpoint or None
    return sonnet_endpoint or opus_endpoint or generic_endpoint or None


def _databricks_llm_generate(prompt: str, preferred_model: str) -> tuple[dict[str, Any] | None, list[str], str | None]:
    """
    Query Databricks model serving endpoint for CEP node suggestion.

    Returns (parsed_json_or_none, warnings, endpoint_used).
    """
    host = (os.getenv("DATABRICKS_HOST") or "").rstrip("/")
    token = os.getenv("DATABRICKS_TOKEN") or ""
    endpoint = _select_llm_endpoint(preferred_model)
    if not host or not token or not endpoint:
        return None, [
            "Databricks LLM endpoint not configured; using heuristic fallback. Set DATABRICKS_LLM_SONNET_ENDPOINT or DATABRICKS_LLM_OPUS_ENDPOINT."
        ], None

    system_prompt = (
        "You are a CEP pattern compiler for Databricks LakeStream. "
        "Output JSON only with keys: node_type, label, config, reasoning. "
        "Allowed node_type values: sequence-detector, absence-detector, count-threshold, velocity-detector, temporal-correlation. "
        "Config keys must match LakeStream schema exactly. Use practical defaults when user intent is incomplete."
    )
    user_prompt = (
        f"Translate this natural language CEP requirement into one node config:\n{prompt}\n\n"
        "Return valid JSON object only."
    )
    payload = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.1,
        "max_tokens": 700,
    }
    url = f"{host}/serving-endpoints/{endpoint}/invocations"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=25.0) as client:
            response = client.post(url, headers=headers, json=payload)
        if response.status_code >= 400:
            return None, [
                f"Databricks endpoint returned {response.status_code}; using heuristic fallback."
            ], endpoint
        data = response.json()
        text = _extract_text_from_databricks_response(data)
        parsed = _extract_json_from_text(text)
        if not parsed:
            return None, [
                "LLM response could not be parsed as JSON; using heuristic fallback."
            ], endpoint
        return parsed, [], endpoint
    except Exception as e:
        return None, [f"LLM request failed ({e}); using heuristic fallback."], endpoint


def _heuristic_pattern(prompt: str) -> NLPatternSuggestion:
    """Heuristic fallback when LLM endpoint is unavailable/unparseable."""
    p = prompt.lower()
    # Priority order: temporal, absence, sequence, velocity, count.
    if ("within" in p and "between" in p) or ("correlat" in p):
        node_type = "temporal-correlation"
        config = _default_pattern_config(node_type)
    elif "absence" in p or "missing" in p or "not received" in p or "no " in p:
        node_type = "absence-detector"
        config = _default_pattern_config(node_type)
    elif "sequence" in p or "followed by" in p or "consecutive" in p or "then" in p:
        node_type = "sequence-detector"
        config = _default_pattern_config(node_type)
    elif "per minute" in p or "per second" in p or "rate" in p or "velocity" in p:
        node_type = "velocity-detector"
        config = _default_pattern_config(node_type)
    else:
        node_type = "count-threshold"
        config = _default_pattern_config(node_type)

    # Extract first numeric threshold when relevant.
    num_match = re.search(r"\b(\d+)\b", p)
    if num_match:
        n = int(num_match.group(1))
        if node_type == "count-threshold":
            config["thresholdCount"] = max(1, n)
        if node_type == "velocity-detector":
            config["rateThreshold"] = max(1, n)

    return NLPatternSuggestion(
        node_type=node_type,
        label=_pattern_type_label(node_type),
        config=_sanitize_suggestion_config(node_type, config),
        reasoning="Generated with local heuristic fallback based on detected keywords.",
        model_used=None,
    )


def _sanitize_suggestion(data: dict[str, Any], endpoint_used: str | None) -> NLPatternSuggestion:
    allowed = {
        "sequence-detector",
        "absence-detector",
        "count-threshold",
        "velocity-detector",
        "temporal-correlation",
    }
    node_type = str(data.get("node_type") or "").strip()
    if node_type not in allowed:
        raise ValueError(
            "Suggested node_type is unsupported. Allowed: sequence-detector, absence-detector, count-threshold, velocity-detector, temporal-correlation"
        )
    raw_config = data.get("config")
    config = raw_config if isinstance(raw_config, dict) else {}
    merged_config = _sanitize_suggestion_config(node_type, config)
    label = _sanitize_label(data.get("label"), _pattern_type_label(node_type))
    reasoning = _sanitize_reasoning(data.get("reasoning"))
    return NLPatternSuggestion(
        node_type=node_type,
        label=label,
        config=merged_config,
        reasoning=reasoning,
        model_used=endpoint_used,
    )


def _audit_nl_generation(
    request: NLPatternGenerateRequest,
    suggestion: NLPatternSuggestion,
    fallback_used: bool,
    warnings: list[str],
    endpoint_used: str | None,
) -> None:
    """Emit structured audit log for NL generation requests."""
    prompt_hash = hashlib.sha256(request.prompt.encode("utf-8")).hexdigest()[:16]
    log_payload = {
        "event": "nl_pattern_generation",
        "prompt_hash": prompt_hash,
        "prompt_length": len(request.prompt),
        "preferred_model": request.preferred_model,
        "endpoint_used": endpoint_used,
        "fallback_used": fallback_used,
        "warning_count": len(warnings),
        "suggested_node_type": suggestion.node_type,
    }
    logger.info("nl_generation_audit %s", json.dumps(log_payload, sort_keys=True))


def _safe_ip_from_context(ctx: dict[str, Any] | None) -> str | None:
    if not ctx:
        return None
    client = ctx.get("client")
    if isinstance(client, dict):
        host = client.get("host")
        if isinstance(host, str):
            return host
    return None


@router.post("/test", response_model=PatternTestResponse)
async def pattern_test(request: PatternTestRequest) -> PatternTestResponse:
    """
    Test pattern matching against sample events.

    Simulates CEP pattern matching for sequence, count threshold, absence,
    velocity, temporal correlation, deduplication, and others.
    Returns matches and event flow (which events reached which nodes).
    """
    pipeline = request.pipeline
    events = request.events

    nodes_raw = pipeline.get("nodes", [])
    edges_raw = pipeline.get("edges", [])

    nodes = [
        PipelineNode(
            id=n.get("id", ""),
            type=n.get("type", "map-select"),
            position=n.get("position", {"x": 0, "y": 0}),
            config=n.get("config", {}),
            label=n.get("label"),
        )
        for n in nodes_raw
        if n.get("id") and n.get("type") != "group"
    ]
    edges = [
        PipelineEdge(
            id=e.get("id", f"{e.get('source')}-{e.get('target')}"),
            source=e["source"],
            target=e["target"],
            sourceHandle=e.get("sourceHandle"),
            targetHandle=e.get("targetHandle"),
        )
        for e in edges_raw
        if e.get("source") and e.get("target")
    ]

    try:
        order = topological_sort(nodes, edges)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    all_matches: list[PatternMatch] = []
    for node_id in order:
        node = next((n for n in nodes if n.id == node_id), None)
        if not node or node.type not in CEP_PATTERN_TYPES:
            continue
        node_dict = next((n for n in nodes_raw if n.get("id") == node_id), {})
        pattern_name = _get_pattern_label(node_dict)
        matches = _match_pattern(
            node_id, node.type, pattern_name, node.config, events
        )
        all_matches.extend(matches)

    event_flow = _compute_event_flow(nodes, edges, events, all_matches)

    run_id: str | None = None
    try:
        pipeline_id = pipeline.get("id")
        pipeline_id_str = str(pipeline_id).strip() if pipeline_id else None
        if pipeline_id_str == "":
            pipeline_id_str = None
        run_context = {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "pattern_node_count": len([n for n in nodes if n.type in CEP_PATTERN_TYPES]),
        }
        run_id = record_pattern_test_run(
            pipeline_id=pipeline_id_str,
            total_events=len(events),
            total_matches=len(all_matches),
            matches=[m.model_dump() for m in all_matches],
            event_flow=[e.model_dump() for e in event_flow],
            run_context=run_context,
        )
    except Exception as e:
        logger.warning("Failed to persist pattern test explainability history: %s", e)

    return PatternTestResponse(
        matches=all_matches,
        event_flow=event_flow,
        total_events=len(events),
        total_matches=len(all_matches),
        run_id=run_id,
    )


@router.post("/nl-generate", response_model=NLPatternGenerateResponse)
async def generate_pattern_from_nl(
    request: NLPatternGenerateRequest,
) -> NLPatternGenerateResponse:
    """
    Generate CEP pattern node suggestion from natural language.

    Attempts Databricks model serving endpoint (Sonnet/Opus) first, then falls back
    to a deterministic heuristic mapper.
    """
    preferred_model = (request.preferred_model or "sonnet").strip().lower()
    if preferred_model not in ("sonnet", "opus"):
        raise HTTPException(
            status_code=400,
            detail="preferred_model must be either 'sonnet' or 'opus'",
        )

    warnings: list[str] = []
    parsed, llm_warnings, endpoint_used = _databricks_llm_generate(
        request.prompt, preferred_model
    )
    warnings.extend(llm_warnings)
    if parsed:
        try:
            suggestion = _sanitize_suggestion(parsed, endpoint_used)
            response = NLPatternGenerateResponse(
                suggestion=suggestion,
                warnings=warnings,
                fallback_used=False,
            )
            _audit_nl_generation(
                request=request,
                suggestion=suggestion,
                fallback_used=False,
                warnings=warnings,
                endpoint_used=endpoint_used,
            )
            return response
        except ValueError as e:
            warnings.append(f"LLM suggestion invalid ({e}); using heuristic fallback.")

    suggestion = _heuristic_pattern(request.prompt)
    response = NLPatternGenerateResponse(
        suggestion=suggestion,
        warnings=warnings,
        fallback_used=True,
    )
    _audit_nl_generation(
        request=request,
        suggestion=suggestion,
        fallback_used=True,
        warnings=warnings,
        endpoint_used=endpoint_used,
    )
    return response


@router.get("/history", response_model=list[PatternTestRunSummary])
async def list_pattern_test_history(
    pipeline_id: str | None = None,
    limit: int = 20,
) -> list[PatternTestRunSummary]:
    """
    List persisted pattern test explainability runs.

    Optional filtering by pipeline_id; defaults to latest 20 runs.
    """
    safe_limit = max(1, min(limit, 100))
    records = list_pattern_test_runs(pipeline_id=pipeline_id, limit=safe_limit)
    return [
        PatternTestRunSummary(
            id=r.id,
            pipeline_id=r.pipeline_id,
            total_events=r.total_events,
            total_matches=r.total_matches,
            created_at=r.created_at.isoformat(),
        )
        for r in records
    ]


@router.get("/history/{run_id}", response_model=PatternTestRunDetail)
async def get_pattern_test_history_run(run_id: str) -> PatternTestRunDetail:
    """Fetch full explainability payload for a persisted run."""
    record = get_pattern_test_run(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Pattern test run not found")
    return PatternTestRunDetail(
        id=record.id,
        pipeline_id=record.pipeline_id,
        total_events=record.total_events,
        total_matches=record.total_matches,
        matches=record.matches,
        event_flow=record.event_flow,
        run_context=record.run_context,
        created_at=record.created_at.isoformat(),
    )
