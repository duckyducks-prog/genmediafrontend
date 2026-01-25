import { logger } from "@/lib/logger";
import { useCallback, useState } from "react";
import {
  WorkflowNode,
  WorkflowEdge,
  NodeType,
  validateMutualExclusion,
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

interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
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
      try {
        switch (node.type) {
          // INPUT NODES
          case NodeType.Prompt: {
            const prompt = (node.data as any).prompt || "";
            return { success: true, data: { text: prompt } };
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

            logger.debug("[VideoInput] Starting execution:", {
              hasVideoUrl: !!videoUrl,
              videoUrlType: videoUrl ? (videoUrl.startsWith('data:') ? 'dataUrl' : videoUrl.startsWith('blob:') ? 'blobUrl' : videoUrl.startsWith('http') ? 'httpUrl' : 'unknown') : 'none',
              hasVideoRef: !!videoRef,
            });

            // If videoUrl is an HTTP URL (GCS) or blob URL, fetch and convert to data URL
            if (videoUrl && !videoUrl.startsWith("data:") && (videoUrl.startsWith("http") || videoUrl.startsWith("blob:"))) {
              logger.debug(
                "[VideoInput] videoUrl is a fetchable URL, converting to data URI:",
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
                  "[VideoInput] ✓ Converted to data URL, length:",
                  videoUrl.length,
                );

                // Update node with resolved data URL
                updateNodeState(node.id, node.data.status || "ready", {
                  videoUrl,
                  outputs: { video: videoUrl },
                });
              } catch (error) {
                console.error("[VideoInput] ❌ Failed to fetch URL:", error);
                // Try falling back to videoRef resolution
                if (videoRef) {
                  logger.debug("[VideoInput] Falling back to videoRef resolution");
                  videoUrl = null; // Clear to trigger resolution below
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
                videoUrl = await resolveAssetToDataUrl(videoRef);
                logger.debug(
                  "[VideoInput] ✓ Resolved to data URL, length:",
                  videoUrl.length,
                );

                // Update node with resolved URL
                updateNodeState(node.id, node.data.status || "ready", {
                  videoUrl,
                  outputs: { video: videoUrl },
                });
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

            return {
              success: true,
              data: {
                video: videoUrl,
                outputs: { video: videoUrl },
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
            const upstreamFilters: FilterConfig[] = inputs.filters || [];

            const brightness = (node.data as any).brightness ?? 1.0;
            const contrast = (node.data as any).contrast ?? 1.0;

            logger.debug("[BrightnessContrast] Execution:", {
              hasImage: !!imageInput,
              upstreamFilterCount: upstreamFilters.length,
              brightness,
              contrast,
            });

            if (!imageInput) {
              return { success: false, error: "No image connected" };
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
                filters: outputFilters,
                outputs: {
                  image: imageInput,
                  filters: outputFilters,
                },
              },
            };
          }

          case NodeType.Blur: {
            const imageInput = inputs.image || null;
            const upstreamFilters: FilterConfig[] = inputs.filters || [];

            const strength = (node.data as any).strength ?? 8;
            const quality = (node.data as any).quality ?? 4;

            logger.debug("[Blur] Execution:", {
              hasImage: !!imageInput,
              upstreamFilterCount: upstreamFilters.length,
              strength,
              quality,
            });

            if (!imageInput) {
              return { success: false, error: "No image connected" };
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
                filters: outputFilters,
                outputs: {
                  image: imageInput,
                  filters: outputFilters,
                },
              },
            };
          }

          case NodeType.Sharpen: {
            const imageInput = inputs.image || null;
            const upstreamFilters: FilterConfig[] = inputs.filters || [];

            const gamma = (node.data as any).gamma ?? 0;

            logger.debug("[Sharpen] Execution:", {
              hasImage: !!imageInput,
              upstreamFilterCount: upstreamFilters.length,
              gamma,
            });

            if (!imageInput) {
              return { success: false, error: "No image connected" };
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
                filters: outputFilters,
                outputs: {
                  image: imageInput,
                  filters: outputFilters,
                },
              },
            };
          }

          case NodeType.HueSaturation: {
            const imageInput = inputs.image || null;
            const upstreamFilters: FilterConfig[] = inputs.filters || [];

            const hue = (node.data as any).hue ?? 0;
            const saturation = (node.data as any).saturation ?? 0;

            logger.debug("[HueSaturation] Execution:", {
              hasImage: !!imageInput,
              upstreamFilterCount: upstreamFilters.length,
              hue,
              saturation,
            });

            if (!imageInput) {
              return { success: false, error: "No image connected" };
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
                filters: outputFilters,
                outputs: {
                  image: imageInput,
                  filters: outputFilters,
                },
              },
            };
          }

          case NodeType.Noise: {
            const imageInput = inputs.image || null;
            const upstreamFilters: FilterConfig[] = inputs.filters || [];

            const noise = (node.data as any).noise ?? 0.5;

            logger.debug("[Noise] Execution:", {
              hasImage: !!imageInput,
              upstreamFilterCount: upstreamFilters.length,
              noise,
            });

            if (!imageInput) {
              return { success: false, error: "No image connected" };
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
                filters: outputFilters,
                outputs: {
                  image: imageInput,
                  filters: outputFilters,
                },
              },
            };
          }

          case NodeType.FilmGrain: {
            const imageInput = inputs.image || null;
            const upstreamFilters: FilterConfig[] = inputs.filters || [];

            const intensity = (node.data as any).intensity ?? 50;
            const size = (node.data as any).size ?? 1;
            const shadows = (node.data as any).shadows ?? 30;
            const highlights = (node.data as any).highlights ?? 30;
            const midtonesBias = (node.data as any).midtonesBias ?? 80;

            logger.debug("[FilmGrain] Execution:", {
              hasImage: !!imageInput,
              upstreamFilterCount: upstreamFilters.length,
              intensity,
              size,
              shadows,
              highlights,
              midtonesBias,
            });

            if (!imageInput) {
              return { success: false, error: "No image connected" };
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
                filters: outputFilters,
                outputs: {
                  image: imageInput,
                  filters: outputFilters,
                },
              },
            };
          }

          case NodeType.Vignette: {
            const imageInput = inputs.image || null;
            const upstreamFilters: FilterConfig[] = inputs.filters || [];

            const size = (node.data as any).size ?? 0.5;
            const amount = (node.data as any).amount ?? 0.5;

            logger.debug("[Vignette] Execution:", {
              hasImage: !!imageInput,
              upstreamFilterCount: upstreamFilters.length,
              size,
              amount,
            });

            if (!imageInput) {
              return { success: false, error: "No image connected" };
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
                filters: outputFilters,
                outputs: {
                  image: imageInput,
                  filters: outputFilters,
                },
              },
            };
          }

          case NodeType.Crop: {
            const imageInput = inputs.image || null;
            const upstreamFilters: FilterConfig[] = inputs.filters || [];

            const x = (node.data as any).x ?? 0;
            const y = (node.data as any).y ?? 0;
            const width = (node.data as any).width ?? 512;
            const height = (node.data as any).height ?? 512;

            logger.debug("[Crop] Execution:", {
              hasImage: !!imageInput,
              upstreamFilterCount: upstreamFilters.length,
              x,
              y,
              width,
              height,
            });

            if (!imageInput) {
              return { success: false, error: "No image connected" };
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
                filters: outputFilters,
                outputs: {
                  image: imageInput,
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
                console.error("[GenerateMusic] API Error:", {
                  status: response.status,
                  statusText: response.statusText,
                  body: errorText,
                });
                throw new Error(`API error: ${response.status} - ${errorText}`);
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

              const response = await fetch(API_ENDPOINTS.elevenlabs.voiceChange, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  video_base64: videoInput.replace(/^data:video\/[^;]+;base64,/, ""),
                  voice_id: selectedVoiceId,
                }),
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
                console.error("[VoiceChanger] API Error:", {
                  status: response.status,
                  statusText: response.statusText,
                  body: errorText,
                });
                throw new Error(`API error: ${response.status} - ${errorText}`);
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
            // Get videos from input connectors
            const video1 = inputs.video1;
            const video2 = inputs.video2;
            const video3 = inputs.video3;
            const video4 = inputs.video4;

            // Collect all connected videos
            const rawVideos: (string | undefined)[] = [video1, video2, video3, video4].filter(Boolean);

            if (rawVideos.length < 2) {
              return { success: false, error: "At least 2 videos required to merge" };
            }

            logger.debug("[MergeVideos] Starting execution:", {
              videoCount: rawVideos.length,
              videoTypes: rawVideos.map(v => {
                if (!v) return 'undefined';
                if (v.startsWith('data:')) return 'dataUrl';
                if (v.startsWith('http://') || v.startsWith('https://')) return 'httpUrl';
                if (v.startsWith('blob:')) return 'blobUrl';
                return `unknown(${v.substring(0, 20)}...)`;
              }),
            });

            try {
              // Resolve all videos to data URLs (handles HTTP URLs, blob URLs from library)
              const resolvedVideos: string[] = [];
              for (let i = 0; i < rawVideos.length; i++) {
                const video = rawVideos[i];
                if (!video) {
                  logger.warn(`[MergeVideos] Video ${i + 1} is undefined, skipping`);
                  continue;
                }

                if (video.startsWith('data:video/') || video.startsWith('data:application/') || video.startsWith('data:')) {
                  // Already a data URL, use directly
                  resolvedVideos.push(video);
                  logger.debug(`[MergeVideos] Video ${i + 1} is already a data URL`);
                } else if (video.startsWith('http://') || video.startsWith('https://') || video.startsWith('blob:')) {
                  // HTTP URL or Blob URL - fetch and convert to data URL
                  logger.debug(`[MergeVideos] Video ${i + 1} is ${video.startsWith('blob:') ? 'blob' : 'HTTP'} URL, fetching...`);
                  try {
                    const response = await fetch(video, { mode: 'cors' });
                    if (!response.ok) {
                      throw new Error(`Failed to fetch video: ${response.status}`);
                    }
                    const blob = await response.blob();
                    const dataUrl = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result as string);
                      reader.onerror = () => reject(new Error('Failed to read video blob'));
                      reader.readAsDataURL(blob);
                    });
                    resolvedVideos.push(dataUrl);
                    logger.debug(`[MergeVideos] Video ${i + 1} converted to data URL (${dataUrl.length} chars)`);
                  } catch (fetchError) {
                    logger.error(`[MergeVideos] Failed to fetch video ${i + 1}:`, fetchError);
                    return { success: false, error: `Failed to fetch video ${i + 1}: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}` };
                  }
                } else {
                  // Unknown format - log details for debugging
                  logger.error(`[MergeVideos] Video ${i + 1} has unknown format:`, video.substring(0, 100));
                  return { success: false, error: `Video ${i + 1} has invalid format (${video.substring(0, 30)}...). Please re-upload or re-select from library.` };
                }
              }

              if (resolvedVideos.length < 2) {
                return { success: false, error: "At least 2 valid videos required to merge" };
              }

              const user = auth.currentUser;
              const token = await user?.getIdToken();

              const response = await fetch(API_ENDPOINTS.video.merge, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  videos_base64: resolvedVideos.map(v => v.replace(/^data:video\/[^;]+;base64,/, "").replace(/^data:application\/[^;]+;base64,/, "")),
                }),
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
                  description: `Successfully merged ${resolvedVideos.length} videos`,
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
            let videoInput = inputs.video;
            let audioInput = inputs.audio;

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
              videoType: videoInput.startsWith('data:') ? 'dataUrl' : (videoInput.startsWith('http') || videoInput.startsWith('blob:')) ? 'fetchableUrl' : 'unknown',
              audioType: audioInput.startsWith('data:') ? 'dataUrl' : (audioInput.startsWith('http') || audioInput.startsWith('blob:')) ? 'fetchableUrl' : 'unknown',
              musicVolume,
              originalVolume,
            });

            try {
              // Resolve video to data URL if needed (handles HTTP URLs, blob URLs from library)
              if (videoInput.startsWith('http://') || videoInput.startsWith('https://') || videoInput.startsWith('blob:')) {
                logger.debug(`[AddMusicToVideo] Fetching video from ${videoInput.startsWith('blob:') ? 'blob' : 'HTTP'} URL...`);
                const response = await fetch(videoInput, { mode: 'cors' });
                if (!response.ok) {
                  throw new Error(`Failed to fetch video: ${response.status}`);
                }
                const blob = await response.blob();
                videoInput = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = () => reject(new Error('Failed to read video blob'));
                  reader.readAsDataURL(blob);
                });
                logger.debug(`[AddMusicToVideo] Video converted to data URL (${videoInput.length} chars)`);
              }

              // Resolve audio to data URL if needed
              if (audioInput.startsWith('http://') || audioInput.startsWith('https://') || audioInput.startsWith('blob:')) {
                logger.debug(`[AddMusicToVideo] Fetching audio from ${audioInput.startsWith('blob:') ? 'blob' : 'HTTP'} URL...`);
                const response = await fetch(audioInput, { mode: 'cors' });
                if (!response.ok) {
                  throw new Error(`Failed to fetch audio: ${response.status}`);
                }
                const blob = await response.blob();
                audioInput = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = () => reject(new Error('Failed to read audio blob'));
                  reader.readAsDataURL(blob);
                });
                logger.debug(`[AddMusicToVideo] Audio converted to data URL (${audioInput.length} chars)`);
              }

              const user = auth.currentUser;
              const token = await user?.getIdToken();

              const response = await fetch(API_ENDPOINTS.video.addMusic, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  video_base64: videoInput.replace(/^data:video\/[^;]+;base64,/, "").replace(/^data:application\/[^;]+;base64,/, ""),
                  audio_base64: audioInput.replace(/^data:audio\/[^;]+;base64,/, "").replace(/^data:application\/[^;]+;base64,/, ""),
                  music_volume: musicVolume,
                  original_volume: originalVolume,
                }),
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

                return {
                  success: true,
                  data: {
                    video: result.videoUrl,
                    videoUrl: result.videoUrl,
                    outputs: {
                      video: result.videoUrl, // ✓ Explicit for downstream connections
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

            // Apply filters to images before downloading (Layer 3 integration)
            if (mediaUrl && !isVideo && filters.length > 0) {
              logger.debug(
                "[Download] Applying",
                filters.length,
                "filters before download",
              );
              try {
                mediaUrl = await renderWithPixi(mediaUrl, filters);
              } catch (error) {
                console.error("[Download] Filter rendering failed:", error);
                toast({
                  title: "Filter Error",
                  description:
                    "Failed to apply filters. Downloading original image.",
                  variant: "destructive",
                });
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

    // Track total nodes for progress calculation
    setTotalNodes(executionOrder.length);

    // Store executed node data
    const progress = new Map<string, string>();

    // Group nodes by execution level for parallel execution
    const levels = groupNodesByLevel(executionOrder, nodes, edges);

    try {
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

        const levelNodes = levels[levelIndex];

        // Separate API-calling nodes from others
        const apiNodes = levelNodes.filter((node) =>
          [
            NodeType.GenerateImage as string,
            NodeType.GenerateVideo as string,
            NodeType.LLM as string,
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

            const inputs = getNodeInputs(node.id);
            const validation = validateNodeInputs(node, inputs);
            if (!validation.valid) {
              return {
                nodeId: node.id,
                success: false,
                error: validation.error,
              };
            }

            const result = await executeNode(node, inputs);

            // ✅ CRITICAL FIX: Update nodes array synchronously
            // This ensures downstream nodes see the latest outputs immediately
            if (result.success && result.data) {
              const updatedOutputs = result.data.outputs || result.data;

              nodes = nodes.map((n) =>
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

          const inputs = getNodeInputs(node.id);

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

              // ✅ CRITICAL FIX: Update nodes array synchronously for API nodes
              // This ensures downstream nodes see the latest outputs immediately
              if (execResult.success && execResult.data) {
                const updatedOutputs =
                  execResult.data.outputs || execResult.data;

                nodes = nodes.map((n) =>
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
                  "[Execution] ✓ Synchronously updated API node outputs:",
                  {
                    nodeId: node.id,
                    nodeType: node.type,
                    outputKeys: Object.keys(updatedOutputs),
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

      // Show completion summary
      if (totalFailed === 0) {
        toast({
          title: "Workflow Completed",
          description: `All ${totalCompleted} nodes executed successfully!`,
        });
      } else {
        toast({
          title: "Workflow Completed with Errors",
          description: `${totalCompleted} succeeded, ${totalFailed} failed`,
          variant: "destructive",
        });
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
    }
  }, [
    isExecuting,
    nodes,
    getExecutionOrder,
    getNodeInputs,
    executeNode,
    updateNodeState,
    abortRequested,
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
  };
}
