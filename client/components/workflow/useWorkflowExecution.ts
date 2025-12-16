import { useCallback, useState } from "react";
import {
  WorkflowNode,
  WorkflowEdge,
  NodeType,
  validateMutualExclusion,
} from "./types";
import { toast } from "@/hooks/use-toast";
import {
  gatherNodeInputs,
  validateNodeInputs,
  executeConcatenator,
  pollVideoStatus,
  groupNodesByLevel,
  findUpstreamDependencies,
} from "./executionHelpers";
import { auth } from "@/lib/firebase";
import { saveToLibrary } from "@/lib/api-helpers";
import { renderWithPixi } from "@/lib/pixi-renderer";
import { FilterConfig } from "@/lib/pixi-filter-configs";

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
  onAssetGenerated?: () => void,
) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<
    Map<string, string>
  >(new Map());
  const [totalNodes, setTotalNodes] = useState(0);

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
      console.log("[updateNodeState] Updating node:", {
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

            console.log("[updateNodeState] Updated node data:", {
              nodeId,
              nodeType: node.type,
              oldDataKeys: Object.keys(node.data),
              newDataKeys: Object.keys(updatedData),
              hasOutputs: !!updatedData.outputs,
              outputsKeys: updatedData.outputs ? Object.keys(updatedData.outputs) : [],
              topLevelHasImage: !!updatedData.image,
              topLevelHasImageUrl: !!updatedData.imageUrl,
              outputsHasImage: !!updatedData.outputs?.image,
              outputsHasImageUrl: !!updatedData.outputs?.imageUrl,
              imageUrlPreview: updatedData.imageUrl
                ? updatedData.imageUrl.substring(0, 50)
                : "none",
            });

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
            const imageUrl = (node.data as any).imageUrl || null;
            return { success: true, data: { image: imageUrl } };
          }

          // MODIFIER NODES
          case NodeType.PromptConcatenator: {
            const separator = (node.data as any).separator || "Space";
            const combined = executeConcatenator(inputs, separator);
            return { success: true, data: { combined } };
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

              const response = await fetch(
                "https://veo-api-82187245577.us-central1.run.app/generate/text",
                {
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
                },
              );

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
                data: { response: apiData.response },
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
            const aspectRatio = formatData?.aspect_ratio || node.data.aspectRatio || "1:1";
            const aspectRatioLabel = aspectRatio === "16:9" ? "landscape" :
                                    aspectRatio === "9:16" ? "portrait" :
                                    aspectRatio === "1:1" ? "square" :
                                    aspectRatio === "3:4" ? "portrait" :
                                    aspectRatio === "4:3" ? "landscape" : "";
            prompt = `${prompt}, ${aspectRatio} aspect ratio${aspectRatioLabel ? ` (${aspectRatioLabel})` : ""}`;

            console.log("[GenerateImage] Execution inputs:", {
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
              console.log(
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

            console.log("[GenerateImage] Processed reference images:", {
              hasReferenceImages: !!referenceImages,
              type: typeof referenceImages,
              isArray: Array.isArray(referenceImages),
              count: Array.isArray(referenceImages) ? referenceImages.length : (referenceImages ? 1 : 0),
            });

            // Warn user if they connected reference images (not supported by Gemini 3 Pro)
            if (referenceImages) {
              console.warn("[GenerateImage] Reference images are connected but NOT supported by Gemini 3 Pro API. They will be ignored.");
              toast({
                title: "Reference Images Not Supported",
                description: "Gemini 3 Pro does not support reference images. Only the text prompt will be used.",
                variant: "default",
              });
            }

            try {
              const user = auth.currentUser;
              const token = await user?.getIdToken();

              // Build request body
              // NOTE: Gemini 3 Pro does NOT support reference_images parameter
              // Reference images cause a 404 "Cannot set internal reference_type field" error
              const requestBody: any = {
                prompt,
                aspect_ratio: formatData?.aspect_ratio || node.data.aspectRatio || "1:1",
              };

              console.log("[GenerateImage] Request body:", {
                hasPrompt: !!requestBody.prompt,
                aspectRatio: requestBody.aspect_ratio,
                referenceImagesIgnored: !!referenceImages,
              });

              const response = await fetch(
                "https://veo-api-82187245577.us-central1.run.app/generate/image",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify(requestBody),
                },
              );

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

              console.log("[GenerateImage] API Response:", {
                hasImages: !!apiData.images,
                imageCount: apiData.images?.length || 0,
              });

              if (apiData.images && apiData.images.length > 0) {
                const images = apiData.images.map(
                  (img: string) => `data:image/png;base64,${img}`,
                );
                const firstImage = images[0];

                console.log("[GenerateImage] Generated images:", {
                  imageCount: images.length,
                  firstImageLength: firstImage.length,
                  firstImagePreview: firstImage.substring(0, 50),
                });

                // Save first image to library
                try {
                  await saveToLibrary({
                    imageUrl: firstImage,
                    prompt: prompt,
                    assetType: "image",
                  });
                  console.log("[useWorkflowExecution] Image saved to library");
                } catch (error) {
                  console.error(
                    "[useWorkflowExecution] Failed to save image to library:",
                    error,
                  );
                  // Don't fail the workflow if save fails, just log it
                }

                // Notify that an asset was generated
                if (onAssetGenerated) {
                  console.log(
                    "[useWorkflowExecution] Image generated, triggering asset refresh",
                  );
                  onAssetGenerated();
                }

                const resultData = {
                  images,
                  image: firstImage,
                  imageUrl: firstImage,
                };

                console.log("[GenerateImage] Returning result data:", {
                  hasImages: !!resultData.images,
                  hasImage: !!resultData.image,
                  hasImageUrl: !!resultData.imageUrl,
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

          case NodeType.GenerateVideo: {
            console.log('[GenerateVideo] Starting execution with inputs:', {
              inputKeys: Object.keys(inputs),
              hasPrompt: !!inputs.prompt,
              hasFirstFrame: !!inputs.first_frame,
              hasLastFrame: !!inputs.last_frame,
              hasReferenceImages: !!inputs.reference_images,
              hasFormat: !!inputs.format,
              hasFilters: !!inputs.filters,
              firstFrameType: typeof inputs.first_frame,
              firstFrameLength: inputs.first_frame?.length || 0,
              firstFramePreview: typeof inputs.first_frame === 'string' ? inputs.first_frame.substring(0, 50) + '...' : inputs.first_frame,
            });

            let prompt = inputs.prompt;
            let firstFrame = inputs.first_frame || null;
            let lastFrame = inputs.last_frame || null;
            let referenceImages = inputs.reference_images || null;
            const formatData = inputs.format;
            const filters: FilterConfig[] = inputs.filters || [];

            if (!prompt) {
              return {
                success: false,
                error: "No prompt connected",
              };
            }

            // Always append aspect ratio to prompt (from format connector or node dropdown)
            const aspectRatio = formatData?.aspect_ratio || node.data.aspectRatio || "16:9";
            const aspectRatioLabel = aspectRatio === "16:9" ? "landscape" :
                                    aspectRatio === "9:16" ? "portrait" : "";
            prompt = `${prompt}, ${aspectRatio} aspect ratio${aspectRatioLabel ? ` (${aspectRatioLabel})` : ""}`;

            console.log('[GenerateVideo] After variable assignment:', {
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
              console.log(
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

              console.log(`[GenerateVideo] Reference images count: ${referenceImages.length}/3`);
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

              console.log('[GenerateVideo] Preparing request body:', {
                hasPrompt: !!prompt,
                hasFirstFrame: !!firstFrame,
                hasLastFrame: !!lastFrame,
                hasReferenceImages: !!referenceImages,
                firstFrameLength: typeof firstFrame === 'string' ? firstFrame.length : 0,
                lastFrameLength: typeof lastFrame === 'string' ? lastFrame.length : 0,
              });

              // Build request body - only include optional fields if we have valid data
              const requestBody: any = {
                prompt,
                aspect_ratio: formatData?.aspect_ratio || node.data.aspectRatio || "16:9",
                duration_seconds: formatData?.duration_seconds || node.data.durationSeconds || 8,
                generate_audio: formatData?.generate_audio ?? node.data.generateAudio ?? true,
              };

              // Only add image fields if we have valid data (not null or empty)
              if (firstFrame) {
                requestBody.first_frame = firstFrame;
              }
              if (lastFrame) {
                requestBody.last_frame = lastFrame;
              }
              if (referenceImages) {
                requestBody.reference_images = referenceImages;
              }

              console.log('[GenerateVideo] Full request body (truncated):', {
                prompt: requestBody.prompt?.substring(0, 50),
                first_frame: requestBody.first_frame ? `${typeof requestBody.first_frame} (${requestBody.first_frame.length} chars)` : null,
                last_frame: requestBody.last_frame ? `${typeof requestBody.last_frame} (${requestBody.last_frame.length} chars)` : null,
                reference_images: requestBody.reference_images
                  ? Array.isArray(requestBody.reference_images)
                    ? `array (${requestBody.reference_images.length} images)`
                    : `string (${requestBody.reference_images.length} chars)`
                  : null,
                aspect_ratio: requestBody.aspect_ratio,
                duration_seconds: requestBody.duration_seconds,
                generate_audio: requestBody.generate_audio,
              });

              const response = await fetch(
                "https://veo-api-82187245577.us-central1.run.app/generate/video",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify(requestBody),
                },
              );

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

              if (!apiData.operation_name) {
                return {
                  success: false,
                  error: "No operation name returned from API",
                };
              }

              // Poll for video completion using helper
              const result = await pollVideoStatus(
                apiData.operation_name,
                (attempts) => {
                  // Update node with poll progress
                  updateNodeState(node.id, "executing", {
                    pollAttempts: attempts,
                  });
                },
              );

              if (result.success && result.videoUrl) {
                // Save video to library
                try {
                  await saveToLibrary({
                    imageUrl: result.videoUrl,
                    prompt: prompt,
                    assetType: "video",
                  });
                  console.log("[useWorkflowExecution] Video saved to library");
                } catch (error) {
                  console.error(
                    "[useWorkflowExecution] Failed to save video to library:",
                    error,
                  );
                  // Don't fail the workflow if save fails, just log it
                }

                // Notify that an asset was generated
                if (onAssetGenerated) {
                  console.log(
                    "[useWorkflowExecution] Video generated, triggering asset refresh",
                  );
                  onAssetGenerated();
                }

                return {
                  success: true,
                  data: {
                    video: result.videoUrl,
                    videoUrl: result.videoUrl,
                  },
                };
              } else {
                return {
                  success: false,
                  error: result.error || "Video generation failed",
                };
              }
            } catch (error) {
              return {
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Video generation failed",
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
              console.log(
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
    const executionOrder = getExecutionOrder();

    if (!executionOrder) {
      setIsExecuting(false);
      return;
    }

    // Track total nodes for progress calculation
    setTotalNodes(executionOrder.length);

    // Store executed node data
    const executedData = new Map<string, any>();
    const progress = new Map<string, string>();

    // Group nodes by execution level for parallel execution
    const levels = groupNodesByLevel(executionOrder, nodes, edges);


    try {
      let totalCompleted = 0;
      let totalFailed = 0;

      // Execute each level in sequence
      for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
        const levelNodes = levels[levelIndex];

        // Separate API-calling nodes from others for sequential execution
        const apiNodes = levelNodes.filter((node) =>
          [
            NodeType.GenerateImage,
            NodeType.GenerateVideo,
            NodeType.LLM,
          ].includes(node.type),
        );
        const otherNodes = levelNodes.filter(
          (node) => !apiNodes.includes(node),
        );


        // Execute non-API nodes in parallel (they're fast)
        const otherResults = await Promise.allSettled(
          otherNodes.map(async (node) => {
            progress.set(node.id, "executing");
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
            return {
              nodeId: node.id,
              ...result,
            };
          }),
        );

        // Execute API nodes sequentially with delays
        const apiResults = [];
        for (let i = 0; i < apiNodes.length; i++) {
          const node = apiNodes[i];

          progress.set(node.id, "executing");
          updateNodeState(node.id, "executing");
          setExecutionProgress(new Map(progress));


          const inputs = getNodeInputs(node.id);
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

          // Add delay between API calls to avoid quota exhaustion
          if (i < apiNodes.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
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

              const updateData = {
                ...result.value.data,
                outputs: result.value.data,
              };

              console.log("[Workflow] Updating node state:", {
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
                    outputsKeys: updateData.outputs ? Object.keys(updateData.outputs) : [],
                    outputsHasImage: !!updateData.outputs?.image,
                    outputsHasImages: !!updateData.outputs?.images,
                    outputsHasImageUrl: !!updateData.outputs?.imageUrl,
                    outputsImagePreview: updateData.outputs?.image ? updateData.outputs.image.substring(0, 50) : 'none',
                  },
                },
              });

              updateNodeState(node.id, "completed", updateData);
              totalCompleted++;
            } else {
              progress.set(node.id, "error");
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
    }
  }, [
    isExecuting,
    nodes,
    getExecutionOrder,
    getNodeInputs,
    executeNode,
    updateNodeState,
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
      const targetNode = nodes.find((n) => n.id === nodeId);

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
        const dependencies = findUpstreamDependencies(nodeId, nodes, edges);

        console.log(
          `[Single Node Execution] Target: ${nodeId}, Dependencies: ${dependencies.join(", ") || "none"}`,
        );

        // Execute dependencies first
        for (const depNodeId of dependencies) {
          const depNode = nodes.find((n) => n.id === depNodeId);
          if (!depNode) continue;

          updateNodeState(depNodeId, "executing");

          const inputs = getNodeInputs(depNodeId);
          const validation = validateNodeInputs(depNode, inputs);

          if (!validation.valid) {
            updateNodeState(depNodeId, "error", { error: validation.error });
            throw new Error(`Dependency failed: ${validation.error}`);
          }

          const result = await executeNode(depNode, inputs);

          if (!result.success) {
            updateNodeState(depNodeId, "error", { error: result.error });
            throw new Error(`Dependency failed: ${result.error}`);
          }

          updateNodeState(depNodeId, "completed", {
            ...result.data,
            outputs: result.data,
          });
        }

        // Execute target node
        updateNodeState(nodeId, "executing");

        const inputs = getNodeInputs(nodeId);
        const validation = validateNodeInputs(targetNode, inputs);

        if (!validation.valid) {
          updateNodeState(nodeId, "error", { error: validation.error });
          toast({
            title: "Validation Error",
            description: validation.error,
            variant: "destructive",
          });
          return;
        }

        const result = await executeNode(targetNode, inputs);

        if (!result.success) {
          updateNodeState(nodeId, "error", { error: result.error });
          toast({
            title: "Execution Failed",
            description: result.error,
            variant: "destructive",
          });
          return;
        }

        updateNodeState(nodeId, "completed", {
          ...result.data,
          outputs: result.data,
        });

        toast({
          title: "Success",
          description: `${targetNode.data.label || targetNode.type} executed successfully!`,
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
    [nodes, edges, getNodeInputs, executeNode, updateNodeState],
  );

  return {
    executeWorkflow,
    resetWorkflow,
    executeSingleNode,
    isExecuting,
    executionProgress,
    totalNodes,
  };
}
