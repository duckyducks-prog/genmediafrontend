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
  executeFormat,
  pollVideoStatus,
  groupNodesByLevel,
} from "./executionHelpers";
import { auth } from "@/lib/firebase";

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
      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                status,
                isGenerating: status === "executing",
                ...data,
              },
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

          case NodeType.Format: {
            const formatData = executeFormat(node.data);
            return { success: true, data: { format: formatData } };
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
                    "Authorization": `Bearer ${token}`
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
            const prompt = inputs.prompt;
            let referenceImages = inputs.reference_images || null;
            const formatData = inputs.format;

            if (!prompt) {
              return { success: false, error: "No prompt connected" };
            }

            // Strip data URI prefix from reference images if present
            if (referenceImages) {
              if (Array.isArray(referenceImages)) {
                referenceImages = referenceImages.map((img: string) => {
                  if (typeof img === "string" && img.startsWith("data:")) {
                    return img.split(",")[1];
                  }
                  return img;
                });
              } else if (
                typeof referenceImages === "string" &&
                referenceImages.startsWith("data:")
              ) {
                referenceImages = referenceImages.split(",")[1];
              }
            }

            try {
              const user = auth.currentUser;
              const token = await user?.getIdToken();

              const response = await fetch(
                "https://veo-api-82187245577.us-central1.run.app/generate/image",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                  },
                  body: JSON.stringify({
                    prompt,
                    reference_images: referenceImages,
                    aspect_ratio: formatData?.aspect_ratio || "1:1",
                  }),
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
                console.error('[GenerateImage] API Error:', {
                  status: response.status,
                  statusText: response.statusText,
                  body: errorText
                });
                throw new Error(`API error: ${response.status} - ${errorText}`);
              }

              const apiData = await response.json();

              if (apiData.images && apiData.images.length > 0) {
                const images = apiData.images.map(
                  (img: string) => `data:image/png;base64,${img}`,
                );

                // Notify that an asset was generated
                if (onAssetGenerated) {
                  console.log(
                    "[useWorkflowExecution] Image generated, triggering asset refresh",
                  );
                  onAssetGenerated();
                }

                return {
                  success: true,
                  data: {
                    images,
                    image: images[0],
                  },
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
            const prompt = inputs.prompt;
            let firstFrame = inputs.first_frame || null;
            let lastFrame = inputs.last_frame || null;
            let referenceImages = inputs.reference_images || null;
            const formatData = inputs.format;

            if (!prompt) {
              return {
                success: false,
                error: "No prompt connected",
              };
            }

            // Strip data URI prefix from image inputs if present
            if (
              firstFrame &&
              typeof firstFrame === "string" &&
              firstFrame.startsWith("data:")
            ) {
              firstFrame = firstFrame.split(",")[1];
            }
            if (
              lastFrame &&
              typeof lastFrame === "string" &&
              lastFrame.startsWith("data:")
            ) {
              lastFrame = lastFrame.split(",")[1];
            }
            if (referenceImages) {
              if (Array.isArray(referenceImages)) {
                referenceImages = referenceImages.map((img: string) => {
                  if (typeof img === "string" && img.startsWith("data:")) {
                    return img.split(",")[1];
                  }
                  return img;
                });
              } else if (
                typeof referenceImages === "string" &&
                referenceImages.startsWith("data:")
              ) {
                referenceImages = referenceImages.split(",")[1];
              }
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

              const requestBody: any = {
                prompt,
                first_frame: firstFrame,
                last_frame: lastFrame,
                reference_images: referenceImages,
                aspect_ratio: formatData?.aspect_ratio || "16:9",
                duration_seconds: formatData?.duration_seconds || 8,
                generate_audio: formatData?.generate_audio ?? true,
              };

              const response = await fetch(
                "https://veo-api-82187245577.us-central1.run.app/generate/video",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
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
                // Notify that an asset was generated
                if (onAssetGenerated) {
                  console.log(
                    "[useWorkflowExecution] Video generated, triggering asset refresh",
                  );
                  onAssetGenerated();
                }

                return {
                  success: true,
                  data: { video: result.videoUrl },
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
            const mediaUrl =
              mediaData.image ||
              mediaData.video ||
              mediaData.imageUrl ||
              mediaData.videoUrl ||
              null;
            const isVideo = !!(mediaData.video || mediaData.videoUrl);

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

    // Store executed node data
    const executedData = new Map<string, any>();
    const progress = new Map<string, string>();

    // Group nodes by execution level for parallel execution
    const levels = groupNodesByLevel(executionOrder, nodes, edges);

    toast({
      title: "Workflow Started",
      description: `Executing ${executionOrder.length} nodes across ${levels.length} level${levels.length > 1 ? "s" : ""}...`,
    });

    try {
      let totalCompleted = 0;
      let totalFailed = 0;

      // Execute each level in sequence, but nodes within a level in parallel
      for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
        const levelNodes = levels[levelIndex];

        toast({
          title: `Executing Level ${levelIndex + 1}/${levels.length}`,
          description: `Running ${levelNodes.length} node${levelNodes.length > 1 ? "s" : ""} in parallel...`,
        });

        // Update all nodes in this level to executing
        levelNodes.forEach((node) => {
          progress.set(node.id, "executing");
          updateNodeState(node.id, "executing");
        });
        setExecutionProgress(new Map(progress));

        // Execute all nodes in this level in parallel
        const results = await Promise.allSettled(
          levelNodes.map(async (node) => {
            const inputs = getNodeInputs(node.id);

            // Validate inputs before execution
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

        // Process results for this level
        results.forEach((result, index) => {
          const node = levelNodes[index];

          if (result.status === "fulfilled") {
            if (result.value.success) {
              progress.set(node.id, "completed");
              updateNodeState(node.id, "completed", {
                ...result.value.data,
                outputs: result.value.data,
              });
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

  return {
    executeWorkflow,
    resetWorkflow,
    isExecuting,
    executionProgress,
  };
}
