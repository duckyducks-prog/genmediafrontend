import {
  CompoundNodeDefinition,
  CompoundInput,
  CompoundOutput,
  CompoundControl,
  InputMapping,
  ControlMapping,
  OutputMapping,
  BuildCompoundInput,
} from "./types";
import { ConnectorType } from "@/components/workflow/types";

/**
 * Helper function to get a nested value from an object using a path string
 * Example: getNestedValue(node, "data.duration") returns node.data.duration
 */
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((curr, key) => curr?.[key], obj);
}

/**
 * Helper function to convert a string to a valid slug/ID
 * Example: "Script Input" -> "script_input"
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Build a complete CompoundNodeDefinition from user selections
 * This is called when the user clicks "Save" in the CompoundNodeModal
 */
export function buildCompoundDefinition(
  input: BuildCompoundInput,
): CompoundNodeDefinition {
  const {
    name,
    icon,
    description,
    nodes,
    edges,
    exposedInputs,
    exposedControls,
    exposedOutputs,
  } = input;

  // Generate unique ID
  const timestamp = Date.now();
  const slug = slugify(name);
  const id = `compound_${slug}_${timestamp}`;

  console.log("[buildCompoundDefinition] Building compound node:", {
    id,
    name,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    exposedInputCount: Object.keys(exposedInputs).length,
    exposedControlCount: Object.keys(exposedControls).length,
    exposedOutputCount: Object.keys(exposedOutputs).length,
  });

  // ========================================================================
  // BUILD INPUTS ARRAY
  // ========================================================================

  const inputs: CompoundInput[] = Object.values(exposedInputs)
    .filter(Boolean)
    .map((item) => ({
      id: slugify(item.exposedName),
      name: item.exposedName,
      type: item.type as ConnectorType,
    }));

  console.log(
    "[buildCompoundDefinition] Built inputs:",
    inputs.map((i) => i.name),
  );

  // ========================================================================
  // BUILD OUTPUTS ARRAY
  // ========================================================================

  const outputs: CompoundOutput[] = Object.values(exposedOutputs)
    .filter(Boolean)
    .map((item) => ({
      id: slugify(item.exposedName),
      name: item.exposedName,
      type: item.type as ConnectorType,
    }));

  console.log(
    "[buildCompoundDefinition] Built outputs:",
    outputs.map((o) => o.name),
  );

  // ========================================================================
  // BUILD CONTROLS ARRAY (with defaults from current node values)
  // ========================================================================

  const controls: CompoundControl[] = Object.values(exposedControls)
    .filter(Boolean)
    .map((item) => {
      const node = nodes.find((n) => n.id === item.nodeId);
      const currentValue = node ? getNestedValue(node, item.paramPath) : undefined;

      // Determine default value
      let defaultValue = currentValue;
      if (defaultValue === undefined) {
        // Fallback defaults based on control type
        if (item.controlType === "slider") {
          defaultValue = item.config?.min ?? 0;
        } else if (item.controlType === "dropdown") {
          defaultValue = item.config?.options?.[0] ?? "";
        } else if (item.controlType === "toggle") {
          defaultValue = false;
        } else {
          defaultValue = "";
        }
      }

      return {
        id: slugify(item.exposedName),
        name: item.exposedName,
        type: item.controlType as "slider" | "dropdown" | "text" | "toggle",
        ...item.config,
        default: defaultValue,
      };
    });

  console.log(
    "[buildCompoundDefinition] Built controls:",
    controls.map((c) => `${c.name} (${c.type})`),
  );

  // ========================================================================
  // BUILD MAPPINGS
  // ========================================================================

  const mappings = {
    inputs: {} as Record<string, InputMapping>,
    controls: {} as Record<string, ControlMapping[]>,
    outputs: {} as Record<string, OutputMapping>,
  };

  // Map inputs
  Object.values(exposedInputs)
    .filter(Boolean)
    .forEach((item) => {
      const exposedId = slugify(item.exposedName);
      mappings.inputs[exposedId] = {
        nodeId: item.nodeId,
        param: `data.inputs.${item.inputHandle}`,
      };
    });

  // Map controls (can map to multiple internal nodes if same control name is used)
  Object.values(exposedControls)
    .filter(Boolean)
    .forEach((item) => {
      const exposedId = slugify(item.exposedName);
      if (!mappings.controls[exposedId]) {
        mappings.controls[exposedId] = [];
      }
      mappings.controls[exposedId].push({
        nodeId: item.nodeId,
        param: item.paramPath,
      });
    });

  // Map outputs
  Object.values(exposedOutputs)
    .filter(Boolean)
    .forEach((item) => {
      const exposedId = slugify(item.exposedName);
      mappings.outputs[exposedId] = {
        nodeId: item.nodeId,
        param: `data.outputs.${item.outputHandle}`,
      };
    });

  console.log("[buildCompoundDefinition] Built mappings:", {
    inputMappings: Object.keys(mappings.inputs).length,
    controlMappings: Object.keys(mappings.controls).length,
    outputMappings: Object.keys(mappings.outputs).length,
  });

  // ========================================================================
  // DEEP CLONE INTERNAL WORKFLOW
  // ========================================================================

  // Deep clone nodes and edges to avoid mutating the original workflow
  const internalWorkflow = {
    nodes: JSON.parse(JSON.stringify(nodes)),
    edges: JSON.parse(JSON.stringify(edges)),
  };

  console.log("[buildCompoundDefinition] Cloned internal workflow:", {
    nodes: internalWorkflow.nodes.length,
    edges: internalWorkflow.edges.length,
  });

  // ========================================================================
  // BUILD FINAL DEFINITION
  // ========================================================================

  const definition: CompoundNodeDefinition = {
    id,
    type: "compound",
    name,
    icon,
    description,
    inputs,
    outputs,
    controls,
    internalWorkflow,
    mappings,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  console.log("[buildCompoundDefinition] Complete definition built:", {
    id: definition.id,
    name: definition.name,
    inputCount: definition.inputs.length,
    outputCount: definition.outputs.length,
    controlCount: definition.controls.length,
  });

  return definition;
}

/**
 * Validate a compound node definition before saving
 * Returns error message if invalid, or null if valid
 */
export function validateCompoundDefinition(
  definition: Partial<BuildCompoundInput>,
): string | null {
  if (!definition.name || definition.name.trim().length === 0) {
    return "Compound node name is required";
  }

  if (!definition.nodes || definition.nodes.length === 0) {
    return "Compound node must contain at least one node";
  }

  const outputCount = Object.keys(definition.exposedOutputs || {}).filter(
    (key) => definition.exposedOutputs![key],
  ).length;

  if (outputCount === 0) {
    return "Compound node must expose at least one output";
  }

  return null;
}
