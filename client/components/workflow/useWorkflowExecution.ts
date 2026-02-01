import { logger } from "@/lib/logger";
import { useCallback, useState } from "react";
import {
  WorkflowNode,
  WorkflowEdge,
  NodeType,
  validateMutualExclusion,
  BatchIterationResult,
} from "./types";
import { toast } from "@/hooks/use-toast";
import { API_ENDPOINTS } from "@/lib/api-config";
import {
  gatherNodeInputs,
  validateNodeInputs,
  executeConcatenator,
  executeTextIterator,
  pollVideoStatus,
  groupNodesByLevel,
  findUpstreamDependencies,
  resolveAssetToDataUrl,
  extractLastFrameFromVideo,
} from "./executionHelpers";
import { auth } from "@/lib/firebase";
import { renderWithPixi, renderCompositeWithPixi } from "@/lib/pixi-renderer";
import { FilterConfig } from "@/lib/pixi-filter-configs";
import { executeCompoundNode } from "@/lib/compound-nodes/executeCompound";

/**
 * Apply filters to a video using the backend FFmpeg endpoint.
 */
async function applyFiltersToVideo(
  videoInput: string,
  filters: FilterConfig[],
): Promise<string> {
  try {
    // Get auth token
    const user = auth.currentUser;
    if (!user) {
      throw new Error("User not authenticated");
    }
    const token = await user.getIdToken();

    // Build request body - handle both URL and base64 video inputs
    const requestBody: any = {
      filters: filters,
    };

    if (videoInput.startsWith("data:")) {
      // Base64 data URL - extract the base64 portion
      const commaIndex = videoInput.indexOf(",");
      requestBody.video_base64 = commaIndex !== -1
        ? videoInput.substring(commaIndex + 1)
        : videoInput;
    } else {
      // Regular URL (GCS, HTTP, etc.) - send as video_url
      requestBody.video_url = videoInput;
    }

    logger.debug("[applyFiltersToVideo] Sending request:", {
      filterCount: filters.length,
      hasUrl: !!requestBody.video_url,
      hasBase64: !!requestBody.video_base64,
    });

    const response = await fetch(API_ENDPOINTS.video.applyFilters, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }

    const result = await response.json();
    return `data:video/mp4;base64,${result.video_base64}`;
  } catch (error) {
    logger.error("[applyFiltersToVideo] Failed:", error);
    throw error;
  }
}

interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  skipped?: boolean; // True if node was skipped (disabled)
}

export function useWorkflowExecution(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  setNodes: (
    nodes: WorkflowNode[] | ((nodes: WorkflowNode[]) => WorkflowNode[]),
  ) => void,
  setEdges: (
    edges: WorkflowEdge[] | ((edges: WorkflowEdge[]) => WorkflowEdge[]),
  ) => void,
  onAssetGenerated?: () => void,
) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<
    Map<string, string>
  >(new Map());
  const [totalNodes, setTotalNodes] = useState(0);
  const [abortRequested, setAbortRequested] = useState(false);

  // Batch execution state (for ScriptQueue)
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchResults, setBatchResults] = useState<Array<{ index: number; success: boolean; outputs?: any }>>([]);

  // Helper to animate edges connected to a node
  const setEdgeAnimated = useCallback(
    (nodeId: string, animated: boolean, isCompleted: boolean = false) => {
      setEdges((eds) =>
        eds.map((edge) => {
          // Animate edges going INTO this node (target)
          if (edge.target === nodeId) {
            let className = edge.className || "";

            // Remove existing animation classes
            className = className
              .replace(/\s*animated\s*/g, " ")
              .replace(/\s*edge-completed\s*/g, " ")
              .trim();

            // Add appropriate class
            if (animated) {
              className = `${className} animated`.trim();
            } else if (isCompleted) {
              className = `${className} edge-completed`.trim();
            }

            return {
              ...edge,
              animated, // React Flow built-in animated property
              className,
            };
          }
          return edge;
        }),
      );
    },
    [setEdges],
  );

  // Build adjacency list for the graph
  const buildGraph = useCallback(() => {
    const adjacencyList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize
    nodes.forEach((node) => {
      adjacencyList.set(node.id, []);
      inDegree.set(node.id, 0);
    });

    // Build graph from edges
    edges.forEach((edge) => {
      const from = edge.source;
      const to = edge.target;
      adjacencyList.get(from)?.push(to);
      inDegree.set(to, (inDegree.get(to) || 0) + 1);
    });

    return { adjacencyList, inDegree };
  }, [nodes, edges]);

  // Topological sort to determine execution order
  const getExecutionOrder = useCallback((): string[] | null => {
    const { adjacencyList, inDegree } = buildGraph();
    const queue: string[] = [];
    const result: string[] = [];

    // Find all nodes with no incoming edges (start nodes)
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) {
        queue.push(nodeId);
      }
    });

    if (queue.length === 0 && nodes.length > 0) {
      toast({
        title: "Workflow Error",
        description:
          "No start nodes found. Add a node with no incoming connections.",
        variant: "destructive",
      });
      return null;
    }

    // Process nodes
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      // Process neighbors
      const neighbors = adjacencyList.get(current) || [];
      neighbors.forEach((neighbor) => {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      });
    }

    // Check for cycles
    if (result.length !== nodes.length) {
      toast({
        title: "Workflow Error",
        description: "Circular dependencies detected in workflow.",
        variant: "destructive",
      });
      return null;
    }

    return result;
  }, [buildGraph, nodes.length]);

  // Get input data for a node from connected nodes (using new helper)
  const getNodeInputs = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return {};
      return gatherNodeInputs(node, nodes, edges);
    },
    [nodes, edges],
  );

  // Update node visual state
  const updateNodeState = useCallback(
    (nodeId: string, status: string, data?: any) => {
      logger.debug("[updateNodeState] Updating node:", {
        nodeId,
        status,
        dataKeys: data ? Object.keys(data) : [],
        hasImageUrl: !!data?.imageUrl,
        imageUrlLength: data?.imageUrl?.length || 0,
      });

      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          if (node.id === nodeId) {
            const updatedData = {
              ...node.data,
              status,
              isGenerating: status === "executing",
              ...data,
            };

            logger.debug("[updateNodeState] Updated node data:", {
              nodeId,
              nodeType: node.type,
              oldDataKeys: Object.keys(node.data),
              newDataKeys: Object.keys(updatedData),
              hasOutputs: !!updatedData.outputs,
              outputsKeys: updatedData.outputs
                ? Object.keys(updatedData.outputs)
                : [],
              topLevelHasImage: !!updatedData.image,
              topLevelHasImageUrl: !!updatedData.imageUrl,
              outputsHasImage: !!updatedData.outputs?.image,
              outputsHasImageUrl: !!updatedData.outputs?.imageUrl,
              imageUrlPreview: updatedData.imageUrl
                ? updatedData.imageUrl.substring(0, 50)
                : "none",
            });

            // Dispatch node-update event to trigger output propagation to downstream nodes
            // This is crucial for nodes like ImageComposite to propagate their outputs to Preview nodes
            if (status === "completed" && updatedData.outputs) {
              logger.debug(
                "[updateNodeState] Dispatching node-update event for output propagation",
              );
              setTimeout(() => {
                const event = new CustomEvent("node-update", {
                  detail: {
                    id: nodeId,
                    data: updatedData,
                  },
                });
                window.dispatchEvent(event);
              }, 0);
            }

            return {
              ...node,
              data: updatedData,
            };
          }
          return node;
        }),
      );
    },
    [setNodes],
  );

  // Execute a single node
  const executeNode = useCallback(
    async (node: WorkflowNode, inputs: any): Promise<ExecutionResult> => {
      // Skip disabled nodes - they pass through inputs unchanged
      if (node.data.enabled === false) {
        logger.debug(`[executeNode] Skipping disabled node: ${node.id} (${node.type})`);
        return { success: true, data: inputs, skipped: true };
      }

      try {
        switch (node.type) {
          // INPUT NODES
          case NodeType.Prompt: {
            const prompt = (node.data as any).prompt || "";
            return { success: true, data: { text: prompt } };
          }

          case NodeType.ScriptQueue: {
            const scripts = (node.data as any).scripts || [];
            const currentIndex = (node.data as any).currentIndex || 0;
            const currentScript = scripts[currentIndex] || "";

            if (scripts.length === 0) {
              return {
                success: false,
                error: "No scripts loaded. Paste scripts separated by --- into the Script Queue.",
              };
            }

            logger.debug("[ScriptQueue] Returning script", currentIndex + 1, "of", scripts.length);
            return { success: true, data: { text: currentScript } };
          }

          case NodeType.ImageInput: {
            let imageUrl = (node.data as any).imageUrl || null;
            const imageRef = (node.data as any).imageRef;

            // If imageUrl is a GCS URL (not a data URI), we need to fetch and convert it
            // This happens when loading saved workflows where imageUrl is resolved by backend
            if (imageUrl && !imageUrl.startsWith("data:") && imageUrl.startsWith("http")) {
              logger.debug(
                "[ImageInput] imageUrl is a GCS URL, fetching and converting to data URI:",
                imageUrl.substring(0, 80),
              );
              try {
                const response = await fetch(imageUrl, { mode: "cors" });
                if (!response.ok) {
                  throw new Error(`Failed to fetch image: ${response.status}`);
                }
                const blob = await response.blob();
                imageUrl = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = () => reject(new Error("Failed to convert image to data URI"));
                  reader.readAsDataURL(blob);
                });
                logger.debug(
                  "[ImageInput] ✓ Converted GCS URL to data URL, length:",
                  imageUrl.length,
                );

                // Update node with resolved data URL
                updateNodeState(node.id, node.data.status || "ready", {
                  imageUrl,
                  outputs: { image: imageUrl },
                });
              } catch (error) {
                console.error("[ImageInput] ❌ Failed to fetch GCS URL:", error);
                // Try falling back to imageRef resolution
                if (imageRef) {
                  logger.debug("[ImageInput] Falling back to imageRef resolution");
                  imageUrl = null; // Clear to trigger resolution below
                } else {
                  return {
                    success: false,
                    error: `Failed to load image: ${error instanceof Error ? error.message : "Unknown error"}`,
                  };
                }
              }
            }

            // Resolve imageRef if imageUrl is missing or was cleared
            if (!imageUrl && imageRef) {
              logger.debug(
                "[ImageInput] ⚠️ imageUrl missing, resolving imageRef:",
                imageRef,
              );
              try {
                imageUrl = await resolveAssetToDataUrl(imageRef);
                logger.debug(
                  "[ImageInput] ✓ Resolved to data URL, length:",
                  imageUrl.length,
                );

                // Update node with resolved URL
                updateNodeState(node.id, node.data.status || "ready", {
                  imageUrl,
                  outputs: { image: imageUrl },
                });
              } catch (error) {
                console.error("[ImageInput] ❌ Resolution failed:", error);
                return {
                  success: false,
                  error: `Failed to load image: ${error instanceof Error ? error.message : "Unknown error"}`,
                };
              }
            }

            if (!imageUrl) {
              console.warn("[ImageInput] ⚠️ No imageUrl or imageRef available");
            }

            return { success: true, data: { image: imageUrl } };
          }

          case NodeType.VideoInput: {
            let videoUrl = (node.data as any).videoUrl || null;
            const videoRef = (node.data as any).videoRef;
            // Preserve the original URL for downstream processing (e.g., MergeVideos)
            // This avoids the 32MB request limit when merging multiple videos
            let originalUrl: string | null = null;

            logger.debug("[VideoInput] Starting execution:", {
              hasVideoUrl: !!videoUrl,
              videoUrlType: videoUrl ? (videoUrl.startsWith('data:') ? 'dataUrl' : videoUrl.startsWith('blob:') ? 'blobUrl' : videoUrl.startsWith('http') ? 'httpUrl' : 'unknown') : 'none',
              hasVideoRef: !!videoRef,
            });

            // If videoUrl is an HTTP URL (GCS), preserve it for downstream AND convert for preview
            if (videoUrl && !videoUrl.startsWith("data:") && videoUrl.startsWith("http")) {
              // Save the original GCS URL for downstream nodes like MergeVideos
              originalUrl = videoUrl;
              logger.debug(
                "[VideoInput] Preserving GCS URL for downstream:",
                originalUrl.substring(0, 80),
              );

              // Also convert to data URL for preview (but keep original for processing)
              try {
                const response = await fetch(videoUrl, { mode: "cors" });
                if (!response.ok) {
                  throw new Error(`Failed to fetch video: ${response.status}`);
                }
                const blob = await response.blob();
                const dataUrl = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = () => reject(new Error("Failed to convert video to data URI"));
                  reader.readAsDataURL(blob);
                });
                videoUrl = dataUrl;  // Use data URL for preview
                logger.debug(
                  "[VideoInput] ✓ Also converted to data URL for preview, length:",
                  videoUrl.length,
                );
              } catch (error) {
                // If fetch fails, we can still use the HTTP URL directly
                logger.warn("[VideoInput] Failed to convert to data URL, will use HTTP URL:", error);
              }
            } else if (videoUrl && videoUrl.startsWith("blob:")) {
              // Blob URLs need to be converted
              logger.debug(
                "[VideoInput] videoUrl is a blob URL, converting to data URI:",
                videoUrl.substring(0, 80),
              );
              try {
                const response = await fetch(videoUrl, { mode: "cors" });
                if (!response.ok) {
                  throw new Error(`Failed to fetch video: ${response.status}`);
                }
                const blob = await response.blob();
                videoUrl = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = () => reject(new Error("Failed to convert video to data URI"));
                  reader.readAsDataURL(blob);
                });
                logger.debug(
                  "[VideoInput] ✓ Converted blob to data URL, length:",
                  videoUrl.length,
                );
              } catch (error) {
                console.error("[VideoInput] ❌ Failed to fetch blob URL:", error);
                if (videoRef) {
                  videoUrl = null;
                } else {
                  return {
                    success: false,
                    error: `Failed to load video: ${error instanceof Error ? error.message : "Unknown error"}`,
                  };
                }
              }
            }

            // Resolve videoRef if videoUrl is missing or was cleared
            if (!videoUrl && videoRef) {
              logger.debug(
                "[VideoInput] ⚠️ videoUrl missing, resolving videoRef:",
                videoRef,
              );
              try {
                // Get the asset info to get the GCS URL
                const { auth } = await import("@/lib/firebase");
                const user = auth.currentUser;
                const token = await user?.getIdToken();

                const response = await fetch(API_ENDPOINTS.library.list(), {
                  headers: { Authorization: `Bearer ${token}` },
                });

                if (response.ok) {
                  const assets = await response.json();
                  const asset = assets.find((a: any) => a.id === videoRef);
                  if (asset?.url) {
                    // Preserve the GCS URL for downstream
                    originalUrl = asset.url;
                    logger.debug("[VideoInput] Got GCS URL from asset:", originalUrl.substring(0, 80));
                  }
                }

                // Still resolve to data URL for preview
                videoUrl = await resolveAssetToDataUrl(videoRef);
                logger.debug(
                  "[VideoInput] ✓ Resolved to data URL, length:",
                  videoUrl.length,
                );
              } catch (error) {
                console.error("[VideoInput] ❌ Resolution failed:", error);
                return {
                  success: false,
                  error: `Failed to load video: ${error instanceof Error ? error.message : "Unknown error"}`,
                };
              }
            }

            if (!videoUrl) {
              console.warn("[VideoInput] ⚠️ No videoUrl or videoRef available");
              return {
                success: false,
                error: "No video selected. Please upload a video or select from library.",
              };
            }

            // Output the GCS URL if available (for downstream processing like MergeVideos)
            // Fall back to data URL if no GCS URL available
            const outputUrl = originalUrl || videoUrl;
            logger.debug("[VideoInput] Output URL type:", originalUrl ? "GCS URL" : "data URL");

            // Update node state
            updateNodeState(node.id, node.data.status || "ready", {
              videoUrl,  // Data URL for preview
              gcsUrl: originalUrl,  // GCS URL for downstream
              outputs: { video: outputUrl },  // Use GCS URL for downstream if available
            });

            return {
              success: true,
              data: {
                video: videoUrl,  // Data URL for preview
                gcsUrl: originalUrl,  // GCS URL for downstream
                outputs: { video: outputUrl },  // Use GCS URL for downstream if available
              },
            };
          }

          // MODIFIER NODES
          case NodeType.PromptConcatenator: {
            const separator = (node.data as any).separator || "Space";
            const combined = executeConcatenator(inputs, separator);
            return { success: true, data: { combined } };
          }

          case NodeType.TextIterator: {
            const outputs = executeTextIterator(inputs, node.data as any);
            return {
              success: true,
              data: {
                outputs,
                itemPreviews: Object.values(outputs),
                dynamicOutputCount: Object.keys(outputs).length,
              },
            };
          }

          case NodeType.ImageComposite: {
            const imageInputs = inputs.images;
            const filters: FilterConfig[] = inputs.filters || [];
            const blendMode = (node.data as any).blendMode || "normal";
            const opacity = (node.data as any).opacity || 1.0;

            logger.debug("[ImageComposite] Execution inputs:", {
              imageInputsType: typeof imageInputs,
              imageInputsIsArray: Array.isArray(imageInputs),
              imageCount: Array.isArray(imageInputs) ? imageInputs.length : 0,
              blendMode,
              opacity,
              filterCount: filters.length,
            });

            // Validate at least 2 images
            if (!Array.isArray(imageInputs) || imageInputs.length < 2) {
              return {
                success: false,
                error: "Composite node requires at least 2 images",
              };
            }

            try {
              // Apply filters to each input image if needed
              let processedImages = imageInputs;
              if (filters.length > 0) {
                logger.debug(
                  `[ImageComposite] Applying ${filters.length} filters to ${imageInputs.length} images`,
                );
                processedImages = await Promise.all(
                  imageInputs.map((img) => renderWithPixi(img, filters)),
                );
              }

              // Composite images with blend mode
              logger.debug(
                `[ImageComposite] Compositing ${processedImages.length} images with mode: ${blendMode}, opacity: ${opacity}`,
              );
              const compositeResult = await renderCompositeWithPixi(
                processedImages,
                blendMode,
                opacity,
                [], // Don't apply filters again to composite (already applied to inputs)
              );

              return {
                success: true,
                data: {
                  image: compositeResult,
                  compositePreview: `${imageInputs.length} layers blended`,
                  outputs: { image: compositeResult },
                },
              };
            } catch (error) {
              console.error("[ImageComposite] Composite failed:", error);
              return {
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Image compositing failed",
              };
            }
          }

          // ========== PIXI FILTER MODIFIER NODES ==========
          // These nodes build filter chains that are applied client-side via PixiJS
          // They pass through the image and append their filter config to the chain

          case NodeType.BrightnessContrast: {
            const imageInput = inputs.image || null;
            const videoInput = inputs.video || null;
            const upstreamFilters: FilterConfig[] = inputs.filters || [];

            const brightness = (node.data as any).brightness ?? 1.0;
            const contrast = (node.data as any).contrast ?? 1.0;

            logger.debug("[BrightnessContrast] Execution:", {
              hasImage: !!imageInput,
              hasVideo: !!videoInput,
              upstreamFilterCount: upstreamFilters.length,
              brightness,
              contrast,
            });

            if (!imageInput && !videoInput) {
              return { success: false, error: "No image or video connected" };
            }

            const thisFilter: FilterConfig = {
              type: "brightness",
              params: { brightness, contrast },
            };

            const outputFilters = [...upstreamFilters, thisFilter];

            return {
              success: true,
              data: {
                image: imageInput,
                video: videoInput,
                filters: outputFilters,
                outputs: {
                  image: imageInput,
                  video: videoInput,
                  filters: outputFilters,
                },
              },
            };
          }

          case NodeType.Blur: {
            const imageInput = inputs.image || null;
            const videoInput = inputs.video || null;
            const upstreamFilters: FilterConfig[] = inputs.filters || [];

            const strength = (node.data as any).strength ?? 8;
            const quality = (node.data as any).quality ?? 4;

            logger.debug("[Blur] Execution:", {
              hasImage: !!imageInput,
              hasVideo: !!videoInput,
              upstreamFilterCount: upstreamFilters.length,
              strength,
              quality,
            });

            if (!imageInput && !videoInput) {
              return { success: false, error: "No image or video connected" };
            }

            const thisFilter: FilterConfig = {
              type: "blur",
              params: { strength, quality },
            };

            const outputFilters = [...upstreamFilters, thisFilter];

            return {
              success: true,
              data: {
                image: imageInput,
                video: videoInput,
                filters: outputFilters,
                outputs: {
                  image: imageInput,
                  video: videoInput,
                  filters: outputFilters,
                },
              },
            };
          }

          case NodeType.Sharpen: {
            const imageInput = inputs.image || null;
            const videoInput = inputs.video || null;
            const upstreamFilters: FilterConfig[] = inputs.filters || [];

            const gamma = (node.data as any).gamma ?? 0;

            logger.debug("[Sharpen] Execution:", {
              hasImage: !!imageInput,
              hasVideo: !!videoInput,
              upstreamFilterCount: upstreamFilters.length,
              gamma,
            });

            if (!imageInput && !videoInput) {
              return { success: false, error: "No image or video connected" };
            }

            const thisFilter: FilterConfig = {
              type: "sharpen",
              params: { gamma },
            };

            const outputFilters = [...upstreamFilters, thisFilter];

            return {
              success: true,
              data: {
                image: imageInput,
                video: videoInput,
                filters: outputFilters,
                outputs: {
                  image: imageInput,
                  video: videoInput,
                  filters: outputFilters,
                },
              },
            };
          }

          case NodeType.HueSaturation: {
            const imageInput = inputs.image || null;
            const videoInput = inputs.video || null;
            const upstreamFilters: FilterConfig[] = inputs.filters || [];

            const hue = (node.data as any).hue ?? 0;
            const saturation = (node.data as any).saturation ?? 0;

            logger.debug("[HueSaturation] Execution:", {
              hasImage: !!imageInput,
              hasVideo: !!videoInput,
              upstreamFilterCount: upstreamFilters.length,
              hue,
              saturation,
            });

            if (!imageInput && !videoInput) {
              return { success: false, error: "No image or video connected" };
            }

            const thisFilter: FilterConfig = {
              type: "hueSaturation",
              params: { hue, saturation },
            };

            const outputFilters = [...upstreamFilters, thisFilter];

            return {
              success: true,
              data: {
                image: imageInput,
                video: videoInput,
                filters: outputFilters,
                outputs: {
                  image: imageInput,
                  video: videoInput,
                  filters: outputFilters,
                },
              },
            };
          }

          case NodeType.Noise: {
            const imageInput = inputs.image || null;
            const videoInput = inputs.video || null;
            const upstreamFilters: FilterConfig[] = inputs.filters || [];

            const noise = (node.data as any).noise ?? 0.5;

            logger.debug("[Noise] Execution:", {
              hasImage: !!imageInput,
              hasVideo: !!videoInput,
              upstreamFilterCount: upstreamFilters.length,
              noise,
            });

            if (!imageInput && !videoInput) {
              return { success: false, error: "No image or video connected" };
            }

            const thisFilter: FilterConfig = {
              type: "noise",
              params: { noise },
            };

            const outputFilters = [...upstreamFilters, thisFilter];

            return {
              success: true,
              data: {
                image: imageInput,
                video: videoInput,
                filters: outputFilters,
                outputs: {
                  image: imageInput,
                  video: videoInput,
                  filters: outputFilters,
                },
              },
            };
          }

          case NodeType.FilmGrain: {
            const imageInput = inputs.image || null;
            const videoInput = inputs.video || null;
            const upstreamFilters: FilterConfig[] = inputs.filters || [];

            const intensity = (node.data as any).intensity ?? 50;
            const size = (node.data as any).size ?? 1;
            const shadows = (node.data as any).shadows ?? 30;
            const highlights = (node.data as any).highlights ?? 30;
            const midtonesBias = (node.data as any).midtonesBias ?? 80;

            logger.debug("[FilmGrain] Execution:", {
              hasImage: !!imageInput,
              hasVideo: !!videoInput,
              upstreamFilterCount: upstreamFilters.length,
              intensity,
              size,
              shadows,
              highlights,
              midtonesBias,
            });

            if (!imageInput && !videoInput) {
              return { success: false, error: "No image or video connected" };
            }

            const thisFilter: FilterConfig = {
              type: "filmGrain",
              params: { intensity, size, shadows, highlights, midtonesBias },
            };

            const outputFilters = [...upstreamFilters, thisFilter];

            return {
              success: true,
              data: {
                image: imageInput,
                video: videoInput,
                filters: outputFilters,
                outputs: {
                  image: imageInput,
                  video: videoInput,
                  filters: outputFilters,
                },
              },
            };
          }

          case NodeType.Vignette: {
            const imageInput = inputs.image || null;
            const videoInput = inputs.video || null;
            const upstreamFilters: FilterConfig[] = inputs.filters || [];

            const size = (node.data as any).size ?? 0.5;
            const amount = (node.data as any).amount ?? 0.5;

            logger.debug("[Vignette] Execution:", {
              hasImage: !!imageInput,
              hasVideo: !!videoInput,
              upstreamFilterCount: upstreamFilters.length,
              size,
              amount,
            });

            if (!imageInput && !videoInput) {
              return { success: false, error: "No image or video connected" };
            }

            const thisFilter: FilterConfig = {
              type: "vignette",
              params: { size, amount },
            };

            const outputFilters = [...upstreamFilters, thisFilter];

            return {
              success: true,
              data: {
                image: imageInput,
                video: videoInput,
                filters: outputFilters,
                outputs: {
                  image: imageInput,
                  video: videoInput,
                  filters: outputFilters,
                },
              },
            };
          }

          case NodeType.Crop: {
            const imageInput = inputs.image || null;
            const videoInput = inputs.video || null;
            const upstreamFilters: FilterConfig[] = inputs.filters || [];

            const x = (node.data as any).x ?? 0;
            const y = (node.data as any).y ?? 0;
            const width = (node.data as any).width ?? 512;
            const height = (node.data as any).height ?? 512;

            logger.debug("[Crop] Execution:", {
              hasImage: !!imageInput,
              hasVideo: !!videoInput,
              upstreamFilterCount: upstreamFilters.length,
              x,
              y,
              width,
              height,
            });

            if (!imageInput && !videoInput) {
              return { success: false, error: "No image or video connected" };
            }

            const thisFilter: FilterConfig = {
              type: "crop",
              params: { x, y, width, height },
            };

            const outputFilters = [...upstreamFilters, thisFilter];

            return {
              success: true,
              data: {
                image: imageInput,
                video: videoInput,
                filters: outputFilters,
                outputs: {
                  image: imageInput,
                  video: videoInput,
                  filters: outputFilters,
                },
              },
            };
          }

          // ACTION NODES
          case NodeType.LLM: {
            const prompt = inputs.prompt;
            const context = inputs.context || null;
            const systemPrompt = (node.data as any).systemPrompt || null;
            const temperature = (node.data as any).temperature || 0.7;

            if (!prompt) {
              return { success: false, error: "No prompt connected" };
            }

            try {
              const user = auth.currentUser;
              const token = await user?.getIdToken();

              const response = await fetch(API_ENDPOINTS.generate.text, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  prompt,
                  system_prompt: systemPrompt,
                  context,
                  temperature,
                }),
              });

              if (response.status === 403) {
                return {
                  success: false,
                  error: "Access denied. Contact administrator.",
                };
              }

              if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
              }

              const apiData = await response.json();
              return {
                success: true,
                data: {
                  response: apiData.response,
                  responsePreview: apiData.response, // For UI display
                  outputs: { response: apiData.response },
                },
              };
            } catch (error) {
              return {
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Text generation failed",
              };
            }
          }

          case NodeType.GenerateImage: {
            let prompt = inputs.prompt;
            let referenceImages = inputs.reference_images || null;
            const formatData = inputs.format;
            const filters: FilterConfig[] = inputs.filters || [];

            if (!prompt) {
              return { success: false, error: "No prompt connected" };
            }

            // Always append aspect ratio to prompt (from format connector or node dropdown)
            const aspectRatio =
              formatData?.aspect_ratio || (node.data as unknown as Record<string, unknown>).aspectRatio || "1:1";
            const aspectRatioLabel =
              aspectRatio === "16:9"
                ? "landscape"
                : aspectRatio === "9:16"
                  ? "portrait"
                  : aspectRatio === "1:1"
                    ? "square"
                    : aspectRatio === "3:4"
                      ? "portrait"
                      : aspectRatio === "4:3"
                        ? "landscape"
                        : "";
            prompt = `${prompt}, ${aspectRatio} aspect ratio${aspectRatioLabel ? ` (${aspectRatioLabel})` : ""}`;

            logger.debug("[GenerateImage] Execution inputs:", {
              originalPrompt: inputs.prompt,
              finalPrompt: prompt,
              hasReferenceImages: !!referenceImages,
              referenceImagesType: typeof referenceImages,
              referenceImagesIsArray: Array.isArray(referenceImages),
              hasFormatData: !!formatData,
              formatData: formatData,
              aspectRatio: aspectRatio,
            });

            // NEW: Apply filters before sending to API (Layer 3 integration)
            if (referenceImages && filters.length > 0) {
              logger.debug(
                "[GenerateImage] Applying",
                filters.length,
                "filters before API call",
              );

              try {
                if (Array.isArray(referenceImages)) {
                  // Process each reference image
                  referenceImages = await Promise.all(
                    referenceImages.map((img) => renderWithPixi(img, filters)),
                  );
                } else {
                  // Single image
                  referenceImages = await renderWithPixi(
                    referenceImages,
                    filters,
                  );
                }
              } catch (error) {
                console.error(
                  "[GenerateImage] Filter rendering failed:",
                  error,
                );
                return {
                  success: false,
                  error:
                    "Failed to apply image filters: " +
                    (error instanceof Error ? error.message : "Unknown error"),
                };
              }
            }

            // Strip data URI prefix from reference images if present
            // and ensure we only have valid base64 strings
            if (referenceImages) {
              if (Array.isArray(referenceImages)) {
                // Filter out null/undefined and extract base64
                referenceImages = referenceImages
                  .filter((img: any) => img && typeof img === "string")
                  .map((img: string) => {
                    if (img.startsWith("data:")) {
                      return img.split(",")[1];
                    }
                    return img;
                  });

                // If array is empty after filtering, set to null
                if (referenceImages.length === 0) {
                  referenceImages = null;
                }
              } else if (typeof referenceImages === "string") {
                if (referenceImages.startsWith("data:")) {
                  referenceImages = referenceImages.split(",")[1];
                }
              } else {
                // If not string or array, set to null
                referenceImages = null;
              }
            }

            logger.debug("[GenerateImage] Processed reference images:", {
              hasReferenceImages: !!referenceImages,
              type: typeof referenceImages,
              isArray: Array.isArray(referenceImages),
              count: Array.isArray(referenceImages)
                ? referenceImages.length
                : referenceImages
                  ? 1
                  : 0,
            });

            try {
              const user = auth.currentUser;
              const token = await user?.getIdToken();

              // Build request body - include reference_images if available
              const requestBody: any = {
                prompt,
                aspect_ratio:
                  formatData?.aspect_ratio || (node.data as unknown as Record<string, unknown>).aspectRatio || "1:1",
              };

              // Add reference_images if we have valid data
              if (referenceImages) {
                requestBody.reference_images = referenceImages;
              }

              logger.debug("[GenerateImage] Request body:", {
                hasPrompt: !!requestBody.prompt,
                aspectRatio: requestBody.aspect_ratio,
                hasReferenceImages: !!requestBody.reference_images,
                referenceImageCount: Array.isArray(requestBody.reference_images)
                  ? requestBody.reference_images.length
                  : requestBody.reference_images
                    ? 1
                    : 0,
              });

              const response = await fetch(API_ENDPOINTS.generate.image, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(requestBody),
              });

              if (response.status === 403) {
                return {
                  success: false,
                  error: "Access denied. Your email may not be whitelisted.",
                };
              }

              if (response.status === 401) {
                return {
                  success: false,
                  error: "Unauthorized. Please sign out and sign in again.",
                };
              }

              if (!response.ok) {
                const errorText = await response.text();
                console.error("[GenerateImage] API Error:", {
                  status: response.status,
                  statusText: response.statusText,
                  body: errorText,
                });
                throw new Error(`API error: ${response.status} - ${errorText}`);
              }

              const apiData = await response.json();

              logger.debug("[GenerateImage] API Response:", {
                hasImages: !!apiData.images,
                imageCount: apiData.images?.length || 0,
              });

              if (apiData.images && apiData.images.length > 0) {
                const images = apiData.images.map(
                  (img: string) => `data:image/png;base64,${img}`,
                );
                const firstImage = images[0];

                logger.debug("[GenerateImage] Generated images:", {
                  imageCount: images.length,
                  firstImageLength: firstImage.length,
                  firstImagePreview: firstImage.substring(0, 50),
                });

                // ✅ Backend auto-saves images to library with prompt metadata
                // Notify that an asset was generated to refresh the library
                if (onAssetGenerated) {
                  logger.debug(
                    "[useWorkflowExecution] Image generated, triggering asset refresh",
                  );
                  onAssetGenerated();
                }

                const resultData = {
                  images,
                  image: firstImage,
                  imageUrl: firstImage,
                  outputs: {
                    images: images, // For connecting to reference_images (array)
                    image: firstImage, // For connecting to first_frame/last_frame (single)
                  },
                };

                logger.debug("[GenerateImage] Returning result data:", {
                  hasImages: !!resultData.images,
                  hasImage: !!resultData.image,
                  hasImageUrl: !!resultData.imageUrl,
                  hasOutputs: !!resultData.outputs,
                  outputsKeys: resultData.outputs
                    ? Object.keys(resultData.outputs)
                    : [],
                  imageUrlLength: resultData.imageUrl?.length || 0,
                });

                // Show success notification
                toast({
                  title: "Image Generated ✓",
                  description: `Data URL: ${resultData.imageUrl.length} chars. Check console for details.`,
                });

                return {
                  success: true,
                  data: resultData,
                };
              } else {
                return { success: false, error: "No images returned from API" };
              }
            } catch (error) {
              return {
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Image generation failed",
              };
            }
          }

          case NodeType.GenerateMusic: {
            // Get prompt from input connector or node data
            let prompt = inputs.prompt || (node.data as any).prompt || "";

            if (!prompt) {
              return { success: false, error: "No music prompt provided" };
            }

            // Get duration setting
            const selectedDuration = (node.data as any).selectedDuration || "auto";
            const durationSeconds = selectedDuration === "auto" ? null : Number(selectedDuration);

            logger.debug("[GenerateMusic] Starting execution with prompt:", {
              promptLength: prompt.length,
              promptPreview: prompt.substring(0, 50),
              selectedDuration,
              durationSeconds,
            });

            try {
              const user = auth.currentUser;
              const token = await user?.getIdToken();

              // Use ElevenLabs Music API with duration support
              const response = await fetch(API_ENDPOINTS.elevenlabs.generateMusic, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  prompt,
                  duration_seconds: durationSeconds,
                }),
              });

              if (!response.ok) {
                const errorText = await response.text();
                console.error("[GenerateMusic] API Error:", {
                  status: response.status,
                  statusText: response.statusText,
                  body: errorText,
                });

                // Parse error detail if JSON
                let errorDetail = errorText;
                try {
                  const errorJson = JSON.parse(errorText);
                  errorDetail = errorJson.detail || errorJson.message || errorText;
                } catch {
                  // Keep original text
                }

                if (response.status === 403) {
                  // Could be auth issue or ElevenLabs API access issue
                  return {
                    success: false,
                    error: `Access denied: ${errorDetail}`,
                  };
                }

                if (response.status === 401) {
                  return {
                    success: false,
                    error: "Unauthorized. Please sign out and sign in again.",
                  };
                }

                throw new Error(`API error: ${response.status} - ${errorDetail}`);
              }

              const apiData = await response.json();

              logger.debug("[GenerateMusic] API Response:", {
                hasAudio: !!apiData.audio_base64,
                audioLength: apiData.audio_base64?.length || 0,
              });

              if (apiData.audio_base64) {
                const audioUrl = `data:${apiData.mime_type || 'audio/wav'};base64,${apiData.audio_base64}`;

                // Notify that an asset was generated
                if (onAssetGenerated) {
                  logger.debug(
                    "[useWorkflowExecution] Music generated, triggering asset refresh",
                  );
                  onAssetGenerated();
                }

                const resultData = {
                  audioUrl,
                  audioDuration: apiData.duration_seconds || 30,
                  outputs: {
                    audio: audioUrl,
                  },
                };

                toast({
                  title: "Music Generated",
                  description: `Generated ${apiData.duration_seconds || 30}s of music`,
                });

                return {
                  success: true,
                  data: resultData,
                };
              } else {
                return { success: false, error: "No audio returned from API" };
              }
            } catch (error) {
              return {
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Music generation failed",
              };
            }
          }

          case NodeType.VoiceChanger: {
            // Get video from input connector
            const videoInput = inputs.video;
            const selectedVoiceId = (node.data as any).selectedVoiceId;

            if (!videoInput) {
              return { success: false, error: "No video input connected" };
            }

            if (!selectedVoiceId) {
              return { success: false, error: "No voice selected" };
            }

            logger.debug("[VoiceChanger] Starting execution:", {
              hasVideo: !!videoInput,
              voiceId: selectedVoiceId,
            });

            try {
              const user = auth.currentUser;
              const token = await user?.getIdToken();

              // Build request body - handle both URL and base64 video inputs
              const requestBody: any = {
                voice_id: selectedVoiceId,
              };

              if (videoInput.startsWith("data:")) {
                // Base64 data URL - strip the prefix and send as video_base64
                requestBody.video_base64 = videoInput.replace(/^data:video\/[^;]+;base64,/, "");
              } else {
                // Regular URL (GCS, HTTP, etc.) - send as video_url
                requestBody.video_url = videoInput;
              }

              const response = await fetch(API_ENDPOINTS.elevenlabs.voiceChange, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(requestBody),
              });

              if (!response.ok) {
                const errorText = await response.text();
                console.error("[VoiceChanger] API Error:", {
                  status: response.status,
                  statusText: response.statusText,
                  body: errorText,
                });

                // Parse error detail if JSON
                let errorDetail = errorText;
                try {
                  const errorJson = JSON.parse(errorText);
                  errorDetail = errorJson.detail || errorJson.message || errorText;
                } catch {
                  // Keep original text
                }

                if (response.status === 403) {
                  return {
                    success: false,
                    error: `Access denied: ${errorDetail}`,
                  };
                }

                if (response.status === 401) {
                  return {
                    success: false,
                    error: "Unauthorized. Please sign out and sign in again.",
                  };
                }

                throw new Error(`API error: ${response.status} - ${errorDetail}`);
              }

              const apiData = await response.json();

              logger.debug("[VoiceChanger] API Response:", {
                hasVideo: !!apiData.video_base64,
                videoLength: apiData.video_base64?.length || 0,
              });

              if (apiData.video_base64) {
                const videoUrl = `data:video/mp4;base64,${apiData.video_base64}`;

                // Notify that an asset was generated
                if (onAssetGenerated) {
                  logger.debug(
                    "[useWorkflowExecution] Voice changed video generated, triggering asset refresh",
                  );
                  onAssetGenerated();
                }

                const resultData = {
                  outputVideoUrl: videoUrl,
                  outputs: {
                    video: videoUrl,
                  },
                };

                toast({
                  title: "Voice Changed",
                  description: "Video voice has been changed successfully",
                });

                return {
                  success: true,
                  data: resultData,
                };
              } else {
                return { success: false, error: "No video returned from API" };
              }
            } catch (error) {
              return {
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Voice change failed",
              };
            }
          }

          case NodeType.MergeVideos: {
            // Enhanced logging to debug input gathering
            logger.debug("[MergeVideos] 🎬 Input analysis:", {
              inputKeys: Object.keys(inputs),
              video1: inputs.video1 ? { type: typeof inputs.video1, length: inputs.video1.length, prefix: inputs.video1.substring(0, 50) } : "MISSING",
              video2: inputs.video2 ? { type: typeof inputs.video2, length: inputs.video2.length, prefix: inputs.video2.substring(0, 50) } : "MISSING",
              video3: inputs.video3 ? { type: typeof inputs.video3, length: inputs.video3.length, prefix: inputs.video3.substring(0, 50) } : "MISSING",
              video4: inputs.video4 ? { type: typeof inputs.video4, length: inputs.video4.length, prefix: inputs.video4.substring(0, 50) } : "MISSING",
              video5: inputs.video5 ? { type: typeof inputs.video5, length: inputs.video5.length, prefix: inputs.video5.substring(0, 50) } : "MISSING",
              video6: inputs.video6 ? { type: typeof inputs.video6, length: inputs.video6.length, prefix: inputs.video6.substring(0, 50) } : "MISSING",
              fullInputsObject: inputs,
            });

            // Get videos from input connectors (support up to 6)
            const video1 = inputs.video1;
            const video2 = inputs.video2;
            const video3 = inputs.video3;
            const video4 = inputs.video4;
            const video5 = inputs.video5;
            const video6 = inputs.video6;

            // Collect all connected videos
            const videos: string[] = [];
            if (video1) videos.push(video1);
            if (video2) videos.push(video2);
            if (video3) videos.push(video3);
            if (video4) videos.push(video4);
            if (video5) videos.push(video5);
            if (video6) videos.push(video6);

            logger.debug("[MergeVideos] Collected videos array:", {
              count: videos.length,
              videoPreviews: videos.map((v, i) => ({
                index: i,
                type: typeof v,
                isUrl: v.startsWith("http"),
                isDataUrl: v.startsWith("data:"),
                prefix: v.substring(0, 60),
              })),
            });

            if (videos.length < 2) {
              logger.error("[MergeVideos] ❌ Insufficient videos - only", videos.length, "found");
              return { success: false, error: "At least 2 videos required to merge" };
            }

            // Separate videos by type: URLs (GCS) vs data URLs (base64)
            // URLs are preferred as they avoid the 32MB request limit
            const videoUrls: string[] = [];
            const videosBase64: string[] = [];

            for (let i = 0; i < videos.length; i++) {
              const v = videos[i];
              if (v.startsWith('https://') || v.startsWith('http://')) {
                // GCS/HTTP URL - backend will download directly
                videoUrls.push(v);
              } else if (v.startsWith('data:')) {
                // Data URL - extract base64
                videosBase64.push(
                  v.replace(/^data:video\/[^;]+;base64,/, "")
                    .replace(/^data:application\/[^;]+;base64,/, "")
                );
              } else {
                logger.error(`[MergeVideos] Video ${i + 1} has invalid format:`, v.substring(0, 50));
                return {
                  success: false,
                  error: `Video ${i + 1} is not ready. Please run the source node first.`
                };
              }
            }

            // Decide which format to send
            // Prefer URLs to avoid 32MB request limit
            const useUrls = videoUrls.length === videos.length;
            const useBase64 = videosBase64.length === videos.length;

            logger.debug("[MergeVideos] Starting execution:", {
              videoCount: videos.length,
              urlCount: videoUrls.length,
              base64Count: videosBase64.length,
              useUrls,
              useBase64,
              firstVideoPreview: videos[0]?.substring(0, 100),
            });

            // CRITICAL: Check if we're trying to send 3+ videos as base64
            // This will fail due to Cloud Run's 32MB request limit
            if (useBase64 && videosBase64.length >= 3) {
              logger.error("[MergeVideos] Cannot merge 3+ videos as base64 - would exceed 32MB limit");
              logger.error("[MergeVideos] Videos are data URLs instead of GCS URLs.");
              return {
                success: false,
                error: "Cannot merge 3+ videos: size limit exceeded. Please use videos from your library (not locally uploaded files) which have GCS URLs, or re-generate videos after deploying latest backend."
              };
            }

            if (!useUrls && !useBase64) {
              // Mixed formats - not supported yet
              logger.warn("[MergeVideos] Mixed URL and base64 formats");
              return {
                success: false,
                error: "Mixed video formats detected. Please ensure all videos are from the same source type."
              };
            }

            try {
              const user = auth.currentUser;
              const token = await user?.getIdToken();

              // Get options from node data
              const aspectRatio = (node.data as any).aspectRatio || "16:9";
              const trimSilence = (node.data as any).trimSilence || false;

              // Build request body - prefer URLs (no size limit)
              const requestBody: { video_urls?: string[]; videos_base64?: string[]; aspect_ratio?: string; trim_silence?: boolean } = {
                aspect_ratio: aspectRatio,
                trim_silence: trimSilence,
              };
              if (useUrls) {
                requestBody.video_urls = videoUrls;
                logger.info(`[MergeVideos] Sending ${videoUrls.length} video URLs to backend, aspect ratio: ${aspectRatio}, trim silence: ${trimSilence}`);
              } else {
                requestBody.videos_base64 = videosBase64;
                logger.info(`[MergeVideos] Sending ${videosBase64.length} videos as base64, aspect ratio: ${aspectRatio}, trim silence: ${trimSilence}`);
              }

              const response = await fetch(API_ENDPOINTS.video.merge, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(requestBody),
              });

              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API error: ${response.status} - ${errorText}`);
              }

              const apiData = await response.json();

              if (apiData.video_base64) {
                const videoUrl = `data:video/mp4;base64,${apiData.video_base64}`;

                if (onAssetGenerated) {
                  onAssetGenerated();
                }

                toast({
                  title: "Videos Merged",
                  description: `Successfully merged ${videos.length} videos`,
                });

                return {
                  success: true,
                  data: {
                    outputVideoUrl: videoUrl,
                    outputs: {
                      video: videoUrl,
                    },
                  },
                };
              } else {
                return { success: false, error: "No video returned from API" };
              }
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : "Merge failed",
              };
            }
          }

          case NodeType.AddMusicToVideo: {
            const videoInput = inputs.video;
            const audioInput = inputs.audio;

            if (!videoInput) {
              return { success: false, error: "No video input connected" };
            }

            if (!audioInput) {
              return { success: false, error: "No audio input connected" };
            }

            const musicVolume = (node.data as any).musicVolume ?? 50;
            const originalVolume = (node.data as any).originalVolume ?? 100;

            logger.debug("[AddMusicToVideo] Starting execution:", {
              hasVideo: !!videoInput,
              hasAudio: !!audioInput,
              musicVolume,
              originalVolume,
            });

            try {
              const user = auth.currentUser;
              const token = await user?.getIdToken();

              // Build request body - handle both URL and base64 inputs
              const requestBody: any = {
                music_volume: musicVolume,
                original_volume: originalVolume,
              };

              // Handle video input
              if (videoInput.startsWith("data:")) {
                requestBody.video_base64 = videoInput
                  .replace(/^data:video\/[^;]+;base64,/, "")
                  .replace(/^data:application\/[^;]+;base64,/, "");
              } else {
                requestBody.video_url = videoInput;
              }

              // Handle audio input
              if (audioInput.startsWith("data:")) {
                requestBody.audio_base64 = audioInput
                  .replace(/^data:audio\/[^;]+;base64,/, "")
                  .replace(/^data:application\/[^;]+;base64,/, "");
              } else {
                requestBody.audio_url = audioInput;
              }

              const response = await fetch(API_ENDPOINTS.video.addMusic, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(requestBody),
              });

              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API error: ${response.status} - ${errorText}`);
              }

              const apiData = await response.json();

              if (apiData.video_base64) {
                const videoUrl = `data:video/mp4;base64,${apiData.video_base64}`;

                if (onAssetGenerated) {
                  onAssetGenerated();
                }

                toast({
                  title: "Music Added",
                  description: "Music has been added to the video",
                });

                return {
                  success: true,
                  data: {
                    outputVideoUrl: videoUrl,
                    outputs: {
                      video: videoUrl,
                    },
                  },
                };
              } else {
                return { success: false, error: "No video returned from API" };
              }
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : "Add music failed",
              };
            }
          }

          case NodeType.GenerateVideo: {
            logger.debug("[GenerateVideo] Starting execution with inputs:", {
              inputKeys: Object.keys(inputs),
              hasPrompt: !!inputs.prompt,
              hasFirstFrame: !!inputs.first_frame,
              hasLastFrame: !!inputs.last_frame,
              hasReferenceImages: !!inputs.reference_images,
              hasFormat: !!inputs.format,
              hasFilters: !!inputs.filters,
              firstFrameType: typeof inputs.first_frame,
              firstFrameLength: inputs.first_frame?.length || 0,
              firstFramePreview:
                typeof inputs.first_frame === "string"
                  ? inputs.first_frame.substring(0, 50) + "..."
                  : inputs.first_frame,
            });

            let prompt = inputs.prompt || "";
            let firstFrame = inputs.first_frame || null;
            let lastFrame = inputs.last_frame || null;
            let referenceImages = inputs.reference_images || null;
            const formatData = inputs.format;
            const filters: FilterConfig[] = inputs.filters || [];

            // Validate that at least one input is provided (prompt OR images)
            if (!prompt && !firstFrame && !lastFrame && !referenceImages) {
              return {
                success: false,
                error:
                  "Video generation requires at least a prompt or image inputs (first frame, last frame, or reference images)",
              };
            }

            // Get aspect ratio for both prompt enhancement and logging
            const aspectRatio =
              formatData?.aspect_ratio || (node.data as unknown as Record<string, unknown>).aspectRatio || "16:9";

            // Append aspect ratio to prompt if prompt exists
            if (prompt) {
              const aspectRatioLabel =
                aspectRatio === "16:9"
                  ? "landscape"
                  : aspectRatio === "9:16"
                    ? "portrait"
                    : "";
              prompt = `${prompt}, ${aspectRatio} aspect ratio${aspectRatioLabel ? ` (${aspectRatioLabel})` : ""}`;
            } else {
              // Use a default prompt when only images are provided
              prompt = "Generate a video from the provided images";
            }

            logger.debug("[GenerateVideo] After variable assignment:", {
              originalPrompt: inputs.prompt,
              finalPrompt: prompt,
              hasFirstFrame: !!firstFrame,
              hasLastFrame: !!lastFrame,
              hasReferenceImages: !!referenceImages,
              firstFrameLength: firstFrame?.length || 0,
              hasFormatData: !!formatData,
              formatData: formatData,
              aspectRatio: aspectRatio,
            });

            // NEW: Apply filters before sending to API (Layer 3 integration)
            if (filters.length > 0) {
              logger.debug(
                "[GenerateVideo] Applying",
                filters.length,
                "filters before API call",
              );

              try {
                // Process first_frame if filters exist
                if (firstFrame && typeof firstFrame === "string") {
                  firstFrame = await renderWithPixi(firstFrame, filters);
                }

                // Process last_frame if filters exist
                if (lastFrame && typeof lastFrame === "string") {
                  lastFrame = await renderWithPixi(lastFrame, filters);
                }

                // Process reference_images if filters exist
                if (referenceImages) {
                  if (Array.isArray(referenceImages)) {
                    referenceImages = await Promise.all(
                      referenceImages.map((img) =>
                        renderWithPixi(img, filters),
                      ),
                    );
                  } else if (typeof referenceImages === "string") {
                    referenceImages = await renderWithPixi(
                      referenceImages,
                      filters,
                    );
                  }
                }
              } catch (error) {
                console.error(
                  "[GenerateVideo] Filter rendering failed:",
                  error,
                );
                return {
                  success: false,
                  error:
                    "Failed to apply image filters: " +
                    (error instanceof Error ? error.message : "Unknown error"),
                };
              }
            }

            // Strip data URI prefix from image inputs if present
            // and ensure we only have valid base64 strings
            if (firstFrame && typeof firstFrame === "string") {
              if (firstFrame.startsWith("data:")) {
                firstFrame = firstFrame.split(",")[1];
              }
            } else {
              firstFrame = null;
            }

            if (lastFrame && typeof lastFrame === "string") {
              if (lastFrame.startsWith("data:")) {
                lastFrame = lastFrame.split(",")[1];
              }
            } else {
              lastFrame = null;
            }

            if (referenceImages) {
              if (Array.isArray(referenceImages)) {
                // Filter out null/undefined and extract base64
                referenceImages = referenceImages
                  .filter((img: any) => img && typeof img === "string")
                  .map((img: string) => {
                    if (img.startsWith("data:")) {
                      return img.split(",")[1];
                    }
                    return img;
                  });

                // If array is empty after filtering, set to null
                if (referenceImages.length === 0) {
                  referenceImages = null;
                }
              } else if (typeof referenceImages === "string") {
                if (referenceImages.startsWith("data:")) {
                  referenceImages = referenceImages.split(",")[1];
                }
              } else {
                // If not string or array, set to null
                referenceImages = null;
              }
            }

            // Validate reference_images limit (Veo supports max 3)
            if (referenceImages && Array.isArray(referenceImages)) {
              if (referenceImages.length > 3) {
                return {
                  success: false,
                  error: `Too many reference images (${referenceImages.length}). Veo supports a maximum of 3 reference images. Please disconnect some images.`,
                };
              }

              logger.debug(
                `[GenerateVideo] Reference images count: ${referenceImages.length}/3`,
              );
            }

            // Validate mutual exclusion
            const validation = validateMutualExclusion(node.type, {
              first_frame: firstFrame,
              last_frame: lastFrame,
              reference_images: referenceImages,
            });

            if (!validation.valid) {
              return {
                success: false,
                error: validation.error,
              };
            }

            try {
              const user = auth.currentUser;
              const token = await user?.getIdToken();

              logger.debug(
                "[GenerateVideo] Preparing request body (backend API fields: first_frame/last_frame):",
                {
                  hasPrompt: !!prompt,
                  hasFirstFrame: !!firstFrame,
                  hasLastFrame: !!lastFrame,
                  hasReferenceImages: !!referenceImages,
                  firstFrameLength:
                    typeof firstFrame === "string" ? firstFrame.length : 0,
                  lastFrameLength:
                    typeof lastFrame === "string" ? lastFrame.length : 0,
                },
              );

              // Build request body - only include optional fields if we have valid data
              // Cast node.data for property access since WorkflowNodeData is a union type
              const nodeData = node.data as unknown as Record<string, unknown>;
              const requestBody: any = {
                aspect_ratio:
                  formatData?.aspect_ratio || nodeData.aspectRatio || "16:9",
                duration_seconds:
                  formatData?.duration_seconds ||
                  nodeData.durationSeconds ||
                  8,
                generate_audio:
                  formatData?.generate_audio ?? nodeData.generateAudio ?? true,
              };

              // Add seed if provided (for consistent voice/style)
              // Priority: node.data.seed (if useConsistentVoice is true) > formatData.seed
              if (
                nodeData.useConsistentVoice &&
                nodeData.seed !== undefined &&
                nodeData.seed !== null
              ) {
                requestBody.seed = nodeData.seed;
                logger.debug(
                  "[GenerateVideo] ✓ Using seed from node:",
                  nodeData.seed,
                  "for consistent generation",
                );
              } else if (
                formatData?.seed !== undefined &&
                formatData?.seed !== null
              ) {
                requestBody.seed = formatData.seed;
                logger.debug(
                  "[GenerateVideo] ✓ Using seed from format:",
                  formatData.seed,
                  "for consistent generation",
                );
              }

              // Only include prompt if provided
              if (prompt) {
                requestBody.prompt = prompt;
              }

              // Only add image fields if we have valid data (not null or empty)
              // Backend API expects "first_frame" and "last_frame" fields
              if (firstFrame) {
                requestBody.first_frame = firstFrame;
                logger.debug(
                  "[GenerateVideo] ✓ Including first_frame in request (base64 length:",
                  firstFrame.length,
                  ")",
                );
              }
              if (lastFrame) {
                requestBody.last_frame = lastFrame;
                logger.debug(
                  "[GenerateVideo] ✓ Including last_frame in request (base64 length:",
                  lastFrame.length,
                  ")",
                );
              }
              if (referenceImages) {
                requestBody.reference_images = referenceImages;
                logger.debug(
                  "[GenerateVideo] ✓ Including reference_images in request (count:",
                  Array.isArray(referenceImages) ? referenceImages.length : 1,
                  ")",
                );
              }

              logger.debug("[GenerateVideo] Full request body (truncated):", {
                prompt: requestBody.prompt?.substring(0, 50),
                first_frame: requestBody.first_frame
                  ? `${typeof requestBody.first_frame} (${requestBody.first_frame.length} chars)`
                  : null,
                last_frame: requestBody.last_frame
                  ? `${typeof requestBody.last_frame} (${requestBody.last_frame.length} chars)`
                  : null,
                reference_images: requestBody.reference_images
                  ? Array.isArray(requestBody.reference_images)
                    ? `array (${requestBody.reference_images.length} images)`
                    : `string (${requestBody.reference_images.length} chars)`
                  : null,
                aspect_ratio: requestBody.aspect_ratio,
                duration_seconds: requestBody.duration_seconds,
                generate_audio: requestBody.generate_audio,
              });

              const response = await fetch(API_ENDPOINTS.generate.video, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(requestBody),
              });

              if (response.status === 403) {
                return {
                  success: false,
                  error: "Access denied. Contact administrator.",
                };
              }

              if (!response.ok) {
                // Try to extract error message from response body
                let errorMessage = `API error: ${response.status}`;
                try {
                  const errorData = await response.json();
                  if (errorData.error) {
                    errorMessage =
                      typeof errorData.error === "string"
                        ? errorData.error
                        : JSON.stringify(errorData.error);
                  } else if (errorData.detail) {
                    errorMessage =
                      typeof errorData.detail === "string"
                        ? errorData.detail
                        : JSON.stringify(errorData.detail);
                  } else if (errorData.message) {
                    errorMessage =
                      typeof errorData.message === "string"
                        ? errorData.message
                        : JSON.stringify(errorData.message);
                  }
                  console.error(
                    "[GenerateVideo] API error response:",
                    errorData,
                  );
                } catch (parseError) {
                  console.error(
                    "[GenerateVideo] Could not parse error response:",
                    parseError,
                  );
                }
                throw new Error(errorMessage);
              }

              const apiData = await response.json();

              if (!apiData.operation_name) {
                return {
                  success: false,
                  error: "No operation name returned from API",
                };
              }

              // Poll for video completion using helper
              const result = await pollVideoStatus(
                apiData.operation_name,
                prompt || "",
                (attempts) => {
                  // Update node with poll progress
                  updateNodeState(node.id, "executing", {
                    pollAttempts: attempts,
                  });
                },
              );

              if (result.success && result.videoUrl) {
                // ✅ Backend auto-saves videos to library with prompt metadata
                // Notify that an asset was generated to refresh the library
                if (onAssetGenerated) {
                  logger.debug(
                    "[useWorkflowExecution] Video generated, triggering asset refresh",
                  );
                  onAssetGenerated();
                }

                // Use GCS URL for downstream processing (avoids 32MB limit)
                // Fall back to data URL if GCS URL not available
                const outputUrl = result.gcsUrl || result.videoUrl;
                logger.debug("[GenerateVideo] Output URLs:", {
                  gcsUrl: result.gcsUrl ? result.gcsUrl.substring(0, 80) + "..." : null,
                  videoUrl: result.videoUrl.substring(0, 50) + "...",
                  usingGcsUrl: !!result.gcsUrl,
                });

                return {
                  success: true,
                  data: {
                    video: result.videoUrl,  // Data URL for preview
                    videoUrl: result.videoUrl,  // Data URL for preview
                    gcsUrl: result.gcsUrl,  // GCS URL for downstream processing
                    outputs: {
                      video: outputUrl, // Use GCS URL for downstream (merge, etc.)
                    },
                  },
                };
              } else {
                return {
                  success: false,
                  error: result.error || "Video generation failed",
                };
              }
            } catch (error) {
              console.error("[GenerateVideo] Error during execution:", error);
              let errorMessage = "Video generation failed";

              if (error instanceof Error) {
                errorMessage = error.message;
              } else if (typeof error === "string") {
                errorMessage = error;
              } else if (error && typeof error === "object") {
                // Handle error objects that might have message, error, or detail properties
                const errorObj = error as any;
                errorMessage =
                  errorObj.message ||
                  errorObj.error ||
                  errorObj.detail ||
                  JSON.stringify(error);
              }

              return {
                success: false,
                error: errorMessage,
              };
            }
          }

          case NodeType.VideoWatermark: {
            const videoInput = inputs.video;
            const watermarkInput = inputs.watermark;

            if (!videoInput) {
              return {
                success: false,
                error: "No video connected to Video Compositing node",
              };
            }

            if (!watermarkInput) {
              return {
                success: false,
                error: "No watermark image connected to Video Compositing node",
              };
            }

            try {
              logger.debug("[VideoWatermark] Adding watermark to video");

              const user = auth.currentUser;
              const token = await user?.getIdToken();

              const requestBody: any = {
                position: node.data.position || "bottom-right",
                opacity: node.data.opacity ?? 1.0,
                scale: node.data.scale ?? 0.15,
                margin: node.data.margin ?? 20,
                mode: node.data.mode || "watermark",
              };

              // Handle video input - URL or base64
              if (videoInput.startsWith("data:")) {
                requestBody.video_base64 = videoInput;
              } else {
                requestBody.video_url = videoInput;
              }

              // Handle watermark input - URL or base64
              if (watermarkInput.startsWith("data:")) {
                requestBody.watermark_base64 = watermarkInput;
              } else {
                requestBody.watermark_url = watermarkInput;
              }

              const response = await fetch(API_ENDPOINTS.video.addWatermark, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(requestBody),
              });

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to add watermark: ${response.status}`);
              }

              const result = await response.json();
              const outputVideoUrl = `data:video/mp4;base64,${result.video_base64}`;

              logger.debug("[VideoWatermark] ✓ Watermark added successfully");

              return {
                success: true,
                data: {
                  videoUrl: outputVideoUrl,
                  outputs: {
                    video: outputVideoUrl,
                  },
                },
              };
            } catch (error) {
              console.error("[VideoWatermark] ❌ Failed:", error);
              return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to add watermark",
              };
            }
          }

          case NodeType.VideoSegmentReplace: {
            const baseVideo = inputs.base;
            const replacementVideo = inputs.replacement;

            if (!baseVideo) {
              return {
                success: false,
                error: "No base video connected to Video Segment Replace node",
              };
            }

            if (!replacementVideo) {
              return {
                success: false,
                error: "No replacement video connected to Video Segment Replace node",
              };
            }

            try {
              logger.debug("[VideoSegmentReplace] Replacing video segment");

              const user = auth.currentUser;
              const token = await user?.getIdToken();

              const requestBody: any = {
                start_time: node.data.startTime ?? 0,
                end_time: node.data.endTime ?? 10,
                audio_mode: node.data.audioMode || "keep_base",
                fit_mode: node.data.fitMode || "trim",
              };

              if (baseVideo.startsWith("data:")) {
                requestBody.base_video_base64 = baseVideo;
              } else {
                requestBody.base_video_url = baseVideo;
              }

              if (replacementVideo.startsWith("data:")) {
                requestBody.replacement_video_base64 = replacementVideo;
              } else {
                requestBody.replacement_video_url = replacementVideo;
              }

              const response = await fetch(API_ENDPOINTS.video.segmentReplace, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(requestBody),
              });

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to replace segment: ${response.status}`);
              }

              const result = await response.json();
              const outputVideoUrl = `data:video/mp4;base64,${result.video_base64}`;

              logger.debug("[VideoSegmentReplace] ✓ Segment replaced successfully");

              return {
                success: true,
                data: {
                  videoUrl: outputVideoUrl,
                  outputs: {
                    video: outputVideoUrl,
                  },
                },
              };
            } catch (error) {
              console.error("[VideoSegmentReplace] ❌ Failed:", error);
              return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to replace segment",
              };
            }
          }

          case NodeType.ExtractLastFrame: {
            const videoInput = inputs.video;

            if (!videoInput) {
              return {
                success: false,
                error: "No video connected to Extract Last Frame node",
              };
            }

            try {
              logger.debug(
                "[ExtractLastFrame] Extracting last frame from video, length:",
                typeof videoInput === "string"
                  ? videoInput.length
                  : "not a string",
              );

              // Extract last frame from video
              const extractedFrame =
                await extractLastFrameFromVideo(videoInput);

              logger.debug(
                "[ExtractLastFrame] ✓ Frame extracted, length:",
                extractedFrame.length,
              );

              return {
                success: true,
                data: {
                  videoUrl: videoInput, // Pass through input video
                  extractedFrameUrl: extractedFrame,
                  outputs: {
                    image: extractedFrame, // Output extracted frame
                  },
                },
              };
            } catch (error) {
              console.error("[ExtractLastFrame] ❌ Failed:", error);
              return {
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Failed to extract frame",
              };
            }
          }

          case NodeType.ImageOutput: {
            // Get image from input - support both "image" and legacy names
            const imageUrl = inputs["image-input"] || inputs.image || null;
            return { success: true, data: { imageUrl, type: "image" } };
          }

          case NodeType.VideoOutput: {
            // Get video from input - support both "video" and legacy names
            const videoUrl = inputs["video-input"] || inputs.video || null;
            return { success: true, data: { videoUrl, type: "video" } };
          }

          case NodeType.Download: {
            // Get media from input
            const mediaData = inputs["media-input"] || inputs || {};
            let mediaUrl =
              mediaData.image ||
              mediaData.video ||
              mediaData.imageUrl ||
              mediaData.videoUrl ||
              null;
            const isVideo = !!(mediaData.video || mediaData.videoUrl);
            const filters: FilterConfig[] =
              inputs.filters || mediaData.filters || [];

            // Apply filters before downloading
            if (mediaUrl && filters.length > 0) {
              if (!isVideo) {
                // Apply filters to images using PixiJS (client-side)
                logger.debug(
                  "[Download] Applying",
                  filters.length,
                  "filters to image before download",
                );
                try {
                  mediaUrl = await renderWithPixi(mediaUrl, filters);
                } catch (error) {
                  console.error("[Download] Image filter rendering failed:", error);
                  toast({
                    title: "Filter Error",
                    description:
                      "Failed to apply filters. Downloading original image.",
                    variant: "destructive",
                  });
                }
              } else {
                // Apply filters to videos using backend FFmpeg
                logger.debug(
                  "[Download] Applying",
                  filters.length,
                  "filters to video before download",
                );
                try {
                  mediaUrl = await applyFiltersToVideo(mediaUrl, filters);
                } catch (error) {
                  console.error("[Download] Video filter rendering failed:", error);
                  toast({
                    title: "Filter Error",
                    description:
                      "Failed to apply filters. Downloading original video.",
                    variant: "destructive",
                  });
                }
              }
            }

            if (mediaUrl) {
              try {
                // Determine file extension
                const extension = isVideo ? "mp4" : "png";
                const fileName = `generated-${isVideo ? "video" : "image"}-${Date.now()}.${extension}`;

                // Notify user about download attempt
                toast({
                  title: "Download Started",
                  description: `Downloading ${fileName}. If blocked by browser, use the download button on the output node.`,
                });

                // For base64 data URIs, download directly
                if (mediaUrl.startsWith("data:")) {
                  const link = document.createElement("a");
                  link.href = mediaUrl;
                  link.download = fileName;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                } else {
                  // For external URLs, open in new tab (avoid CORS issues)
                  const link = document.createElement("a");
                  link.href = mediaUrl;
                  link.download = fileName;
                  link.target = "_blank";
                  link.rel = "noopener noreferrer";
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }
              } catch (error) {
                console.error("Download failed:", error);
                toast({
                  title: "Download Failed",
                  description:
                    "Opening file in new tab instead. You can save it manually.",
                  variant: "destructive",
                });
                // Fallback: open URL in new tab
                window.open(mediaUrl, "_blank");
              }
            }

            return { success: true, data: { downloaded: !!mediaUrl } };
          }

          // COMPOUND NODES
          case NodeType.Compound: {
            logger.debug("[Compound] Executing compound node:", node.id);

            // Create a workflow executor function with the expected signature
            // This allows compound nodes to recursively execute their internal workflows
            const internalWorkflowExecutor = async (
              _internalNodes: WorkflowNode[],
              _internalEdges: WorkflowEdge[],
            ): Promise<{ success: boolean; data?: any; error?: string }> => {
              // Execute the internal workflow nodes using the same execution logic
              // For now, we return a basic implementation
              return { success: true, data: {} };
            };

            // Execute the compound node's internal workflow
            const result = await executeCompoundNode(
              node,
              inputs,
              internalWorkflowExecutor,
            );

            if (!result.success) {
              return {
                success: false,
                error: result.error || "Compound node execution failed",
              };
            }

            // Return the outputs from the compound node
            return {
              success: true,
              data: {
                outputs: result.data,
                ...result.data, // Also spread to top level for compatibility
              },
            };
          }

          default:
            return { success: true, data: {} };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    [updateNodeState, onAssetGenerated],
  );

  // Abort workflow execution
  const abortWorkflow = useCallback(() => {
    setAbortRequested(true);
    toast({
      title: "Aborting Workflow",
      description: "Stopping execution after current node...",
    });
  }, []);

  // Main execution function
  const executeWorkflow = useCallback(async () => {
    if (isExecuting) {
      toast({
        title: "Already Executing",
        description: "Workflow is already running.",
      });
      return;
    }

    if (nodes.length === 0) {
      toast({
        title: "Empty Workflow",
        description: "Add nodes to the workflow before running.",
      });
      return;
    }

    setIsExecuting(true);
    setAbortRequested(false);
    const executionOrder = getExecutionOrder();

    if (!executionOrder) {
      setIsExecuting(false);
      return;
    }

    // Check for ScriptQueue node (batch mode)
    const scriptQueueNode = nodes.find((n) => n.type === NodeType.ScriptQueue);
    const scripts = scriptQueueNode ? (scriptQueueNode.data as any).scripts || [] : [];
    const batchMode = scriptQueueNode && scripts.length > 1;

    // Identify post-batch aggregator nodes - these should run AFTER all batch iterations complete
    // A post-batch node is one that:
    // 1. Is an aggregator type (MergeVideos, AddMusicToVideo, VoiceChanger)
    // 2. Has inputs that come from nodes IN THE BATCH ITERATION CHAIN
    // The batch iteration chain: ScriptQueue → ... → GenerateVideo/GenerateImage
    // These nodes need ALL iteration outputs, not just the current iteration's output
    const postBatchNodeIds = new Set<string>();
    
    // Track the actual batch iteration node (the one connected to ScriptQueue's output chain)
    let batchIterationVideoNodeId: string | undefined;
    
    if (batchMode && scriptQueueNode) {
      // Find the node that receives ScriptQueue's text output (usually Prompt or GenerateVideo via chain)
      // Then trace to find the video-producing node in the batch chain
      const scriptQueueOutEdges = edges.filter(e => e.source === scriptQueueNode.id);
      
      // Trace the chain from ScriptQueue to find GenerateVideo/GenerateImage
      const findBatchVideoNode = (startNodeId: string, visited = new Set<string>()): string | undefined => {
        if (visited.has(startNodeId)) return undefined;
        visited.add(startNodeId);
        
        const node = nodes.find(n => n.id === startNodeId);
        if (!node) return undefined;
        
        // Found a video-producing node
        if (node.type === NodeType.GenerateVideo || node.type === NodeType.GenerateImage) {
          return node.id;
        }
        
        // Continue tracing downstream
        const outEdges = edges.filter(e => e.source === startNodeId);
        for (const edge of outEdges) {
          const result = findBatchVideoNode(edge.target, visited);
          if (result) return result;
        }
        
        return undefined;
      };
      
      // Find the batch iteration video node starting from ScriptQueue
      for (const edge of scriptQueueOutEdges) {
        batchIterationVideoNodeId = findBatchVideoNode(edge.target);
        if (batchIterationVideoNodeId) break;
      }
      
      logger.info(`[Batch] Batch iteration video node:`, {
        nodeId: batchIterationVideoNodeId,
        nodeType: batchIterationVideoNodeId ? nodes.find(n => n.id === batchIterationVideoNodeId)?.type : 'not found'
      });
      
      // Aggregator types that should run after batch completes
      const aggregatorTypes = new Set([
        NodeType.MergeVideos,
        NodeType.AddMusicToVideo,
        NodeType.VoiceChanger,
      ]);
      
      // Now identify post-batch nodes: aggregators that receive from the batch iteration video node
      // OR any aggregator node that's downstream of the batch video node
      if (batchIterationVideoNodeId) {
        // Helper to check if a node is reachable from the batch video node
        const isDownstreamOfBatchVideo = (nodeId: string, visited = new Set<string>()): boolean => {
          if (visited.has(nodeId)) return false;
          visited.add(nodeId);
          
          if (nodeId === batchIterationVideoNodeId) return true;
          
          // Check incoming edges
          const inEdges = edges.filter(e => e.target === nodeId);
          for (const edge of inEdges) {
            if (isDownstreamOfBatchVideo(edge.source, visited)) return true;
          }
          return false;
        };
        
        for (const node of nodes) {
          if (!aggregatorTypes.has(node.type as NodeType)) continue;
          
          // Check if this aggregator is downstream of the batch video node
          const isDownstream = isDownstreamOfBatchVideo(node.id);
          
          logger.debug(`[Batch] Checking aggregator ${node.type} (${node.id}):`, {
            isDownstreamOfBatchVideo: isDownstream,
          });
          
          if (isDownstream) {
            postBatchNodeIds.add(node.id);
            logger.info(`[Batch] Marked ${node.type} (${node.id}) as post-batch node`);
            
            // Also add any nodes downstream of this post-batch node
            const findDownstream = (nodeId: string) => {
              const outEdges = edges.filter(e => e.source === nodeId);
              for (const edge of outEdges) {
                if (!postBatchNodeIds.has(edge.target)) {
                  const downstreamNode = nodes.find(n => n.id === edge.target);
                  postBatchNodeIds.add(edge.target);
                  logger.info(`[Batch] Marked downstream ${downstreamNode?.type} (${edge.target}) as post-batch node`);
                  findDownstream(edge.target);
                }
              }
            };
            findDownstream(node.id);
          }
        }
      }
      
      if (postBatchNodeIds.size > 0) {
        logger.info(`[Batch] Total ${postBatchNodeIds.size} post-batch nodes identified`);
      } else {
        logger.warn(`[Batch] No post-batch nodes identified. Aggregator nodes will run during each iteration.`);
      }
    }

    if (batchMode) {
      setIsBatchMode(true);
      setBatchProgress({ current: 0, total: scripts.length });
      setBatchResults([]);
      logger.info(`[Batch] Starting batch execution with ${scripts.length} scripts`);
    }

    // Track total nodes for progress calculation
    setTotalNodes(executionOrder.length);

    // Helper function to run a single workflow iteration
    const runSingleIteration = async (iterationIndex: number = 0): Promise<{ completed: number; failed: number }> => {
      // Update ScriptQueue node's currentIndex for this iteration and reset other nodes
      // Use a Promise to get the latest state after update
      let currentNodes: WorkflowNode[] = [];

      if (scriptQueueNode && batchMode) {
        logger.info(`[Batch] Starting iteration ${iterationIndex + 1} - clearing stale outputs from previous iteration`);
        await new Promise<void>((resolve) => {
          setNodes((prevNodes) => {
            currentNodes = prevNodes.map((n) =>
              n.id === scriptQueueNode.id
                ? {
                  ...n,
                  data: {
                    ...n.data,
                    currentIndex: iterationIndex,
                    isProcessing: true,
                  },
                }
                : {
                  ...n,
                  data: {
                    ...n.data,
                    status: "ready", // Reset status for re-execution
                    // Preserve outputs for static input nodes that don't change between iterations
                    // These nodes provide constant data (like reference images) used by all iterations
                    outputs: [NodeType.ScriptQueue, NodeType.ImageInput, NodeType.VideoInput, NodeType.Prompt].includes(n.type as NodeType)
                      ? n.data.outputs
                      : {}, // Clear outputs for nodes that need re-execution
                    error: undefined, // Clear any previous errors
                    // CRITICAL: Clear stale execution results from previous iteration
                    // These top-level fields can cause "Mixed URL and base64 formats" errors
                    // when downstream nodes read old data via fallback instead of fresh outputs
                    // BUT: Preserve them for static input nodes (ImageInput, VideoInput, Prompt)
                    ...([NodeType.ImageInput, NodeType.VideoInput, NodeType.Prompt].includes(n.type as NodeType) ? {} : {
                      video: undefined,
                      videoUrl: undefined,
                      gcsUrl: undefined,
                      image: undefined,
                      imageUrl: undefined,
                      images: undefined,
                      text: undefined,
                      response: undefined,
                      audio: undefined,
                      audioUrl: undefined,
                    }),
                  },
                }
            );
            // Schedule resolve after state update is processed
            setTimeout(resolve, 100);
            return currentNodes;
          });
        });
      } else {
        // Non-batch mode: use nodes directly
        currentNodes = nodes;
      }

      // Store executed node data
      const progress = new Map<string, string>();

      // Track nodes with their outputs during this iteration
      // This is crucial - we need to update this as nodes complete so downstream nodes can read outputs
      let trackedNodes = [...currentNodes];

      // Helper to get inputs using tracked nodes (not stale React state)
      const getTrackedInputs = (nodeId: string) => {
        const node = trackedNodes.find((n) => n.id === nodeId);
        if (!node) {
          logger.warn(`[getTrackedInputs] Node ${nodeId} not found in trackedNodes`);
          return {};
        }

        // Log the state of upstream nodes for debugging
        const incomingEdges = edges.filter((e) => e.target === nodeId);
        logger.debug(`[getTrackedInputs] Getting inputs for ${node.type} (${nodeId}):`, {
          incomingEdgeCount: incomingEdges.length,
          edges: incomingEdges.map((e) => ({
            sourceId: e.source,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
          })),
        });

        // Check upstream node outputs - enhanced debugging
        incomingEdges.forEach((edge) => {
          const sourceNode = trackedNodes.find((n) => n.id === edge.source);
          if (sourceNode) {
            const sourceHandle = edge.sourceHandle || 'default';
            const outputsObj = sourceNode.data.outputs as Record<string, unknown> | undefined;
            const outputValue = outputsObj?.[sourceHandle];
            const topLevelValue = (sourceNode.data as unknown as Record<string, unknown>)[sourceHandle];

            logger.debug(`[getTrackedInputs] 🔍 Upstream node ${sourceNode.type} (${edge.source}):`, {
              sourceHandle,
              outputsState: {
                exists: outputsObj !== undefined,
                isEmpty: outputsObj ? Object.keys(outputsObj).length === 0 : true,
                keys: outputsObj ? Object.keys(outputsObj) : [],
                hasRequestedKey: outputValue !== undefined,
              },
              topLevelState: {
                hasRequestedKey: topLevelValue !== undefined,
                valueType: topLevelValue !== undefined ? typeof topLevelValue : 'undefined',
              },
              resolution: outputValue !== undefined
                ? `✓ Found in outputs.${sourceHandle}`
                : topLevelValue !== undefined
                  ? `⚠️ Fallback to data.${sourceHandle}`
                  : `❌ Not found anywhere`,
              valuePreview: (outputValue || topLevelValue)
                ? String(outputValue || topLevelValue).substring(0, 60) + "..."
                : "NONE",
            });
          } else {
            logger.warn(`[getTrackedInputs] ❌ Source node ${edge.source} not found in trackedNodes!`);
          }
        });

        const inputs = gatherNodeInputs(node, trackedNodes, edges);
        logger.debug(`[getTrackedInputs] Final inputs for ${node.type}:`, {
          inputKeys: Object.keys(inputs),
        });
        return inputs;
      };

      // Group nodes by execution level for parallel execution
      const levels = groupNodesByLevel(executionOrder, trackedNodes, edges);

      let totalCompleted = 0;
      let totalFailed = 0;

      // Execute each level in sequence
      for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
        // Check if abort was requested
        if (abortRequested) {
          toast({
            title: "Workflow Aborted",
            description: "Execution stopped by user",
            variant: "destructive",
          });
          break;
        }

        // Filter out post-batch nodes during batch iterations - they run after all iterations
        const levelNodes = levels[levelIndex].filter(n => !postBatchNodeIds.has(n.id));

        // Skip this level if all nodes were filtered out
        if (levelNodes.length === 0) {
          logger.debug(`[Execution] Skipping level ${levelIndex} - all nodes are post-batch`);
          continue;
        }

        // Log tracked nodes state at the start of each level
        logger.debug(`[Execution] 📊 Starting Level ${levelIndex}/${levels.length - 1}:`, {
          nodesInLevel: levelNodes.map((n) => ({ id: n.id, type: n.type })),
          skippedPostBatchNodes: levels[levelIndex].filter(n => postBatchNodeIds.has(n.id)).map(n => ({ id: n.id, type: n.type })),
          trackedNodesWithOutputs: trackedNodes
            .filter((n) => n.data.outputs && Object.keys(n.data.outputs as object).length > 0)
            .map((n) => ({
              id: n.id,
              type: n.type,
              outputKeys: Object.keys(n.data.outputs as object),
              hasVideo: !!(n.data.outputs as any)?.video,
            })),
        });

        // Separate API-calling nodes from others
        // These nodes make backend HTTP calls and need sequential execution
        const apiNodes = levelNodes.filter((node) =>
          [
            NodeType.GenerateImage as string,
            NodeType.GenerateVideo as string,
            NodeType.LLM as string,
            NodeType.MergeVideos as string,
            NodeType.AddMusicToVideo as string,
            NodeType.VoiceChanger as string,
            NodeType.VideoWatermark as string,
            NodeType.VideoSegmentReplace as string,
            NodeType.GenerateMusic as string,
          ].includes(node.type as string),
        );
        const otherNodes = levelNodes.filter(
          (node) => !apiNodes.includes(node),
        );

        // Execute non-API nodes in parallel (they're fast)
        const otherResults = await Promise.allSettled(
          otherNodes.map(async (node) => {
            progress.set(node.id, "executing");
            setEdgeAnimated(node.id, true, false);
            updateNodeState(node.id, "executing");

            const inputs = getTrackedInputs(node.id);
            const validation = validateNodeInputs(node, inputs);
            if (!validation.valid) {
              return {
                nodeId: node.id,
                success: false,
                error: validation.error,
              };
            }

            const result = await executeNode(node, inputs);

            // ✅ CRITICAL FIX: Update trackedNodes array synchronously
            // This ensures downstream nodes see the latest outputs immediately
            if (result.success && result.data) {
              const updatedOutputs = result.data.outputs || result.data;

              trackedNodes = trackedNodes.map((n) =>
                n.id === node.id
                  ? {
                    ...n,
                    data: {
                      ...n.data,
                      outputs: updatedOutputs,
                      // Also set top-level fields for backward compatibility
                      ...updatedOutputs,
                    },
                  }
                  : n,
              );

              logger.debug(
                "[Execution] ✓ Synchronously updated non-API node outputs:",
                {
                  nodeId: node.id,
                  nodeType: node.type,
                  outputKeys: Object.keys(updatedOutputs),
                },
              );
            }

            return {
              nodeId: node.id,
              ...result,
            };
          }),
        );

        // Execute API nodes sequentially (no delays)
        const apiResults = [];
        for (const node of apiNodes) {
          progress.set(node.id, "executing");
          setEdgeAnimated(node.id, true, false);
          updateNodeState(node.id, "executing");
          setExecutionProgress(new Map(progress));

          const inputs = getTrackedInputs(node.id);

          // Diagnostic log for input gathering verification
          logger.debug(`[Execution] Gathered inputs for ${node.type}:`, {
            nodeId: node.id,
            inputKeys: Object.keys(inputs),
            first_frame: inputs.first_frame
              ? {
                type: typeof inputs.first_frame,
                length: inputs.first_frame?.length || 0,
                preview:
                  typeof inputs.first_frame === "string"
                    ? inputs.first_frame.substring(0, 50) + "..."
                    : inputs.first_frame,
                isDataUrl:
                  typeof inputs.first_frame === "string" &&
                  inputs.first_frame.startsWith("data:"),
              }
              : "MISSING",
            last_frame: inputs.last_frame ? "present" : "missing",
            reference_images: inputs.reference_images
              ? Array.isArray(inputs.reference_images)
                ? `array[${inputs.reference_images.length}]`
                : "single"
              : "missing",
            video: inputs.video
              ? {
                type: typeof inputs.video,
                length: inputs.video?.length || 0,
                isDataUrl:
                  typeof inputs.video === "string" &&
                  inputs.video.startsWith("data:"),
              }
              : "missing",
          });

          const validation = validateNodeInputs(node, inputs);

          let result;
          if (!validation.valid) {
            result = {
              status: "fulfilled" as const,
              value: {
                nodeId: node.id,
                success: false,
                error: validation.error,
              },
            };
          } else {
            try {
              const execResult = await executeNode(node, inputs);

              // ✅ CRITICAL FIX: Update trackedNodes array synchronously for API nodes
              // This ensures downstream nodes see the latest outputs immediately
              if (execResult.success && execResult.data) {
                const updatedOutputs =
                  execResult.data.outputs || execResult.data;

                // Enhanced logging to trace output structure
                logger.debug(
                  "[Execution] 📦 execResult.data structure:",
                  {
                    nodeId: node.id,
                    nodeType: node.type,
                    hasNestedOutputs: !!execResult.data.outputs,
                    nestedOutputsKeys: execResult.data.outputs ? Object.keys(execResult.data.outputs) : [],
                    topLevelDataKeys: Object.keys(execResult.data),
                    videoInOutputs: !!execResult.data.outputs?.video,
                    videoInTopLevel: !!execResult.data.video,
                    videoValuePreview: (execResult.data.outputs?.video || execResult.data.video)
                      ? String(execResult.data.outputs?.video || execResult.data.video).substring(0, 80) + "..."
                      : "NONE",
                  },
                );

                trackedNodes = trackedNodes.map((n) =>
                  n.id === node.id
                    ? {
                      ...n,
                      data: {
                        ...n.data,
                        outputs: updatedOutputs,
                        // Also set top-level fields for backward compatibility
                        ...updatedOutputs,
                      },
                    }
                    : n,
                );

                // Verify the update was applied correctly
                const updatedNode = trackedNodes.find((n) => n.id === node.id);
                logger.debug(
                  "[Execution] ✓ Verified trackedNodes update:",
                  {
                    nodeId: node.id,
                    nodeType: node.type,
                    updatedOutputKeys: updatedNode?.data.outputs ? Object.keys(updatedNode.data.outputs) : [],
                    hasVideoInOutputs: !!updatedNode?.data.outputs?.video,
                    hasVideoTopLevel: !!(updatedNode?.data as any)?.video,
                    trackedNodesCount: trackedNodes.length,
                  },
                );
              }

              result = {
                status: "fulfilled" as const,
                value: {
                  nodeId: node.id,
                  ...execResult,
                },
              };
            } catch (error) {
              result = {
                status: "rejected" as const,
                reason: error,
              };
            }
          }

          apiResults.push(result);
        }

        // Process results from both parallel and sequential execution
        const allResults = [
          ...otherResults.map((result, index) => ({
            result,
            node: otherNodes[index],
          })),
          ...apiResults.map((result, index) => ({
            result,
            node: apiNodes[index],
          })),
        ];

        allResults.forEach(({ result, node }) => {
          if (result.status === "fulfilled") {
            if (result.value.success) {
              progress.set(node.id, "completed");

              // CRITICAL FIX: Preserve the outputs structure from result.value.data
              // If the execution result already has an outputs property (like GenerateImage does),
              // use that. Otherwise, use the entire data object as outputs for backward compatibility.
              const updateData = {
                ...result.value.data,
                outputs: result.value.data.outputs || result.value.data,
              };

              logger.debug("[Workflow] Updating node state:", {
                nodeId: node.id,
                nodeType: node.type,
                resultData: result.value.data,
                updateData: {
                  topLevel: {
                    hasImageUrl: !!updateData.imageUrl,
                    hasImage: !!updateData.image,
                    hasImages: !!updateData.images,
                  },
                  outputs: {
                    hasOutputs: !!updateData.outputs,
                    outputsKeys: updateData.outputs
                      ? Object.keys(updateData.outputs)
                      : [],
                    outputsHasImage: !!updateData.outputs?.image,
                    outputsHasImages: !!updateData.outputs?.images,
                    outputsHasImageUrl: !!updateData.outputs?.imageUrl,
                    outputsImagePreview: updateData.outputs?.image
                      ? updateData.outputs.image.substring(0, 50)
                      : "none",
                  },
                },
              });

              // Flash completion, then stop animation
              setEdgeAnimated(node.id, false, true);
              updateNodeState(node.id, "completed", updateData);

              // Clear completion flash after 500ms
              setTimeout(() => {
                setEdgeAnimated(node.id, false, false);
              }, 500);

              // Verify state update timing
              logger.debug("[Execution] State update timing check:", {
                nodeId: node.id,
                immediateNodeData: nodes.find((n) => n.id === node.id)?.data
                  ?.outputs,
                updateDataOutputs: updateData.outputs,
                areEqual:
                  JSON.stringify(
                    nodes.find((n) => n.id === node.id)?.data?.outputs,
                  ) === JSON.stringify(updateData.outputs),
              });

              // Diagnostic log for data flow verification
              logger.debug(`[Execution] ✓ Node completed:`, {
                nodeId: node.id,
                nodeType: node.type,
                hasOutputs: !!updateData.outputs,
                outputKeys: updateData.outputs
                  ? Object.keys(updateData.outputs)
                  : [],
                outputSample:
                  updateData.outputs?.image?.substring(0, 50) ||
                  updateData.outputs?.video?.substring(0, 50) ||
                  updateData.outputs?.images?.[0]?.substring(0, 50) ||
                  "No image/video output",
              });

              totalCompleted++;
            } else {
              progress.set(node.id, "error");
              setEdgeAnimated(node.id, false, false);
              updateNodeState(node.id, "error", { error: result.value.error });
              totalFailed++;

              toast({
                title: "Node Execution Failed",
                description: `${node.data.label || node.type}: ${result.value.error}`,
                variant: "destructive",
              });
            }
          } else {
            // Promise rejected
            progress.set(node.id, "error");
            setEdgeAnimated(node.id, false, false);
            updateNodeState(node.id, "error", { error: String(result.reason) });
            totalFailed++;

            toast({
              title: "Node Execution Error",
              description: `${node.data.label || node.type}: ${result.reason}`,
              variant: "destructive",
            });
          }
        });

        setExecutionProgress(new Map(progress));
      }

      return { completed: totalCompleted, failed: totalFailed };
    }; // End of runSingleIteration

    try {
      // Execute workflow (with batch mode if ScriptQueue exists)
      if (batchMode && scripts.length > 0) {
        // Batch execution mode
        let batchCompleted = 0;
        let batchFailed = 0;
        const results: Array<{ index: number; success: boolean }> = [];
        const collectedResults: BatchIterationResult[] = [];

        // Find terminal nodes (nodes with no outgoing edges) for collecting outputs
        const nodesWithOutgoingEdges = new Set(edges.map(e => e.source));
        const terminalNodes = nodes.filter(n =>
          !nodesWithOutgoingEdges.has(n.id) &&
          n.id !== scriptQueueNode?.id &&
          n.data.enabled !== false
        );
        logger.info(`[Batch] Terminal nodes for output collection:`, terminalNodes.map(n => ({ id: n.id, type: n.type })));

        // Clear any previous collected results
        if (scriptQueueNode) {
          setNodes((prevNodes) =>
            prevNodes.map((n) =>
              n.id === scriptQueueNode.id
                ? { ...n, data: { ...n.data, collectedResults: [] } }
                : n
            )
          );
        }

        // Circuit breaker: stop batch if too many consecutive failures
        const MAX_CONSECUTIVE_FAILURES = 3;
        let consecutiveFailures = 0;

        for (let i = 0; i < scripts.length; i++) {
          // Check if abort was requested
          if (abortRequested) {
            toast({
              title: "Batch Aborted",
              description: `Stopped after ${i} of ${scripts.length} scripts`,
              variant: "destructive",
            });
            break;
          }

          // Circuit breaker check
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            logger.error(`[Batch] Circuit breaker triggered: ${consecutiveFailures} consecutive failures`);
            toast({
              title: "Batch Stopped",
              description: `Stopped after ${consecutiveFailures} consecutive failures. There may be a persistent issue. Completed ${batchCompleted} of ${scripts.length} scripts.`,
              variant: "destructive",
            });
            break;
          }

          setBatchProgress({ current: i + 1, total: scripts.length });
          logger.info(`[Batch] Running script ${i + 1} of ${scripts.length}`);

          toast({
            title: `Batch Progress`,
            description: `Processing script ${i + 1} of ${scripts.length}...`,
          });

          // Add delay between iterations to avoid rate limiting (except for first iteration)
          if (i > 0) {
            logger.debug(`[Batch] Waiting 2s before next iteration to avoid rate limits`);
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }

          const result = await runSingleIteration(i);

          // Collect output from the batch iteration video node after iteration completes
          // This is the node that produces video for each iteration (e.g., GenerateVideo)
          let collectedVideoUrl: string | undefined;
          let iterationError: string | undefined;

          if (result.failed === 0) {
            batchCompleted++;
            consecutiveFailures = 0; // Reset circuit breaker on success
            results.push({ index: i, success: true });

            // Get current nodes state to find the batch iteration video node's output
            await new Promise<void>((resolve) => {
              setNodes((currentNodes) => {
                // CRITICAL FIX: Look for video output from the batch iteration video node specifically
                // This is the node that's connected to ScriptQueue and produces videos each iteration
                if (batchIterationVideoNodeId) {
                  const batchVideoNode = currentNodes.find(n => n.id === batchIterationVideoNodeId);
                  if (batchVideoNode?.data) {
                    const nodeData = batchVideoNode.data as any;
                    // Prefer GCS URL for downstream processing (avoids 32MB limit)
                    // Fall back to data URL or outputs.video
                    const videoUrl = nodeData.gcsUrl || nodeData.outputs?.video || nodeData.videoUrl || nodeData.video;
                    if (videoUrl) {
                      collectedVideoUrl = videoUrl;
                      logger.info(`[Batch] ✓ Collected video from batch node ${batchVideoNode.type}:`, {
                        iteration: i + 1,
                        urlPreview: videoUrl.substring(0, 100),
                        isGcsUrl: videoUrl.startsWith('https://storage.googleapis.com'),
                      });
                    } else {
                      logger.warn(`[Batch] ⚠️ No video output found in batch node ${batchVideoNode.type}`, {
                        iteration: i + 1,
                        availableKeys: Object.keys(nodeData),
                        outputsKeys: nodeData.outputs ? Object.keys(nodeData.outputs) : [],
                      });
                    }
                  }
                }
                
                // Fallback: If no batch video node or no output, check terminal nodes
                if (!collectedVideoUrl) {
                  const priorityOrder = [NodeType.GenerateVideo, NodeType.AddMusicToVideo, NodeType.MergeVideos];
                  
                  for (const nodeType of priorityOrder) {
                    // Look in all nodes, not just terminalNodes (which might exclude post-batch nodes)
                    const videoNode = currentNodes.find(n => 
                      n.type === nodeType && 
                      !postBatchNodeIds.has(n.id) // Skip post-batch nodes
                    );
                    if (videoNode?.data) {
                      const nodeData = videoNode.data as any;
                      const videoUrl = nodeData.gcsUrl || nodeData.outputs?.video || nodeData.outputVideoUrl || nodeData.videoUrl;
                      if (videoUrl) {
                        collectedVideoUrl = videoUrl;
                        logger.info(`[Batch] Collected video from fallback ${nodeType}:`, videoUrl.substring(0, 100));
                        break;
                      }
                    }
                  }
                }

                resolve();
                return currentNodes; // Return unchanged
              });
            });
          } else {
            batchFailed++;
            consecutiveFailures++; // Increment circuit breaker counter
            results.push({ index: i, success: false });
            iterationError = `${result.failed} node(s) failed`;
            logger.warn(`[Batch] Iteration ${i + 1} failed (consecutive failures: ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
          }

          // Add to collected results
          const iterationResult: BatchIterationResult = {
            index: i,
            scriptPreview: scripts[i].substring(0, 50) + (scripts[i].length > 50 ? "..." : ""),
            success: result.failed === 0,
            videoUrl: collectedVideoUrl,
            error: iterationError,
            timestamp: Date.now(),
          };
          collectedResults.push(iterationResult);

          // Update ScriptQueue with collected results (incrementally)
          if (scriptQueueNode) {
            setNodes((prevNodes) =>
              prevNodes.map((n) =>
                n.id === scriptQueueNode.id
                  ? { ...n, data: { ...n.data, collectedResults: [...collectedResults] } }
                  : n
              )
            );
          }

          setBatchResults([...results]);

          // Small delay between iterations to avoid overwhelming APIs
          if (i < scripts.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        // Mark ScriptQueue as done (keep collectedResults)
        if (scriptQueueNode) {
          setNodes((prevNodes) =>
            prevNodes.map((n) =>
              n.id === scriptQueueNode.id
                ? { ...n, data: { ...n.data, isProcessing: false, collectedResults } }
                : n
            )
          );
        }

        // ========== POST-BATCH NODE EXECUTION ==========
        // Execute aggregator nodes (MergeVideos, AddMusicToVideo, VoiceChanger) that were skipped
        // during batch iterations. These nodes need outputs from ALL iterations.
        if (postBatchNodeIds.size > 0 && collectedResults.length > 0) {
          logger.info(`[Batch] Starting post-batch execution for ${postBatchNodeIds.size} nodes`);

          // Collect video URLs from successful iterations
          const batchVideoUrls = collectedResults
            .filter(r => r.success && r.videoUrl)
            .map(r => r.videoUrl as string);

          logger.info(`[Batch] Collected ${batchVideoUrls.length} video URLs from batch iterations`);

          if (batchVideoUrls.length >= 2) {
            // Find and execute post-batch nodes in dependency order
            const postBatchNodes = nodes.filter(n => postBatchNodeIds.has(n.id));

            // Sort by dependency order (nodes with no post-batch dependencies first)
            const sortedPostBatchNodes = [...postBatchNodes].sort((a, b) => {
              const aHasPostBatchInput = edges.some(e => e.target === a.id && postBatchNodeIds.has(e.source));
              const bHasPostBatchInput = edges.some(e => e.target === b.id && postBatchNodeIds.has(e.source));
              return (aHasPostBatchInput ? 1 : 0) - (bHasPostBatchInput ? 1 : 0);
            });

            // Track outputs from post-batch execution
            let postBatchTrackedNodes = [...nodes];

            for (const postBatchNode of sortedPostBatchNodes) {
              logger.info(`[Batch] Executing post-batch node: ${postBatchNode.type} (${postBatchNode.id})`);

              // Update node state to executing
              updateNodeState(postBatchNode.id, "executing");
              setEdgeAnimated(postBatchNode.id, true, false);

              // Build inputs for this post-batch node
              let postBatchInputs: Record<string, any> = {};

              if (postBatchNode.type === NodeType.MergeVideos) {
                // MergeVideos gets video URLs from batch iterations
                // Map video1, video2, video3... to the collected URLs
                batchVideoUrls.forEach((url, idx) => {
                  if (idx < 6) {
                    postBatchInputs[`video${idx + 1}`] = url;
                  }
                });
                logger.info(`[Batch] MergeVideos inputs:`, {
                  videoCount: Object.keys(postBatchInputs).length,
                  firstVideoPreview: batchVideoUrls[0]?.substring(0, 80),
                });
              } else {
                // Other post-batch nodes (AddMusicToVideo, VoiceChanger) get inputs from
                // their connected upstream nodes (which might be other post-batch nodes)
                postBatchInputs = gatherNodeInputs(postBatchNode, postBatchTrackedNodes, edges);
              }

              try {
                const result = await executeNode(postBatchNode, postBatchInputs);

                if (result.success && result.data) {
                  const updatedOutputs = result.data.outputs || result.data;

                  // Update tracked nodes with this output
                  postBatchTrackedNodes = postBatchTrackedNodes.map(n =>
                    n.id === postBatchNode.id
                      ? { ...n, data: { ...n.data, outputs: updatedOutputs, ...updatedOutputs } }
                      : n
                  );

                  // Update React state
                  updateNodeState(postBatchNode.id, "completed", { ...result.data, outputs: updatedOutputs });
                  setEdgeAnimated(postBatchNode.id, false, true);
                  setTimeout(() => setEdgeAnimated(postBatchNode.id, false, false), 500);

                  logger.info(`[Batch] ✓ Post-batch node ${postBatchNode.type} completed successfully`);
                } else {
                  updateNodeState(postBatchNode.id, "error", { error: result.error });
                  setEdgeAnimated(postBatchNode.id, false, false);
                  logger.error(`[Batch] ✗ Post-batch node ${postBatchNode.type} failed:`, result.error);
                }
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : "Unknown error";
                updateNodeState(postBatchNode.id, "error", { error: errorMsg });
                setEdgeAnimated(postBatchNode.id, false, false);
                logger.error(`[Batch] ✗ Post-batch node ${postBatchNode.type} threw error:`, errorMsg);
              }
            }

            // Find the final output from the last post-batch node
            const lastPostBatchNode = sortedPostBatchNodes[sortedPostBatchNodes.length - 1];
            const finalNode = postBatchTrackedNodes.find(n => n.id === lastPostBatchNode?.id);
            const finalVideoUrl = (finalNode?.data as any)?.outputVideoUrl || 
                                  (finalNode?.data as any)?.outputs?.video ||
                                  (finalNode?.data as any)?.videoUrl;
            
            if (finalVideoUrl) {
              logger.info(`[Batch] 🎬 Final output from ${lastPostBatchNode?.type}:`, finalVideoUrl.substring(0, 100));
              
              // Store the final merged video in ScriptQueue for easy access
              if (scriptQueueNode) {
                setNodes((prevNodes) =>
                  prevNodes.map((n) =>
                    n.id === scriptQueueNode.id
                      ? { ...n, data: { ...n.data, finalVideoUrl, finalVideoNodeType: lastPostBatchNode?.type } }
                      : n
                  )
                );
              }
            }

            toast({
              title: "Post-Batch Processing Complete",
              description: `Merged ${batchVideoUrls.length} videos → ${sortedPostBatchNodes.map(n => n.type).join(' → ')}`,
            });
          } else {
            // Not enough videos collected - provide helpful error message
            const failedIterations = collectedResults.filter(r => !r.success).length;
            const iterationsWithVideo = collectedResults.filter(r => r.videoUrl).length;
            
            logger.warn(`[Batch] Skipping post-batch nodes:`, {
              totalIterations: collectedResults.length,
              failedIterations,
              iterationsWithVideo,
              videosCollected: batchVideoUrls.length,
              collectedResultsDetail: collectedResults.map(r => ({
                index: r.index,
                success: r.success,
                hasVideo: !!r.videoUrl,
                videoUrlPreview: r.videoUrl ? r.videoUrl.substring(0, 60) : 'none',
              })),
            });

            // Mark post-batch nodes as skipped with detailed error
            const errorMessage = batchVideoUrls.length === 0
              ? `No videos collected from ${collectedResults.length} iteration(s). Check if GenerateVideo completed successfully.`
              : batchVideoUrls.length === 1
                ? `Only 1 video collected (need at least 2 to merge). ${failedIterations} iteration(s) failed.`
                : `Only ${batchVideoUrls.length} video(s) collected from batch.`;
            
            postBatchNodeIds.forEach(nodeId => {
              updateNodeState(nodeId, "error", { error: errorMessage });
            });
          }
        }

        // Show batch completion summary
        toast({
          title: "Batch Completed",
          description: `${batchCompleted} of ${scripts.length} scripts succeeded${batchFailed > 0 ? `, ${batchFailed} failed` : ""}`,
          variant: batchFailed > 0 ? "destructive" : "default",
        });

        setIsBatchMode(false);
      } else {
        // Normal single execution mode
        const result = await runSingleIteration(0);

        // Show completion summary
        if (result.failed === 0) {
          toast({
            title: "Workflow Completed",
            description: `All ${result.completed} nodes executed successfully!`,
          });
        } else {
          toast({
            title: "Workflow Completed with Errors",
            description: `${result.completed} succeeded, ${result.failed} failed`,
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      toast({
        title: "Workflow Error",
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
      setAbortRequested(false);
      setIsBatchMode(false);
    }
  }, [
    isExecuting,
    nodes,
    edges,
    getExecutionOrder,
    getNodeInputs,
    executeNode,
    updateNodeState,
    abortRequested,
    setNodes,
  ]);

  // Reset workflow state
  const resetWorkflow = useCallback(() => {
    setExecutionProgress(new Map());
    setTotalNodes(0);
    setNodes((prevNodes) =>
      prevNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          status: "ready",
          isGenerating: false,
        },
      })),
    );
  }, [setNodes]);

  // Execute a single node with automatic dependency resolution
  const executeSingleNode = useCallback(
    async (nodeId: string) => {
      // ✅ CRITICAL FIX: Create a local mutable copy of nodes
      // This allows us to synchronously update node outputs so downstream nodes
      // can see them immediately, without waiting for React state to update
      let currentNodes = [...nodes];

      const targetNode = currentNodes.find((n) => n.id === nodeId);

      if (!targetNode) {
        toast({
          title: "Node Not Found",
          description: "The selected node could not be found.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Executing Node",
        description: `Running ${targetNode.data.label || targetNode.type}...`,
      });

      try {
        // Find upstream dependencies
        const dependencies = findUpstreamDependencies(nodeId, currentNodes, edges);

        logger.debug(
          `[Single Node Execution] Target: ${nodeId}, Dependencies: ${dependencies.join(", ") || "none"}`,
        );

        // Execute dependencies first (only if they don't have outputs already)
        for (const depNodeId of dependencies) {
          const depNode = currentNodes.find((n) => n.id === depNodeId);
          if (!depNode) continue;

          // Check if this dependency already has outputs - if so, skip execution
          const hasExistingOutputs =
            depNode.data.outputs &&
            Object.keys(depNode.data.outputs).length > 0;
          const isCompleted = depNode.data.status === "completed";
          const isInputNode =
            depNode.type === NodeType.Prompt ||
            depNode.type === NodeType.ImageInput;

          logger.debug(
            `[Single Node Execution] Checking dependency ${depNodeId}:`,
            {
              nodeType: depNode.type,
              status: depNode.data.status,
              hasOutputsProperty: !!depNode.data.outputs,
              outputsKeys: depNode.data.outputs
                ? Object.keys(depNode.data.outputs)
                : [],
              hasExistingOutputs,
              isCompleted,
              isInputNode,
              willSkip: hasExistingOutputs && (isCompleted || isInputNode),
              allDataKeys: Object.keys(depNode.data),
            },
          );

          // Skip if: (1) has outputs AND completed, OR (2) has outputs AND is an input node
          // Input nodes (Prompt, ImageInput) set outputs when user enters data, but don't have "completed" status
          if (hasExistingOutputs && (isCompleted || isInputNode)) {
            logger.debug(
              `[Single Node Execution] ✓ Skipping ${depNodeId} - already has outputs`,
              {
                outputs: depNode.data.outputs,
                reason: isInputNode ? "input node with data" : "completed node",
              },
            );
            continue; // Skip this dependency, use existing outputs
          }

          logger.debug(
            `[Single Node Execution] ⚠️ Re-executing dependency ${depNodeId}`,
            {
              reason: !hasExistingOutputs
                ? "no outputs"
                : "not completed and not input node",
              hasOutputs: hasExistingOutputs,
              isCompleted,
              isInputNode,
            },
          );

          setEdgeAnimated(depNodeId, true, false);
          updateNodeState(depNodeId, "executing");

          // ✅ Use gatherNodeInputs directly with currentNodes (not stale closure)
          const inputs = gatherNodeInputs(depNode, currentNodes, edges);
          const validation = validateNodeInputs(depNode, inputs);

          if (!validation.valid) {
            setEdgeAnimated(depNodeId, false, false);
            updateNodeState(depNodeId, "error", { error: validation.error });
            throw new Error(`Dependency failed: ${validation.error}`);
          }

          const result = await executeNode(depNode, inputs);

          if (!result.success) {
            setEdgeAnimated(depNodeId, false, false);
            updateNodeState(depNodeId, "error", { error: result.error });
            throw new Error(`Dependency failed: ${result.error}`);
          }

          // Preserve outputs structure (same as main workflow execution)
          const updateData = {
            ...result.data,
            outputs: result.data.outputs || result.data,
          };

          // ✅ CRITICAL FIX: Synchronously update currentNodes so downstream nodes
          // can see this dependency's outputs immediately
          currentNodes = currentNodes.map((n) =>
            n.id === depNodeId
              ? {
                ...n,
                data: {
                  ...n.data,
                  ...updateData,
                  outputs: updateData.outputs,
                  status: "completed",
                },
              }
              : n,
          );

          logger.debug(
            "[Single Node Execution] ✓ Synchronously updated dependency outputs:",
            {
              nodeId: depNodeId,
              nodeType: depNode.type,
              outputKeys: Object.keys(updateData.outputs || {}),
            },
          );

          setEdgeAnimated(depNodeId, false, true);
          updateNodeState(depNodeId, "completed", updateData);
          setTimeout(() => {
            setEdgeAnimated(depNodeId, false, false);
          }, 500);
        }

        // Execute target node
        // Get the latest version of the target node from currentNodes
        // (in case it was updated during dependency resolution)
        const latestTargetNode = currentNodes.find((n) => n.id === nodeId) || targetNode;

        setEdgeAnimated(nodeId, true, false);
        updateNodeState(nodeId, "executing");

        // ✅ Use gatherNodeInputs directly with currentNodes (not stale closure)
        const inputs = gatherNodeInputs(latestTargetNode, currentNodes, edges);
        const validation = validateNodeInputs(latestTargetNode, inputs);

        if (!validation.valid) {
          setEdgeAnimated(nodeId, false, false);
          updateNodeState(nodeId, "error", { error: validation.error });
          toast({
            title: "Validation Error",
            description: validation.error,
            variant: "destructive",
          });
          return;
        }

        const result = await executeNode(latestTargetNode, inputs);

        if (!result.success) {
          setEdgeAnimated(nodeId, false, false);
          updateNodeState(nodeId, "error", { error: result.error });
          toast({
            title: "Execution Failed",
            description: result.error,
            variant: "destructive",
          });
          return;
        }

        // Preserve outputs structure (same as main workflow execution)
        const updateData = {
          ...result.data,
          outputs: result.data.outputs || result.data,
        };

        setEdgeAnimated(nodeId, false, true);
        updateNodeState(nodeId, "completed", updateData);
        setTimeout(() => {
          setEdgeAnimated(nodeId, false, false);
        }, 500);

        toast({
          title: "Success",
          description: `${latestTargetNode.data.label || latestTargetNode.type} executed successfully!`,
        });
      } catch (error) {
        console.error("[Single Node Execution] Error:", error);
        toast({
          title: "Execution Error",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [nodes, edges, executeNode, updateNodeState, setEdgeAnimated],
  );

  return {
    executeWorkflow,
    abortWorkflow,
    resetWorkflow,
    executeSingleNode,
    isExecuting,
    executionProgress,
    totalNodes,
    // Batch execution state
    isBatchMode,
    batchProgress,
    batchResults,
  };
}
