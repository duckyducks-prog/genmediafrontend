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
 * Poll video status endpoint
 */
export async function pollVideoStatus(
  operationName: string,
  onProgress?: (attempts: number) => void
): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  const maxAttempts = 30; // 5 minutes (30 * 10 seconds)
  
  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    // Wait 10 seconds between polls
    await new Promise((resolve) => setTimeout(resolve, 10000));

    if (onProgress) {
      onProgress(attempts);
    }

    try {
      const statusResponse = await fetch(
        'https://veo-api-82187245577.us-central1.run.app/video/status',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation_name: operationName }),
        }
      );

      if (!statusResponse.ok) {
        console.warn(`Status check failed (attempt ${attempts}/${maxAttempts}):`, statusResponse.status);
        continue;
      }

      const statusData = await statusResponse.json();

      // Check if video is ready
      if (statusData.status === 'complete') {
        if (statusData.video_base64) {
          return {
            success: true,
            videoUrl: `data:video/mp4;base64,${statusData.video_base64}`,
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
      console.warn(`Poll error (attempt ${attempts}/${maxAttempts}):`, pollError);
      // Continue polling on errors
    }
  }

  // Timeout reached
  return {
    success: false,
    error: 'Video generation timed out after 5 minutes. The operation may still be processing.',
  };
}
