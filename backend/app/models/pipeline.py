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


class DeployRequest(BaseModel):
    """Request body for deploying a pipeline to Databricks."""

    pipeline_id: str = Field(..., description="Pipeline to deploy")
    job_name: str = Field(..., min_length=1, description="Databricks job name")
    cluster_config: dict[str, Any] = Field(
        default_factory=dict,
        description="Cluster configuration (instance type, workers, etc.)",
    )
    schedule: str | None = Field(
        default=None,
        description="Cron schedule expression (e.g., '0 0 * * *' for daily)",
    )


class DeployResponse(BaseModel):
    """Response from deployment endpoint."""

    job_id: str = Field(..., description="Databricks job ID")
    job_url: str = Field(..., description="URL to the Databricks job")
    status: str = Field(..., description="Deployment status")
