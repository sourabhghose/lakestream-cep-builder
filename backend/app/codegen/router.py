"""
Code generation router.

Analyzes pipeline node types and dispatches to SDP or SSS generators.
"""

import re

from app.models.nodes import CodeTarget, NODE_REGISTRY
from app.models.pipeline import CodeAnnotation, CodeGenerationResponse, PipelineDefinition
from app.codegen.graph_utils import validate_graph
from app.codegen.sdp_generator import generate_sdp
from app.codegen.sss_generator import generate_sss

# Matches -- [node: id] label or # [node: id] label
_NODE_MARKER_RE = re.compile(r"^\s*(?:#|--)\s*\[node:\s*([^\]]+)\]\s*(.*)$", re.MULTILINE)


def _parse_annotations(code: str) -> list[CodeAnnotation]:
    """
    Scan generated code for [node: id] markers and build annotations with line ranges.
    """
    if not code or not code.strip():
        return []
    lines = code.splitlines()
    annotations: list[CodeAnnotation] = []
    for i, line in enumerate(lines):
        m = _NODE_MARKER_RE.match(line)
        if m:
            node_id = m.group(1).strip()
            node_label = m.group(2).strip() or node_id
            start_line = i + 1  # 1-based
            # end_line: next marker - 1, or last line
            end_line = start_line
            for j in range(i + 1, len(lines)):
                if _NODE_MARKER_RE.match(lines[j]):
                    end_line = j  # line before next marker (1-based: j)
                    break
            else:
                end_line = len(lines)
            annotations.append(
                CodeAnnotation(
                    node_id=node_id,
                    node_label=node_label,
                    start_line=start_line,
                    end_line=end_line,
                )
            )
    return annotations


def analyze_pipeline(pipeline: PipelineDefinition) -> str:
    """
    Inspect all nodes and determine code target.

    If ANY node requires SSS (code_target SSS in NODE_REGISTRY), return 'sss' or 'hybrid'.
    If all nodes are SDP-compatible, return 'sdp'.
    """
    has_sss_only = False
    has_sdp_compatible = False

    for node in pipeline.nodes:
        metadata = NODE_REGISTRY.get(node.type)
        if metadata is None:
            # Unknown node type - default to SSS for safety
            has_sss_only = True
            continue

        ct = metadata["code_target"]
        if ct == CodeTarget.SSS:
            has_sss_only = True
        elif ct in (CodeTarget.SDP, CodeTarget.SDP_OR_SSS):
            has_sdp_compatible = True

    if has_sss_only and has_sdp_compatible:
        return "hybrid"
    if has_sss_only:
        return "sss"
    return "sdp"


def generate(pipeline: PipelineDefinition) -> CodeGenerationResponse:
    """
    Generate code for the pipeline based on analysis.

    Calls appropriate generator(s) and returns CodeGenerationResponse.
    """
    # Validate graph first
    validation_errors = validate_graph(pipeline.nodes, pipeline.edges)
    if validation_errors:
        raise ValueError(f"Pipeline validation failed: {'; '.join(validation_errors)}")

    code_target = analyze_pipeline(pipeline)
    warnings: list[str] = []
    sdp_code: str | None = None
    sss_code: str | None = None

    if code_target in ("sdp", "hybrid"):
        sdp_code = generate_sdp(pipeline)
        if code_target == "hybrid":
            warnings.append("Pipeline contains both SDP and SSS nodes; SDP code may have placeholders for SSS-only nodes")

    if code_target in ("sss", "hybrid"):
        sss_code = generate_sss(pipeline)
        if code_target == "hybrid":
            warnings.append("Pipeline contains both SDP and SSS nodes; SSS code generated for full pipeline")

    sdp_annotations = _parse_annotations(sdp_code) if sdp_code else []
    sss_annotations = _parse_annotations(sss_code) if sss_code else []

    return CodeGenerationResponse(
        sdp_code=sdp_code,
        sss_code=sss_code,
        code_target=code_target,
        warnings=warnings,
        sdp_annotations=sdp_annotations,
        sss_annotations=sss_annotations,
    )
