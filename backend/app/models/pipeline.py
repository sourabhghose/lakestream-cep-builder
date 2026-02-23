"""
Pydantic models for pipeline definitions, API requests, and responses.

Supports the visual CEP pipeline graph structure with nodes and edges.
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

# Type alias for node configuration values
NodeConfig = dict[str, Any]


class PipelineNode(BaseModel):
    """A single node in the pipeline graph."""

    id: str = Field(..., description="Unique node identifier")
    type: str = Field(..., description="Node type (e.g., kafka-topic, filter)")
    position: dict[str, float] = Field(
        default_factory=lambda: {"x": 0.0, "y": 0.0},
        description="Visual position (x, y) in the canvas",
    )
    config: dict[str, Any] = Field(
        default_factory=dict,
        description="Node-specific configuration values",
    )
    label: str | None = Field(default=None, description="Display label for the node")


class PipelineEdge(BaseModel):
    """An edge connecting two nodes in the pipeline graph."""

    id: str = Field(..., description="Unique edge identifier")
    source: str = Field(..., description="Source node ID")
    target: str = Field(..., description="Target node ID")
    sourceHandle: str | None = Field(default=None, description="Source handle/port")
    targetHandle: str | None = Field(default=None, description="Target handle/port")


class PipelineSummary(BaseModel):
    """Summary of a pipeline for listing (id, name, description, updated_at, node_count, edge_count)."""

    id: str = Field(..., description="Unique pipeline identifier")
    name: str = Field(..., description="Pipeline display name")
    description: str = Field(default="", description="Pipeline description")
    updated_at: datetime = Field(
        ...,
        description="Last update timestamp",
    )
    node_count: int = Field(default=0, description="Number of nodes in the pipeline")
    edge_count: int = Field(default=0, description="Number of edges in the pipeline")


class PipelineDefinition(BaseModel):
    """Complete pipeline definition with metadata."""

    id: str = Field(..., description="Unique pipeline identifier")
    name: str = Field(..., description="Pipeline display name")
    description: str = Field(default="", description="Pipeline description")
    nodes: list[PipelineNode] = Field(default_factory=list, description="Pipeline nodes")
    edges: list[PipelineEdge] = Field(default_factory=list, description="Pipeline edges")
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Last update timestamp",
    )
    version: int = Field(default=1, description="Pipeline version")
    status: str = Field(default="draft", description="Pipeline status (draft, deployed)")
    created_by: str | None = Field(
        default=None,
        description="User email who created the pipeline",
    )


class PipelineCreateRequest(BaseModel):
    """Request body for creating a new pipeline."""

    name: str = Field(..., min_length=1, description="Pipeline name")
    description: str = Field(default="", description="Pipeline description")
    nodes: list[PipelineNode] = Field(default_factory=list, description="Pipeline nodes")
    edges: list[PipelineEdge] = Field(default_factory=list, description="Pipeline edges")


class PipelineUpdateRequest(BaseModel):
    """Request body for updating an existing pipeline. All fields optional."""

    name: str | None = Field(default=None, min_length=1, description="Pipeline name")
    description: str | None = Field(default=None, description="Pipeline description")
    nodes: list[PipelineNode] | None = Field(default=None, description="Pipeline nodes")
    edges: list[PipelineEdge] | None = Field(default=None, description="Pipeline edges")


class CodeAnnotation(BaseModel):
    """Line-level annotation linking generated code to a canvas node."""

    node_id: str = Field(..., description="Canvas node ID")
    node_label: str = Field(..., description="Display label for the node")
    start_line: int = Field(..., description="First line of the code block (1-based)")
    end_line: int = Field(..., description="Last line of the code block (1-based)")


class CodeGenerationResponse(BaseModel):
    """Response from code generation endpoint."""

    sdp_code: str | None = Field(
        default=None,
        description="Generated Lakeflow Declarative Pipeline (SDP) code",
    )
    sss_code: str | None = Field(
        default=None,
        description="Generated Spark Structured Streaming (SSS) code",
    )
    code_target: Literal["sdp", "sss", "hybrid"] = Field(
        ...,
        description="Target code type determined by pipeline analysis",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Non-fatal warnings from code generation",
    )
    sdp_annotations: list[CodeAnnotation] = Field(
        default_factory=list,
        description="Line-level annotations for SDP code (node -> line range)",
    )
    sss_annotations: list[CodeAnnotation] = Field(
        default_factory=list,
        description="Line-level annotations for SSS code (node -> line range)",
    )


class DeployRequest(BaseModel):
    """Request body for deploying a pipeline to Databricks."""

    pipeline_id: str = Field(..., description="Pipeline to deploy")
    job_name: str = Field(..., min_length=1, description="Databricks job/pipeline name")
    cluster_config: dict[str, Any] = Field(
        default_factory=dict,
        description="Cluster configuration (instance type, workers, etc.)",
    )
    schedule: str | None = Field(
        default=None,
        description="Cron schedule expression (e.g., '0 0 * * *' for daily)",
    )
    catalog: str | None = Field(
        default=None,
        description="Unity Catalog catalog for SDP pipeline target",
    )
    target_schema: str | None = Field(
        default=None,
        description="Unity Catalog schema for SDP pipeline target",
    )
    code_target: Literal["sdp", "sss"] | None = Field(
        default=None,
        description="Which code to deploy (sdp or sss). If hybrid, must be specified.",
    )


class DeployResponse(BaseModel):
    """Response from deployment endpoint."""

    job_id: str = Field(..., description="Databricks job or pipeline ID")
    job_url: str = Field(..., description="URL to the Databricks job or pipeline")
    status: str = Field(..., description="Deployment status (created, updated)")
    deployment_type: str = Field(
        default="job",
        description="Type: 'job', 'pipeline', or 'mock'",
    )


class DeployHistoryEntry(BaseModel):
    """A single deploy history entry for API response."""

    id: str = Field(..., description="Deploy record ID")
    pipeline_id: str = Field(..., description="Pipeline ID")
    pipeline_version: int = Field(..., description="Pipeline version at deploy time")
    code_target: str = Field(..., description="sdp or sss")
    databricks_job_id: str | None = Field(default=None, description="Databricks job ID (SSS)")
    databricks_pipeline_id: str | None = Field(
        default=None, description="Databricks pipeline ID (SDP)"
    )
    job_url: str | None = Field(default=None, description="URL to job or pipeline")
    deploy_status: str = Field(..., description="created, updated, failed")
    deployed_code: str | None = Field(default=None, description="Deployed code snapshot")
    cluster_config: dict[str, Any] | None = Field(default=None, description="Cluster config")
    deployed_by: str | None = Field(default=None, description="User who deployed")
    deployed_at: datetime = Field(..., description="Deploy timestamp")
    error_message: str | None = Field(default=None, description="Error if failed")
