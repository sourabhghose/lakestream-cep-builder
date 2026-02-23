import type { Node } from "@xyflow/react";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";
import type { NodeType, ConfigField } from "@/types/nodes";

function isFieldVisible(
  field: ConfigField,
  config: Record<string, unknown>
): boolean {
  const dep = field.dependsOn;
  if (!dep) return true;
  const actualValue = config[dep.field];
  if (dep.values !== undefined) {
    return Array.isArray(dep.values) && dep.values.includes(actualValue);
  }
  return actualValue === dep.value;
}

/**
 * Returns true if the node has configuration errors (missing required fields).
 */
export function hasNodeConfigError(node: Node): boolean {
  const nodeType = node.data?.type as NodeType | undefined;
  if (!nodeType) return false;

  const def = NODE_REGISTRY[nodeType];
  if (!def?.configFields) return false;

  const config = (node.data?.config ?? {}) as Record<string, unknown>;
  const allFields = [
    ...(def.configFields ?? []),
    ...(def.advancedFields ?? []),
  ];

  for (const f of allFields) {
    if (!f.required) continue;
    if (!isFieldVisible(f, config)) continue;
    const v = config[f.key];
    const empty =
      v === undefined ||
      v === null ||
      v === "" ||
      (Array.isArray(v) && v.length === 0);
    if (empty) return true;
  }
  return false;
}
