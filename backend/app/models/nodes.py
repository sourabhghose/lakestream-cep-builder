"""
Node type enums and metadata for the CEP pipeline builder.

Defines all 38 supported node types with their categories and code targets.
"""

from enum import Enum
from typing import TypedDict


class NodeCategory(str, Enum):
    """Category of a pipeline node."""

    SOURCE = "source"
    CEP_PATTERN = "cep_pattern"
    TRANSFORM = "transform"
    SINK = "sink"


class CodeTarget(str, Enum):
    """Code generation target for a node type."""

    SDP = "sdp"  # Lakeflow Declarative Pipelines only
    SSS = "sss"  # Spark Structured Streaming only (CEP patterns)
    SDP_OR_SSS = "sdp_or_sss"  # Can be either


class NodeMetadata(TypedDict):
    """Metadata for a node type in the registry."""

    category: NodeCategory
    code_target: CodeTarget


# All 38 node types with their category and code_target
NODE_REGISTRY: dict[str, NodeMetadata] = {
    # Sources (8)
    "kafka-topic": {"category": NodeCategory.SOURCE, "code_target": CodeTarget.SDP_OR_SSS},
    "delta-table-source": {"category": NodeCategory.SOURCE, "code_target": CodeTarget.SDP_OR_SSS},
    "auto-loader": {"category": NodeCategory.SOURCE, "code_target": CodeTarget.SDP_OR_SSS},
    "rest-webhook-source": {"category": NodeCategory.SOURCE, "code_target": CodeTarget.SDP_OR_SSS},
    "cdc-stream": {"category": NodeCategory.SOURCE, "code_target": CodeTarget.SDP_OR_SSS},
    "event-hub-kinesis": {"category": NodeCategory.SOURCE, "code_target": CodeTarget.SDP_OR_SSS},
    "mqtt": {"category": NodeCategory.SOURCE, "code_target": CodeTarget.SDP_OR_SSS},
    "custom-python-source": {"category": NodeCategory.SOURCE, "code_target": CodeTarget.SSS},
    # CEP Patterns (12)
    "sequence-detector": {"category": NodeCategory.CEP_PATTERN, "code_target": CodeTarget.SSS},
    "absence-detector": {"category": NodeCategory.CEP_PATTERN, "code_target": CodeTarget.SSS},
    "count-threshold": {"category": NodeCategory.CEP_PATTERN, "code_target": CodeTarget.SSS},
    "velocity-detector": {"category": NodeCategory.CEP_PATTERN, "code_target": CodeTarget.SSS},
    "geofence-location": {"category": NodeCategory.CEP_PATTERN, "code_target": CodeTarget.SSS},
    "temporal-correlation": {"category": NodeCategory.CEP_PATTERN, "code_target": CodeTarget.SSS},
    "trend-detector": {"category": NodeCategory.CEP_PATTERN, "code_target": CodeTarget.SSS},
    "outlier-anomaly": {"category": NodeCategory.CEP_PATTERN, "code_target": CodeTarget.SSS},
    "session-detector": {"category": NodeCategory.CEP_PATTERN, "code_target": CodeTarget.SSS},
    "deduplication": {"category": NodeCategory.CEP_PATTERN, "code_target": CodeTarget.SSS},
    "match-recognize-sql": {"category": NodeCategory.CEP_PATTERN, "code_target": CodeTarget.SSS},
    "custom-stateful-processor": {"category": NodeCategory.CEP_PATTERN, "code_target": CodeTarget.SSS},
    # Transforms (10)
    "filter": {"category": NodeCategory.TRANSFORM, "code_target": CodeTarget.SDP_OR_SSS},
    "map-select": {"category": NodeCategory.TRANSFORM, "code_target": CodeTarget.SDP_OR_SSS},
    "flatten-explode": {"category": NodeCategory.TRANSFORM, "code_target": CodeTarget.SDP_OR_SSS},
    "lookup-enrichment": {"category": NodeCategory.TRANSFORM, "code_target": CodeTarget.SDP_OR_SSS},
    "window-aggregate": {"category": NodeCategory.TRANSFORM, "code_target": CodeTarget.SDP_OR_SSS},
    "stream-stream-join": {"category": NodeCategory.TRANSFORM, "code_target": CodeTarget.SDP_OR_SSS},
    "stream-static-join": {"category": NodeCategory.TRANSFORM, "code_target": CodeTarget.SDP_OR_SSS},
    "union-merge": {"category": NodeCategory.TRANSFORM, "code_target": CodeTarget.SDP_OR_SSS},
    "rename-cast": {"category": NodeCategory.TRANSFORM, "code_target": CodeTarget.SDP_OR_SSS},
    "custom-python-udf": {"category": NodeCategory.TRANSFORM, "code_target": CodeTarget.SSS},
    # Sinks (8)
    "delta-table-sink": {"category": NodeCategory.SINK, "code_target": CodeTarget.SDP_OR_SSS},
    "kafka-topic-sink": {"category": NodeCategory.SINK, "code_target": CodeTarget.SDP_OR_SSS},
    "rest-webhook-sink": {"category": NodeCategory.SINK, "code_target": CodeTarget.SDP_OR_SSS},
    "slack-teams-pagerduty": {"category": NodeCategory.SINK, "code_target": CodeTarget.SDP_OR_SSS},
    "email-sink": {"category": NodeCategory.SINK, "code_target": CodeTarget.SDP_OR_SSS},
    "sql-warehouse-sink": {"category": NodeCategory.SINK, "code_target": CodeTarget.SDP_OR_SSS},
    "unity-catalog-table-sink": {"category": NodeCategory.SINK, "code_target": CodeTarget.SDP_OR_SSS},
    "dead-letter-queue": {"category": NodeCategory.SINK, "code_target": CodeTarget.SDP_OR_SSS},
}
