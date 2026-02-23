"""
Pattern testing API router.

Simulates pattern matching against sample events and returns matches
plus event flow (which events reached which nodes).
"""

import json
import re
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.codegen.graph_utils import get_upstream_nodes, topological_sort
from app.models.pipeline import PipelineEdge, PipelineNode

router = APIRouter()

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
            last_ts = _get_ts(events[matched_idx[-1]], matched_idx[-1]) if matched_idx else None
            match_time = last_ts.isoformat() if last_ts else ""
            matches.append(PatternMatch(
                pattern_node_id=node_id,
                pattern_name=pattern_name,
                matched_events=matched_idx,
                match_time=match_time,
                details=details,
            ))

    elif node_type == "count-threshold":
        event_filter = config.get("eventFilter", "true")
        threshold = int(config.get("thresholdCount", 10))
        window = _parse_duration(config.get("windowDuration", {"value": 5, "unit": "minutes"}))
        for matched_idx, details in _match_count_threshold(
            events, event_filter, threshold, window, node_id, pattern_name
        ):
            last_ts = _get_ts(events[matched_idx[-1]], matched_idx[-1]) if matched_idx else None
            match_time = last_ts.isoformat() if last_ts else ""
            matches.append(PatternMatch(
                pattern_node_id=node_id,
                pattern_name=pattern_name,
                matched_events=matched_idx,
                match_time=match_time,
                details=details,
            ))

    elif node_type == "absence-detector":
        trigger_filter = config.get("triggerEventFilter", "true")
        expected_filter = config.get("expectedEventFilter", "false")
        timeout = _parse_duration(config.get("timeoutDuration", {"value": 5, "unit": "minutes"}))
        for matched_idx, details in _match_absence(
            events, trigger_filter, expected_filter, timeout, node_id, pattern_name
        ):
            last_ts = _get_ts(events[matched_idx[-1]], matched_idx[-1]) if matched_idx else None
            match_time = last_ts.isoformat() if last_ts else ""
            matches.append(PatternMatch(
                pattern_node_id=node_id,
                pattern_name=pattern_name,
                matched_events=matched_idx,
                match_time=match_time,
                details=details,
            ))

    elif node_type == "velocity-detector":
        event_filter = config.get("eventFilter", "true")
        rate_threshold = float(config.get("rateThreshold", 100))
        rate_unit = config.get("rateUnit", "per_min")
        window = _parse_duration(config.get("windowDuration", {"value": 1, "unit": "minutes"}))
        for matched_idx, details in _match_velocity(
            events, event_filter, rate_threshold, rate_unit, window, node_id, pattern_name
        ):
            last_ts = _get_ts(events[matched_idx[-1]], matched_idx[-1]) if matched_idx else None
            match_time = last_ts.isoformat() if last_ts else ""
            matches.append(PatternMatch(
                pattern_node_id=node_id,
                pattern_name=pattern_name,
                matched_events=matched_idx,
                match_time=match_time,
                details=details,
            ))

    elif node_type == "temporal-correlation":
        stream_a = config.get("streamAFilter", "true")
        stream_b = config.get("streamBFilter", "true")
        max_gap = _parse_duration(config.get("maxTimeGap", {"value": 5, "unit": "minutes"}))
        for matched_idx, details in _match_temporal_correlation(
            events, stream_a, stream_b, max_gap, node_id, pattern_name
        ):
            last_ts = _get_ts(events[matched_idx[-1]], matched_idx[-1]) if matched_idx else None
            match_time = last_ts.isoformat() if last_ts else ""
            matches.append(PatternMatch(
                pattern_node_id=node_id,
                pattern_name=pattern_name,
                matched_events=matched_idx,
                match_time=match_time,
                details=details,
            ))

    elif node_type == "deduplication":
        key_fields = config.get("dedupKeyFields", [])
        if isinstance(key_fields, str):
            key_fields = [key_fields] if key_fields else []
        for matched_idx, details in _match_deduplication(events, key_fields, node_id, pattern_name):
            last_ts = _get_ts(events[matched_idx[-1]], matched_idx[-1]) if matched_idx else None
            match_time = last_ts.isoformat() if last_ts else ""
            matches.append(PatternMatch(
                pattern_node_id=node_id,
                pattern_name=pattern_name,
                matched_events=matched_idx,
                match_time=match_time,
                details=details,
            ))

    else:
        # Simplified matching for other patterns (geofence, trend, outlier, session, etc.)
        matches.append(PatternMatch(
            pattern_node_id=node_id,
            pattern_name=pattern_name,
            matched_events=[],
            match_time="",
            details=f"Pattern {pattern_name} (simplified matching not implemented for {node_type})",
        ))

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

    return PatternTestResponse(
        matches=all_matches,
        event_flow=event_flow,
        total_events=len(events),
        total_matches=len(all_matches),
    )
