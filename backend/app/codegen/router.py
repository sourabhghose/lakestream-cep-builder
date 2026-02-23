"""
Code generation router.

Analyzes pipeline node types and dispatches to SDP or SSS generators.
"""

from app.models.nodes import CodeTarget, NODE_REGISTRY
from app.models.pipeline import CodeGenerationResponse, PipelineDefinition
from app.codegen.graph_utils import validate_graph
from app.codegen.sdp_generator import generate_sdp
from app.codegen.sss_generator import generate_sss


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

    return CodeGenerationResponse(
        sdp_code=sdp_code,
        sss_code=sss_code,
        code_target=code_target,
        warnings=warnings,
    )
