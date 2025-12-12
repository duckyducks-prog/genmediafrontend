import { WorkflowNode, WorkflowEdge, NODE_CONFIGURATIONS, validateMutualExclusion, ConnectorType } from './types';

/**
 * Gather inputs for a node by following connections backwards
 */
export function gatherNodeInputs(
  node: WorkflowNode,
  allNodes: WorkflowNode[],
  edges: WorkflowEdge[]
): Record<string, any> {
  const inputs: Record<string, any> = {};
  const nodeConfig = NODE_CONFIGURATIONS[node.type];

  // Find all edges that connect TO this node
  const incomingEdges = edges.filter((edge) => edge.target === node.id);

  incomingEdges.forEach((edge) => {
    const sourceNode = allNodes.find((n) => n.id === edge.source);
    if (!sourceNode || !sourceNode.data.outputs) return;

    const targetHandle = edge.targetHandle || 'default';
    const sourceHandle = edge.sourceHandle || 'default';

    // Get the output value from the source node
    const outputValue = sourceNode.data.outputs[sourceHandle];

    if (outputValue !== undefined) {
      // Check if this input accepts multiple connections
      const inputConnector = nodeConfig.inputConnectors.find((c) => c.id === targetHandle);

      if (inputConnector?.acceptsMultiple) {
        // Collect multiple values into an array
        if (!inputs[targetHandle]) {
          inputs[targetHandle] = [];
        }
        inputs[targetHandle].push(outputValue);
      } else {
        // Single value
        inputs[targetHandle] = outputValue;
      }
    }
  });

  return inputs;
}

/**
 * Validate that all required inputs are connected and have values
 */
export function validateNodeInputs(
  node: WorkflowNode,
  inputs: Record<string, any>
): { valid: boolean; error?: string } {
  const nodeConfig = NODE_CONFIGURATIONS[node.type];

  for (const inputConnector of nodeConfig.inputConnectors) {
    if (inputConnector.required) {
      const value = inputs[inputConnector.id];
      
      if (value === undefined || value === null || value === '') {
        return {
          valid: false,
          error: `Required input "${inputConnector.label}" is not connected or has no value`,
        };
      }

      // For multi-input, check that array is not empty
      if (inputConnector.acceptsMultiple && Array.isArray(value) && value.length === 0) {
        return {
          valid: false,
          error: `Required input "${inputConnector.label}" needs at least one connection`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Execute prompt concatenator logic (frontend only, no API call)
 */
export function executeConcatenator(
  inputs: Record<string, any>,
  separator: 'Space' | 'Comma' | 'Newline' | 'Period'
): string {
  const separators = {
    Space: ' ',
    Comma: ', ',
    Newline: '\n',
    Period: '. ',
  };

  const sep = separators[separator];
  const prompts = [
    inputs.prompt_1,
    inputs.prompt_2,
    inputs.prompt_3,
    inputs.prompt_4,
  ].filter(Boolean);

  return prompts.join(sep);
}

/**
 * Execute format node logic (frontend only, no API call)
 */
export function executeFormat(data: any): any {
  return {
    aspect_ratio: data.aspectRatio || '16:9',
    duration_seconds: data.durationSeconds || 8,
    generate_audio: data.generateAudio ?? true,
    resolution: data.resolution || '1080p',
  };
}

/**
 * Group nodes by execution level for parallel execution
 * Level 0: nodes with no dependencies
 * Level N: nodes whose all dependencies are in levels < N
 */
export function groupNodesByLevel(
  executionOrder: string[],
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): WorkflowNode[][] {
  const levels: WorkflowNode[][] = [];
  const nodeDepth = new Map<string, number>();

  // Calculate depth for each node
  executionOrder.forEach((nodeId) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Find all incoming edges
    const incomingEdges = edges.filter((e) => e.target === nodeId);

    if (incomingEdges.length === 0) {
      // No dependencies - level 0
      nodeDepth.set(nodeId, 0);
    } else {
      // Find max depth of all dependencies
      let maxDepth = 0;
      incomingEdges.forEach((edge) => {
        const sourceDepth = nodeDepth.get(edge.source) ?? 0;
        maxDepth = Math.max(maxDepth, sourceDepth);
      });
      // This node is one level deeper than its deepest dependency
      nodeDepth.set(nodeId, maxDepth + 1);
    }
  });

  // Group nodes by level
  executionOrder.forEach((nodeId) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const depth = nodeDepth.get(nodeId) ?? 0;

    // Ensure level array exists
    while (levels.length <= depth) {
      levels.push([]);
    }

    levels[depth].push(node);
  });

  return levels;
}

/**
 * Poll video status endpoint
 */
export async function pollVideoStatus(
  operationName: string,
  onProgress?: (attempts: number) => void
): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  const maxAttempts = 30; // 5 minutes (30 * 10 seconds)
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;

  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    // Wait 10 seconds between polls
    await new Promise((resolve) => setTimeout(resolve, 10000));

    if (onProgress) {
      onProgress(attempts);
    }

    try {
      // Add timeout to fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const statusResponse = await fetch(
        'https://veo-api-82187245577.us-central1.run.app/video/status',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation_name: operationName }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!statusResponse.ok) {
        console.warn(`Status check failed (attempt ${attempts}/${maxAttempts}):`, statusResponse.status);
        consecutiveErrors++;

        if (consecutiveErrors >= maxConsecutiveErrors) {
          return {
            success: false,
            error: `Failed to check video status after ${maxConsecutiveErrors} consecutive errors. Last status: ${statusResponse.status}`,
          };
        }
        continue;
      }

      const statusData = await statusResponse.json();

      // Reset consecutive errors on successful response
      consecutiveErrors = 0;

      // Debug: log the actual response to understand the structure
      console.log(`[DEBUG] Status response (attempt ${attempts}):`, statusData);

      // Check if video is ready
      if (statusData.status === 'complete') {
        if (statusData.video_base64) {
          return {
            success: true,
            videoUrl: `data:video/mp4;base64,${statusData.video_base64}`,
          };
        } else if (statusData.storage_uri) {
          return {
            success: false,
            error: 'Video stored in Cloud Storage. Please download from: ' + statusData.storage_uri,
          };
        } else {
          return {
            success: false,
            error: 'Video generation completed but no video data returned',
          };
        }
      }

      // Check for errors
      if (statusData.status === 'error' || statusData.error) {
        return {
          success: false,
          error: `Video generation failed: ${statusData.error || 'Unknown error'}`,
        };
      }

      // Still processing, continue polling
      console.log(`Video generation in progress... (attempt ${attempts}/${maxAttempts})`);
    } catch (pollError) {
      consecutiveErrors++;
      console.error(`Poll error (attempt ${attempts}/${maxAttempts}):`, pollError);

      // Fail fast if too many consecutive network errors
      if (consecutiveErrors >= maxConsecutiveErrors) {
        return {
          success: false,
          error: `Network error: Failed to connect to video status endpoint after ${maxConsecutiveErrors} attempts. ${pollError instanceof Error ? pollError.message : String(pollError)}`,
        };
      }

      // Continue polling on errors
    }
  }

  // Timeout reached
  return {
    success: false,
    error: 'Video generation timed out after 5 minutes. The operation may still be processing.',
  };
}
