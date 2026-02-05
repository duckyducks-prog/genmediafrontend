import { logger } from "@/lib/logger";
import { Node, Edge } from "reactflow";

/**
 * Execution result returned by compound node execution
 */
interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Helper function to set a nested value in an object using a path string
 * Example: setNestedValue(node, "data.duration", 8) sets node.data.duration = 8
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined) {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * Helper function to get a nested value from an object using a path string
 * Example: getNestedValue(node, "data.outputs.video") returns node.data.outputs.video
 */
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((curr, key) => curr?.[key], obj);
}

/**
 * Execute a compound node by running its internal workflow
 * 
 * @param compoundNode The compound node instance on the canvas
 * @param externalInputs Values from connections to the compound node's inputs
 * @param executeWorkflow Function to execute a workflow (recursive call)
 * @returns ExecutionResult with success status and output data
 */
export async function executeCompoundNode(
  compoundNode: Node,
  externalInputs: Record<string, any>,
  executeWorkflow: (nodes: Node[], edges: Edge[]) => Promise<ExecutionResult>,
): Promise<ExecutionResult> {
  const {
    internalWorkflow,
    mappings,
    controlValues = {},
  } = compoundNode.data as any;

  logger.debug("[executeCompoundNode] Starting execution:", {
    nodeId: compoundNode.id,
    name: compoundNode.data.name,
    externalInputs: Object.keys(externalInputs),
    controlValues: Object.keys(controlValues),
  });

  try {
    // ========================================================================
    // STEP 1: Deep clone internal workflow (avoid mutating the template)
    // ========================================================================

    const nodes: Node[] = JSON.parse(JSON.stringify(internalWorkflow.nodes));
    const edges: Edge[] = JSON.parse(JSON.stringify(internalWorkflow.edges));

    logger.debug("[executeCompoundNode] Cloned internal workflow:", {
      nodeCount: nodes.length,
      edgeCount: edges.length,
    });

    // ========================================================================
    // STEP 2: Inject external inputs into internal nodes
    // ========================================================================

    if (mappings.inputs) {
      for (const [exposedId, mapping] of Object.entries(mappings.inputs)) {
        const inputValue = externalInputs[exposedId];

        if (inputValue !== undefined) {
          const node = nodes.find((n) => n.id === (mapping as any).nodeId);
          if (node) {
            setNestedValue(node, (mapping as any).param, inputValue);
            logger.debug(
              `[executeCompoundNode] Injected input "${exposedId}" -> ${(mapping as any).nodeId}.${(mapping as any).param}`,
            );
          }
        }
      }
    }

    // ========================================================================
    // STEP 3: Apply control values to internal nodes
    // ========================================================================

    if (mappings.controls) {
      for (const [controlId, mappingList] of Object.entries(
        mappings.controls,
      )) {
        const value = controlValues[controlId];

        if (value !== undefined && Array.isArray(mappingList)) {
          for (const mapping of mappingList) {
            const node = nodes.find((n) => n.id === (mapping as any).nodeId);
            if (node) {
              setNestedValue(node, (mapping as any).param, value);
              logger.debug(
                `[executeCompoundNode] Applied control "${controlId}" (${value}) -> ${(mapping as any).nodeId}.${(mapping as any).param}`,
              );
            }
          }
        }
      }
    }

    // ========================================================================
    // STEP 4: Execute the internal workflow
    // ========================================================================

    logger.debug("[executeCompoundNode] Executing internal workflow...");
    const result = await executeWorkflow(nodes, edges);

    if (!result.success) {
      console.error("[executeCompoundNode] Internal workflow failed:", result.error);
      return {
        success: false,
        error: result.error || "Internal workflow execution failed",
      };
    }

    // ========================================================================
    // STEP 5: Extract outputs from internal nodes
    // ========================================================================

    const outputs: Record<string, any> = {};
    const resultNodes = result.data?.nodes || nodes;

    if (mappings.outputs) {
      for (const [exposedId, mapping] of Object.entries(mappings.outputs)) {
        const node = resultNodes.find(
          (n: Node) => n.id === (mapping as any).nodeId,
        );
        if (node) {
          const outputValue = getNestedValue(node, (mapping as any).param);
          outputs[exposedId] = outputValue;
          logger.debug(
            `[executeCompoundNode] Extracted output "${exposedId}":`,
            outputValue ? "✓" : "✗",
          );
        }
      }
    }

    logger.debug("[executeCompoundNode] Execution completed successfully:", {
      outputCount: Object.keys(outputs).length,
    });

    return {
      success: true,
      data: outputs,
    };
  } catch (error) {
    console.error("[executeCompoundNode] Execution error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown execution error",
    };
  }
}
