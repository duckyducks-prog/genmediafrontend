import {
  WorkflowNode,
  WorkflowEdge,
  NODE_CONFIGURATIONS,
  validateMutualExclusion,
  ConnectorType,
} from "./types";
import { API_ENDPOINTS } from "@/lib/api-config";

/**
 * Resolve an asset reference (imageRef, videoRef) to a data URL
 * Fetches from asset library API and converts to base64 data URI
 */
export async function resolveAssetToDataUrl(assetRef: string): Promise<string> {
  logger.debug("[resolveAssetToDataUrl] Resolving asset:", assetRef);

  try {
    // Import dynamically to avoid circular dependencies
    const { auth } = await import("@/lib/firebase");

    // Get asset metadata from library
    const user = auth.currentUser;
    const token = await user?.getIdToken();

    const response = await fetch(`${API_ENDPOINTS.library.list}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch assets: ${response.status}`);
    }

    const assets = await response.json();
    const asset = assets.find((a: any) => a.id === assetRef);

    if (!asset?.url) {
      throw new Error(`Asset not found: ${assetRef}`);
    }

    logger.debug("[resolveAssetToDataUrl] Asset URL:", asset.url);

    // If already a data URL, return as-is
    if (asset.url.startsWith("data:")) {
      return asset.url;
    }

    // Fetch the asset content and convert to data URL
    const assetResponse = await fetch(asset.url, { mode: "cors" });
    if (!assetResponse.ok) {
      throw new Error(`Failed to fetch asset content: ${assetResponse.status}`);
    }

    const blob = await assetResponse.blob();

    // Convert blob to data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        logger.debug(
          "[resolveAssetToDataUrl] Converted to data URL, length:",
          dataUrl.length,
        );
        resolve(dataUrl);
      };
      reader.onerror = () =>
        reject(new Error("Failed to convert blob to data URL"));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("[resolveAssetToDataUrl] Failed:", error);
    throw error;
  }
}

/**
 * Extract the last frame from a video as a data URL
 */
export async function extractLastFrameFromVideo(
  videoDataUrl: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.src = videoDataUrl;
    video.muted = true;

    video.onloadedmetadata = () => {
      // Seek to last frame (duration - 0.1s for safety)
      video.currentTime = Math.max(0, video.duration - 0.1);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameDataUrl = canvas.toDataURL("image/png");
        resolve(frameDataUrl);
      } catch (error) {
        reject(error);
      }
    };

    video.onerror = () => reject(new Error("Failed to load video"));
  });
}

/**
 * Gather inputs for a node by following connections backwards
 */
export function gatherNodeInputs(
  node: WorkflowNode,
  allNodes: WorkflowNode[],
  edges: WorkflowEdge[],
): Record<string, any> {
  const inputs: Record<string, any> = {};
  const nodeConfig = NODE_CONFIGURATIONS[node.type];

  logger.debug(`[gatherNodeInputs] Processing node ${node.id} (${node.type})`);

  // Find all edges that connect TO this node
  const incomingEdges = edges.filter((edge) => edge.target === node.id);
  logger.debug(
    `[gatherNodeInputs] Found ${incomingEdges.length} incoming edges`,
  );

  incomingEdges.forEach((edge) => {
    const sourceNode = allNodes.find((n) => n.id === edge.source);

    logger.debug(`[gatherNodeInputs] Processing edge:`, {
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || "DEFAULT", // ⚠️ Should NOT be default
      targetHandle: edge.targetHandle || "DEFAULT", // ⚠️ Should NOT be default
      hasSourceNode: !!sourceNode,
      sourceNodeType: sourceNode?.type,
      sourceNodeHasOutputs: !!sourceNode?.data?.outputs,
      sourceNodeOutputKeys: sourceNode?.data?.outputs
        ? Object.keys(sourceNode.data.outputs)
        : [],
      sourceNodeTopLevelKeys: sourceNode?.data
        ? Object.keys(sourceNode.data).filter(
            (k) => !["label", "status", "isGenerating"].includes(k),
          )
        : [],
    });

    if (!sourceNode) {
      console.warn(
        `[gatherNodeInputs] ⚠️ Skipping edge - source node not found`,
      );
      return;
    }

    const targetHandle = edge.targetHandle || "default";
    const sourceHandle = edge.sourceHandle || "default";

    // First, try to get from outputs object
    let outputValue = sourceNode.data.outputs?.[sourceHandle];

    logger.debug(`[gatherNodeInputs] Looking for outputs["${sourceHandle}"]`, {
      found: outputValue !== undefined,
      valueType: typeof outputValue,
      isArray: Array.isArray(outputValue),
      valueLength: outputValue?.length || 0,
      valuePreview:
        typeof outputValue === "string"
          ? outputValue.substring(0, 50) + "..."
          : outputValue,
      fullOutputsObject: sourceNode.data.outputs,
    });

    // FALLBACK: If not found in outputs, try top-level data
    if (outputValue === undefined && sourceNode.data) {
      outputValue = sourceNode.data[sourceHandle];
      if (outputValue !== undefined) {
        console.warn(
          `[gatherNodeInputs] ⚠️ Using fallback from node.data["${sourceHandle}"] (not in outputs)`,
          {
            valueType: typeof outputValue,
            valueLength: outputValue?.length || 0,
          },
        );
      }
    }

    // If still not found, check common aliases
    if (outputValue === undefined && sourceHandle === "image") {
      outputValue =
        sourceNode.data.outputs?.imageUrl || sourceNode.data.imageUrl;
      if (outputValue !== undefined) {
        console.warn(`[gatherNodeInputs] ⚠️ Found via imageUrl alias`);
      } else if (sourceNode.data.imageRef) {
        console.error(
          `[gatherNodeInputs] ❌ CRITICAL: Node has imageRef but no imageUrl!`,
          {
            nodeId: sourceNode.id,
            imageRef: sourceNode.data.imageRef,
            suggestion:
              "Asset resolution needed - workflow was likely saved/reloaded",
          },
        );
      }
    }

    // Video handle alias
    if (outputValue === undefined && sourceHandle === "video") {
      outputValue =
        sourceNode.data.outputs?.videoUrl ||
        sourceNode.data.outputs?.video ||
        sourceNode.data.videoUrl ||
        sourceNode.data.video;
      if (outputValue !== undefined) {
        console.warn(`[gatherNodeInputs] ⚠️ Found via video alias`);
      } else if (sourceNode.data.videoRef) {
        console.error(
          `[gatherNodeInputs] ❌ CRITICAL: Node has videoRef but no videoUrl!`,
          {
            nodeId: sourceNode.id,
            videoRef: sourceNode.data.videoRef,
            suggestion: "Asset resolution needed",
          },
        );
      }
    }

    if (outputValue !== undefined) {
      // Check if this input accepts multiple connections
      const inputConnector = nodeConfig.inputConnectors.find(
        (c) => c.id === targetHandle,
      );

      if (inputConnector?.acceptsMultiple) {
        // Collect multiple values into an array
        if (!inputs[targetHandle]) {
          inputs[targetHandle] = [];
        }

        // FIXED: Flatten if the output value is itself an array
        if (Array.isArray(outputValue)) {
          // Source outputs an array (e.g., GenerateImage outputs.images)
          // Flatten it into the target array
          const beforeCount = inputs[targetHandle].length;
          inputs[targetHandle].push(...outputValue);
          logger.debug(
            `[gatherNodeInputs] ✓ Flattened array into inputs["${targetHandle}"]`,
            {
              sourceOutputWasArray: true,
              itemsAdded: outputValue.length,
              totalItemsNow: inputs[targetHandle].length,
              exampleItem:
                typeof outputValue[0] === "string"
                  ? outputValue[0]?.substring(0, 50) + "..."
                  : outputValue[0],
            },
          );
        } else {
          // Source outputs a single value
          inputs[targetHandle].push(outputValue);
          logger.debug(
            `[gatherNodeInputs] ✓ Added single item to inputs["${targetHandle}"]`,
            {
              sourceOutputWasArray: false,
              itemType: typeof outputValue,
              totalItemsNow: inputs[targetHandle].length,
            },
          );
        }
      } else {
        // Single value
        inputs[targetHandle] = outputValue;
        logger.debug(
          `[gatherNodeInputs] ✓ Set inputs["${targetHandle}"] = ${typeof outputValue}`,
        );
      }
    } else {
      console.error(`[gatherNodeInputs] ❌ No value found for edge`, {
        sourceNode: sourceNode.id,
        sourceHandle,
        targetHandle,
        availableOutputKeys: sourceNode.data.outputs
          ? Object.keys(sourceNode.data.outputs)
          : [],
        availableDataKeys: Object.keys(sourceNode.data).filter(
          (k) => !["label", "status", "isGenerating", "error"].includes(k),
        ),
      });
    }
  });

  logger.debug(`[gatherNodeInputs] Final inputs keys:`, Object.keys(inputs));
  return inputs;
}

/**
 * Validate that all required inputs are connected and have values
 */
export function validateNodeInputs(
  node: WorkflowNode,
  inputs: Record<string, any>,
): { valid: boolean; error?: string } {
  const nodeConfig = NODE_CONFIGURATIONS[node.type];

  for (const inputConnector of nodeConfig.inputConnectors) {
    if (inputConnector.required) {
      const value = inputs[inputConnector.id];

      if (value === undefined || value === null || value === "") {
        return {
          valid: false,
          error: `Required input "${inputConnector.label}" is not connected or has no value`,
        };
      }

      // For multi-input, check that array is not empty
      if (
        inputConnector.acceptsMultiple &&
        Array.isArray(value) &&
        value.length === 0
      ) {
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
 * Find all upstream dependencies for a node (recursive)
 * Returns array of node IDs in execution order (topologically sorted)
 */
export function findUpstreamDependencies(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): string[] {
  const visited = new Set<string>();
  const dependencies: string[] = [];

  function traverse(currentNodeId: string) {
    if (visited.has(currentNodeId)) return;
    visited.add(currentNodeId);

    // Find all edges that connect TO this node
    const incomingEdges = edges.filter((edge) => edge.target === currentNodeId);

    // Recursively visit source nodes
    incomingEdges.forEach((edge) => {
      traverse(edge.source);
    });

    // Add current node AFTER its dependencies (post-order traversal)
    if (currentNodeId !== nodeId) {
      dependencies.push(currentNodeId);
    }
  }

  traverse(nodeId);
  return dependencies;
}

/**
 * Execute prompt concatenator logic (frontend only, no API call)
 */
export function executeConcatenator(
  inputs: Record<string, any>,
  separator: "Space" | "Comma" | "Newline" | "Period",
): string {
  const separators = {
    Space: " ",
    Comma: ", ",
    Newline: "\n",
    Period: ". ",
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
 * Parse batch input text into array based on separator
 */
function parseBatchInput(input: string, separator: string): string[] {
  if (!input?.trim()) return [];

  const sep = separator === "Newline" ? "\n" : separator;
  return input
    .split(sep)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Execute text iterator logic (frontend only, no API call)
 * Combines fixed section with multiple variable items to create array of prompts
 */
export function executeTextIterator(
  inputs: Record<string, any>,
  nodeData: {
    fixedSection: string;
    batchInput: string;
    separator: string;
    customSeparator?: string;
  },
): Record<string, string> {
  const fixedSection = inputs.fixed_section || nodeData.fixedSection || "";

  // Resolve separator first (needed for both connected items and batch input)
  const separator =
    nodeData.separator === "Custom"
      ? nodeData.customSeparator || ","
      : nodeData.separator || "Newline";

  // Get variable items from connected nodes and split if they're text strings
  const connectedItems = inputs.variable_items || [];
  let connectedItemsArray: string[] = [];

  logger.debug("[executeTextIterator] Processing connected items:", {
    connectedItemsType: typeof connectedItems,
    isArray: Array.isArray(connectedItems),
    connectedItems: connectedItems,
    separator: separator,
  });

  if (typeof connectedItems === "string") {
    // Single connected text - split it using the separator
    connectedItemsArray = parseBatchInput(connectedItems, separator);
    logger.debug(
      "[executeTextIterator] Split single string into",
      connectedItemsArray.length,
      "items",
    );
  } else if (Array.isArray(connectedItems)) {
    // Multiple connections - split each string and flatten
    connectedItemsArray = connectedItems.flatMap((item) =>
      typeof item === "string" ? parseBatchInput(item, separator) : [item],
    );
    logger.debug(
      "[executeTextIterator] Split array into",
      connectedItemsArray.length,
      "items",
    );
  }

  // Parse batch input
  const batchItems = parseBatchInput(nodeData.batchInput || "", separator);

  // Batch input takes precedence if not empty
  const variableItems =
    batchItems.length > 0 ? batchItems : connectedItemsArray;

  // Combine fixed + each variable to create outputs
  const outputs: Record<string, string> = {};

  variableItems.forEach((item: string, index: number) => {
    const combined =
      `${fixedSection}${fixedSection && item ? " " : ""}${item}`.trim();
    outputs[`output_${index}`] = combined;
  });

  return outputs;
}

/**
 * Group nodes by execution level for parallel execution
 * Level 0: nodes with no dependencies
 * Level N: nodes whose all dependencies are in levels < N
 */
export function groupNodesByLevel(
  executionOrder: string[],
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
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
 * Collect all FilterConfig objects from upstream nodes recursively
 */
export function collectFilterConfigs(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): any[] {
  const filters: any[] = [];
  const visited = new Set<string>();

  function traverse(currentNodeId: string) {
    if (visited.has(currentNodeId)) return;
    visited.add(currentNodeId);

    const currentNode = nodes.find((n) => n.id === currentNodeId);
    if (!currentNode) return;

    // Find incoming edges
    const incomingEdges = edges.filter((e) => e.target === currentNodeId);

    // Recursively collect from source nodes
    incomingEdges.forEach((edge) => {
      traverse(edge.source);

      // Check if this edge carries filters
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (sourceNode?.data?.outputs?.filters) {
        const sourceFilters = sourceNode.data.outputs.filters;
        if (Array.isArray(sourceFilters)) {
          filters.push(...sourceFilters);
        }
      }
    });
  }

  traverse(nodeId);
  return filters;
}

/**
 * Check if a node has upstream modifier nodes
 */
export function hasUpstreamModifiers(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): boolean {
  const filters = collectFilterConfigs(nodeId, nodes, edges);
  return filters.length > 0;
}

/**
 * Poll video status endpoint
 */
export async function pollVideoStatus(
  operationName: string,
  prompt: string = "",
  onProgress?: (attempts: number) => void,
): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  const maxAttempts = 30; // 5 minutes (30 * 10 seconds)

  // Import auth dynamically to avoid circular dependencies
  const { auth } = await import("@/lib/firebase");

  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    // Wait 10 seconds between polls
    await new Promise((resolve) => setTimeout(resolve, 10000));

    if (onProgress) {
      onProgress(attempts);
    }

    try {
      const user = auth.currentUser;
      const token = await user?.getIdToken();

      const statusUrl = API_ENDPOINTS.generate.videoStatus(
        operationName,
        prompt,
      );
      const statusResponse = await fetch(statusUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!statusResponse.ok) {
        console.warn(
          `Status check failed (attempt ${attempts}/${maxAttempts}):`,
          statusResponse.status,
        );
        continue;
      }

      const statusData = await statusResponse.json();

      // Check if video is ready
      if (statusData.status === "complete") {
        logger.debug(
          "[pollVideoStatus] Video generation complete! Response data:",
          {
            hasVideo_base64: !!statusData.video_base64,
            hasVideoBase64: !!statusData.videoBase64,
            hasVideo_url: !!statusData.video_url,
            hasVideoUrl: !!statusData.videoUrl,
            hasVideo: !!statusData.video,
            allKeys: Object.keys(statusData),
            fullResponse: statusData,
          },
        );

        // Try multiple possible field names for the video data
        const videoData =
          statusData.video_base64 ||
          statusData.videoBase64 ||
          statusData.video_url ||
          statusData.videoUrl ||
          statusData.video;

        if (videoData) {
          // If it's already a data URI, use it directly
          if (typeof videoData === "string" && videoData.startsWith("data:")) {
            return {
              success: true,
              videoUrl: videoData,
            };
          }
          // If it's base64, convert to data URI
          if (typeof videoData === "string") {
            return {
              success: true,
              videoUrl: `data:video/mp4;base64,${videoData}`,
            };
          }
          // Unknown format
          console.error(
            "[pollVideoStatus] Video data is not a string:",
            typeof videoData,
            videoData,
          );
        }

        return {
          success: false,
          error:
            "Video generation completed but no video data returned. Check console for response details.",
        };
      }

      // Check for errors
      if (statusData.status === "error" || statusData.error) {
        // Properly extract error message from various formats
        let errorMsg = "Unknown error";
        if (statusData.error) {
          if (typeof statusData.error === "string") {
            errorMsg = statusData.error;
          } else if (statusData.error.message) {
            errorMsg = statusData.error.message;
          } else {
            errorMsg = JSON.stringify(statusData.error);
          }
        }
        console.error("[pollVideoStatus] Video generation error:", statusData);
        return {
          success: false,
          error: `Video generation failed: ${errorMsg}`,
        };
      }

      // Still processing, continue polling
      logger.debug(
        `Video generation in progress... (attempt ${attempts}/${maxAttempts})`,
      );
    } catch (pollError) {
      console.warn(
        `Poll error (attempt ${attempts}/${maxAttempts}):`,
        pollError,
      );
      // Continue polling on errors
    }
  }

  // Timeout reached
  return {
    success: false,
    error:
      "Video generation timed out after 5 minutes. The operation may still be processing.",
  };
}
