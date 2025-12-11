import { useCallback, useState } from 'react';
import { WorkflowNode, WorkflowEdge, NodeType } from './types';
import { toast } from '@/hooks/use-toast';

interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
}

export function useWorkflowExecution(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  setNodes: (nodes: WorkflowNode[] | ((nodes: WorkflowNode[]) => WorkflowNode[])) => void
) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<Map<string, string>>(new Map());

  // Build adjacency list for the graph
  const buildGraph = useCallback(() => {
    const adjacencyList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize
    nodes.forEach(node => {
      adjacencyList.set(node.id, []);
      inDegree.set(node.id, 0);
    });

    // Build graph from edges
    edges.forEach(edge => {
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
        description: "No start nodes found. Add a node with no incoming connections.",
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
      neighbors.forEach(neighbor => {
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
  const getNodeInputs = useCallback((nodeId: string, executedData: Map<string, any>) => {
    const incomingEdges = edges.filter(edge => edge.target === nodeId);
    const inputs: any = {};

    incomingEdges.forEach(edge => {
      const sourceData = executedData.get(edge.source);
      if (sourceData) {
        // Store input based on target handle
        const handleId = edge.targetHandle || 'default';
        inputs[handleId] = sourceData;
      }
    });

    return inputs;
  }, [edges]);

  // Execute a single node
  const executeNode = useCallback(async (
    node: WorkflowNode,
    inputs: any
  ): Promise<ExecutionResult> => {
    try {
      switch (node.type) {
        case NodeType.PromptInput: {
          const prompt = node.data.prompt || '';
          return { success: true, data: { prompt } };
        }

        case NodeType.ImageUpload: {
          const imageUrl = node.data.imageUrl || null;
          return { success: true, data: { imageUrl } };
        }

        case NodeType.GenerateImage: {
          // Get prompt and optional reference image from inputs
          const prompt = inputs['prompt-input']?.prompt || '';
          const referenceImage = inputs['image-input']?.imageUrl || null;

          if (!prompt) {
            return { success: false, error: 'No prompt provided' };
          }

          // Simulate API call
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Mock generated image URL
          const generatedImageUrl = `https://via.placeholder.com/512x512.png?text=${encodeURIComponent(prompt.slice(0, 20))}`;

          return {
            success: true,
            data: { imageUrl: generatedImageUrl, prompt, referenceImage }
          };
        }

        case NodeType.GenerateVideo: {
          // Get prompt and optional frames from inputs
          const prompt = inputs['prompt-input']?.prompt || '';
          const firstFrame = inputs['first-frame-input']?.imageUrl || null;
          const lastFrame = inputs['last-frame-input']?.imageUrl || null;

          if (!prompt) {
            return { success: false, error: 'No prompt provided' };
          }

          // Simulate API call
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Mock generated video URL
          const generatedVideoUrl = `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`;

          return {
            success: true,
            data: { videoUrl: generatedVideoUrl, prompt, firstFrame, lastFrame }
          };
        }

        case NodeType.ImageOutput: {
          // Get image from input
          const imageUrl = inputs['image-input']?.imageUrl || null;
          return { success: true, data: { imageUrl, type: 'image' } };
        }

        case NodeType.VideoOutput: {
          // Get video from input
          const videoUrl = inputs['video-input']?.videoUrl || null;
          return { success: true, data: { videoUrl, type: 'video' } };
        }

        case NodeType.Download: {
          // Get media from input
          const mediaData = inputs['media-input'] || {};
          const mediaUrl = mediaData.imageUrl || mediaData.videoUrl || null;
          
          if (mediaUrl) {
            // Trigger download
            const link = document.createElement('a');
            link.href = mediaUrl;
            link.download = `media-${Date.now()}`;
            link.click();
          }

          return { success: true, data: { downloaded: !!mediaUrl } };
        }

        default:
          return { success: true, data: {} };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }, []);

  // Update node visual state
  const updateNodeState = useCallback((nodeId: string, status: string, data?: any) => {
    setNodes((prevNodes) =>
      prevNodes.map(node => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              status,
              isGenerating: status === 'executing',
              ...data,
            },
          };
        }
        return node;
      })
    );
  }, [setNodes]);

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
        const node = nodes.find(n => n.id === nodeId);
        if (!node) continue;

        // Update status to executing
        progress.set(nodeId, 'executing');
        setExecutionProgress(new Map(progress));
        updateNodeState(nodeId, 'executing');

        // Get inputs from previous nodes
        const inputs = getNodeInputs(nodeId, executedData);

        // Execute the node
        const result = await executeNode(node, inputs);

        if (result.success) {
          // Store result for downstream nodes
          executedData.set(nodeId, result.data);
          progress.set(nodeId, 'completed');
          updateNodeState(nodeId, 'completed', result.data);
        } else {
          // Handle error
          progress.set(nodeId, 'error');
          updateNodeState(nodeId, 'error', { error: result.error });
          
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
        description: error instanceof Error ? error.message : 'Unknown error occurred',
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
      prevNodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          status: 'ready',
          isGenerating: false,
        },
      }))
    );
  }, [setNodes]);

  return {
    executeWorkflow,
    resetWorkflow,
    isExecuting,
    executionProgress,
  };
}
