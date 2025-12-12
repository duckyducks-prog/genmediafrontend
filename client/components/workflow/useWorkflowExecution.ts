import { useCallback, useState } from "react";
import { WorkflowNode, WorkflowEdge, NodeType } from "./types";
import { toast } from "@/hooks/use-toast";

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

  // Get input data for a node from connected nodes
  const getNodeInputs = useCallback(
    (nodeId: string, executedData: Map<string, any>) => {
      const incomingEdges = edges.filter((edge) => edge.target === nodeId);
      const inputs: any = {};

      incomingEdges.forEach((edge) => {
        const sourceData = executedData.get(edge.source);
        if (sourceData) {
          // Store input based on target handle
          const handleId = edge.targetHandle || "default";
          inputs[handleId] = sourceData;
        }
      });

      return inputs;
    },
    [edges],
  );

  // Execute a single node
  const executeNode = useCallback(
    async (node: WorkflowNode, inputs: any): Promise<ExecutionResult> => {
      try {
        switch (node.type) {
          case NodeType.PromptInput: {
            const prompt = node.data.prompt || "";
            console.log("PromptInput executing with prompt:", prompt);
            return { success: true, data: { prompt } };
          }

          case NodeType.ImageUpload: {
            const imageUrl = node.data.imageUrl || null;
            return { success: true, data: { imageUrl } };
          }

          case NodeType.GenerateImage: {
            // Get prompt and optional reference image from inputs
            const prompt = inputs["prompt-input"]?.prompt || "";
            const referenceImage = inputs["image-input"]?.imageUrl || null;

            if (!prompt) {
              return { success: false, error: "No prompt provided" };
            }

            try {
              // Call the real image generation API
              const response = await fetch(
                "https://veo-api-82187245577.us-central1.run.app/generate/image",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ prompt }),
                },
              );

              if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
              }

              const apiData = await response.json();

              if (apiData.images && apiData.images[0]) {
                const imageUrl = `data:image/png;base64,${apiData.images[0]}`;

                return {
                  success: true,
                  data: { imageUrl, prompt, referenceImage },
                };
              } else {
                return { success: false, error: "No image returned from API" };
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
            // Get prompt and optional frames from inputs
            const prompt = inputs["prompt-input"]?.prompt || "";
            const firstFrame = inputs["first-frame-input"]?.imageUrl || null;
            const lastFrame = inputs["last-frame-input"]?.imageUrl || null;

            if (!prompt) {
              console.log("Generate Video inputs:", inputs);
              console.log("Prompt input data:", inputs["prompt-input"]);
              return {
                success: false,
                error:
                  "No prompt connected. Connect a Prompt Input node to the top pink handle.",
              };
            }

            try {
              // Call the real video generation API
              const requestBody: any = { prompt };

              // Add first frame if provided
              if (firstFrame) {
                requestBody.first_frame = firstFrame;
              }

              // Add last frame if provided
              if (lastFrame) {
                requestBody.last_frame = lastFrame;
              }

              const response = await fetch(
                "https://veo-api-82187245577.us-central1.run.app/generate/video",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(requestBody),
                },
              );

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

              // Poll for video completion
              const operationName = apiData.operation_name;
              const maxAttempts = 30; // 5 minutes max (30 * 10 seconds)
              let attempts = 0;

              while (attempts < maxAttempts) {
                // Wait 10 seconds between polls
                await new Promise((resolve) => setTimeout(resolve, 10000));
                attempts++;

                const statusResponse = await fetch(
                  `https://veo-api-82187245577.us-central1.run.app/video/status`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ operation_name: operationName }),
                  },
              }

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
                    if (statusData.video_base64) {
                      const videoUrl = `data:video/mp4;base64,${statusData.video_base64}`;

                      return {
                        success: true,
                        data: {
                          videoUrl,
                          prompt,
                          firstFrame,
                          lastFrame,
                          operationName,
                        },
                      };
                    } else {
                      return {
                        success: false,
                        error:
                          "Video generation completed but no video data returned",
                      };
                    }
                  }

                  // Check for errors
                  if (statusData.error) {
                    return {
                      success: false,
                      error: `Video generation failed: ${statusData.error.message || "Unknown error"}`,
                    };
                  }

                  // Still processing, continue polling
                  console.log(
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
                  "Video generation timed out. The operation may still be processing.",
              };
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
            // Get image from input
            const imageUrl = inputs["image-input"]?.imageUrl || null;
            return { success: true, data: { imageUrl, type: "image" } };
          }

          case NodeType.VideoOutput: {
            // Get video from input
            const videoUrl = inputs["video-input"]?.videoUrl || null;
            return { success: true, data: { videoUrl, type: "video" } };
          }

          case NodeType.Download: {
            // Get media from input
            const mediaData = inputs["media-input"] || {};
            const mediaUrl = mediaData.imageUrl || mediaData.videoUrl || null;
            const isVideo = !!mediaData.videoUrl;

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
    [],
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

    toast({
      title: "Workflow Started",
      description: `Executing ${executionOrder.length} nodes...`,
    });

    try {
      // Execute nodes in order
      for (const nodeId of executionOrder) {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        // Update status to executing
        progress.set(nodeId, "executing");
        setExecutionProgress(new Map(progress));
        updateNodeState(nodeId, "executing");

        // Get inputs from previous nodes
        const inputs = getNodeInputs(nodeId, executedData);

        // Execute the node
        const result = await executeNode(node, inputs);

        if (result.success) {
          // Store result for downstream nodes
          executedData.set(nodeId, result.data);
          progress.set(nodeId, "completed");
          updateNodeState(nodeId, "completed", result.data);
        } else {
          // Handle error
          progress.set(nodeId, "error");
          updateNodeState(nodeId, "error", { error: result.error });

          toast({
            title: "Node Execution Failed",
            description: `${node.data.label || node.type}: ${result.error}`,
            variant: "destructive",
          });

          setIsExecuting(false);
          setExecutionProgress(new Map(progress));
          return;
        }

        setExecutionProgress(new Map(progress));
      }

      toast({
        title: "Workflow Completed",
        description: "All nodes executed successfully!",
      });
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
