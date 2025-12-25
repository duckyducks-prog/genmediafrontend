import { Node, Edge } from "reactflow";
import { NODE_CONFIGURATIONS, NodeType } from "@/components/workflow/types";
import {
  WorkflowAnalysis,
  AvailableInput,
  AvailableControl,
  AvailableOutput,
} from "./types";
import { getExposableParams } from "./exposableParams";

/**
 * Helper function to get a nested value from an object using a path string
 * Example: getNestedValue(node, "data.duration") returns node.data.duration
 */
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((curr, key) => curr?.[key], obj);
}

/**
 * Analyze a workflow to find all items that can be exposed when creating a compound node
 * Returns available inputs, controls, and outputs that the user can choose from
 */
export function analyzeWorkflow(
  nodes: Node[],
  edges: Edge[],
): WorkflowAnalysis {
  const availableInputs: AvailableInput[] = [];
  const availableControls: AvailableControl[] = [];
  const availableOutputs: AvailableOutput[] = [];

  // Build a set of connected inputs for quick lookup
  const connectedInputs = new Set<string>(
    edges.map((e) => `${e.target}-${e.targetHandle || "default"}`),
  );

  // Analyze each node
  for (const node of nodes) {
    const nodeType = node.type as NodeType;
    const config = NODE_CONFIGURATIONS[nodeType];

    // Skip if we don't have a configuration for this node type
    if (!config) {
      console.warn(
        `[analyzeWorkflow] No configuration found for node type: ${nodeType}`,
      );
      continue;
    }

    const nodeName = node.data?.label || config.label || nodeType;

    // ========================================================================
    // ANALYZE INPUTS
    // Two types of inputs can be exposed:
    // 1. Input nodes (Prompt, ImageInput, VideoInput) - where users provide data
    // 2. Unconnected input handles on other nodes - optional parameters
    // ========================================================================

    // Check if this is an Input node type
    const isInputNode =
      nodeType === NodeType.Prompt ||
      nodeType === NodeType.ImageInput ||
      nodeType === NodeType.VideoInput;

    if (isInputNode) {
      // For Input nodes, expose the node itself (not its output connectors)
      // The user will fill in the data for this node
      let inputType: "text" | "image" | "video" = "text";
      let paramPath = "data.promptText"; // default for Prompt

      if (nodeType === NodeType.ImageInput) {
        inputType = "image";
        paramPath = "data.imageUrl";
      } else if (nodeType === NodeType.VideoInput) {
        inputType = "video";
        paramPath = "data.videoUrl";
      }

      availableInputs.push({
        id: `${node.id}-input`,
        nodeId: node.id,
        nodeName,
        inputHandle: "input", // Not used for input nodes
        inputName: nodeName,
        type: inputType,
        isConnected: false, // Input nodes don't have incoming connections
        suggestedName: nodeName,
        paramPath, // Add the path to inject the value
      });
    }

    // Also check for unconnected input handles on other nodes
    // These are optional parameters users can provide (e.g., GenVideo.first_frame)
    if (!isInputNode && config.inputConnectors) {
      for (const input of config.inputConnectors) {
        const inputKey = `${node.id}-${input.id}`;
        const isConnected = connectedInputs.has(inputKey);

        // Only expose unconnected inputs (connected ones already have data)
        if (!isConnected) {
          availableInputs.push({
            id: inputKey,
            nodeId: node.id,
            nodeName,
            inputHandle: input.id,
            inputName: input.label || input.id,
            type: input.type,
            isConnected: false,
            suggestedName: `${nodeName} ${input.label || input.id}`,
            paramPath: `data.inputs.${input.id}`, // Standard path for input handles
          });
        }
      }
    }

    // ========================================================================
    // ANALYZE CONTROLS (Exposable Parameters)
    // ========================================================================

    const exposableParams = getExposableParams(nodeType);

    for (const param of exposableParams) {
      const currentValue = getNestedValue(node, param.path);

      availableControls.push({
        id: `${node.id}-${param.path}`,
        nodeId: node.id,
        nodeName,
        paramPath: param.path,
        paramName: param.name,
        currentValue,
        suggestedControlType: param.controlType,
        config: param.config || {},
        suggestedName: `${nodeName} ${param.name}`,
      });
    }

    // ========================================================================
    // ANALYZE OUTPUTS
    // ========================================================================

    for (const output of config.outputConnectors || []) {
      availableOutputs.push({
        id: `${node.id}-${output.id}`,
        nodeId: node.id,
        nodeName,
        outputHandle: output.id,
        outputName: output.label || output.id,
        type: output.type,
        suggestedName: `${nodeName} ${output.label || output.id}`,
      });
    }
  }

  console.log("[analyzeWorkflow] Analysis complete:", {
    totalNodes: nodes.length,
    availableInputs: availableInputs.length,
    availableControls: availableControls.length,
    availableOutputs: availableOutputs.length,
    unconnectedInputs: availableInputs.filter((i) => !i.isConnected).length,
  });

  return {
    availableInputs,
    availableControls,
    availableOutputs,
  };
}

/**
 * Helper to filter available inputs to only show unconnected ones
 * (These are often the best candidates for exposing)
 */
export function getUnconnectedInputs(
  analysis: WorkflowAnalysis,
): AvailableInput[] {
  return analysis.availableInputs.filter((input) => !input.isConnected);
}

/**
 * Helper to group available items by node
 * Useful for displaying items organized by which node they come from
 */
export function groupByNode<T extends { nodeId: string; nodeName: string }>(
  items: T[],
): Record<string, { nodeName: string; items: T[] }> {
  const grouped: Record<string, { nodeName: string; items: T[] }> = {};

  for (const item of items) {
    if (!grouped[item.nodeId]) {
      grouped[item.nodeId] = {
        nodeName: item.nodeName,
        items: [],
      };
    }
    grouped[item.nodeId].items.push(item);
  }

  return grouped;
}
