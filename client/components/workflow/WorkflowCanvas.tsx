import { useCallback, useState, useRef, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  NodeTypes,
  ConnectionMode,
  ReactFlowProvider,
  ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import "./workflow.css";
import {
  WorkflowNode,
  WorkflowEdge,
  NodeType,
  WorkflowNodeData,
} from "./types";
import NodePalette from "./NodePalette";
import WorkflowToolbar from "./WorkflowToolbar";
import { useWorkflowExecution } from "./useWorkflowExecution";
import { validateConnection, getConnectorType } from "./connectionValidation";

// Import all custom node components
import PromptInputNode from "./nodes/PromptInputNode";
import ImageUploadNode from "./nodes/ImageUploadNode";
import GenerateImageNode from "./nodes/GenerateImageNode";
import GenerateVideoNode from "./nodes/GenerateVideoNode";
import ImageOutputNode from "./nodes/ImageOutputNode";
import VideoOutputNode from "./nodes/VideoOutputNode";
import DownloadNode from "./nodes/DownloadNode";
import PromptConcatenatorNode from "./nodes/PromptConcatenatorNode";
import FormatNode from "./nodes/FormatNode";
import LLMNode from "./nodes/LLMNode";
import PreviewNode from "./nodes/PreviewNode";
import BrightnessContrastNode from "./nodes/BrightnessContrastNode";
import BlurNode from "./nodes/BlurNode";
import SharpenNode from "./nodes/SharpenNode";
import HueSaturationNode from "./nodes/HueSaturationNode";
import NoiseNode from "./nodes/NoiseNode";
import VignetteNode from "./nodes/VignetteNode";

const nodeTypes: NodeTypes = {
  // Input nodes
  [NodeType.Prompt]: PromptInputNode,
  [NodeType.ImageInput]: ImageUploadNode,

  // Modifier nodes
  [NodeType.PromptConcatenator]: PromptConcatenatorNode,
  [NodeType.Format]: FormatNode,
  [NodeType.BrightnessContrast]: BrightnessContrastNode,
  [NodeType.Blur]: BlurNode,
  [NodeType.Sharpen]: SharpenNode,
  [NodeType.HueSaturation]: HueSaturationNode,
  [NodeType.Noise]: NoiseNode,
  [NodeType.Vignette]: VignetteNode,

  // Action nodes
  [NodeType.GenerateImage]: GenerateImageNode,
  [NodeType.GenerateVideo]: GenerateVideoNode,
  [NodeType.LLM]: LLMNode,
  [NodeType.Preview]: PreviewNode,
  [NodeType.Download]: DownloadNode,

  // Output nodes
  [NodeType.ImageOutput]: ImageOutputNode,
  [NodeType.VideoOutput]: VideoOutputNode,
};

interface WorkflowCanvasProps {
  onAssetGenerated?: () => void;
}

function WorkflowCanvasInner({ onAssetGenerated }: WorkflowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Listen for node update events from node components
  useEffect(() => {
    const handleNodeUpdate = (event: any) => {
      const { id, data } = event.detail;
      setNodes((nds) => {
        // Update the source node
        const updatedNodes = nds.map((node) =>
          node.id === id ? { ...node, data } : node
        );

        // Propagate outputs to downstream nodes
        const sourceNode = updatedNodes.find(n => n.id === id);
        if (sourceNode?.data?.outputs) {
          // Find all edges going OUT from this node
          const outgoingEdges = edges.filter(e => e.source === id);

          console.log('[WorkflowCanvas] Propagating from node:', id, {
            outputKeys: Object.keys(sourceNode.data.outputs),
            outgoingEdgeCount: outgoingEdges.length,
          });

          outgoingEdges.forEach(edge => {
            const targetNodeIndex = updatedNodes.findIndex(n => n.id === edge.target);
            if (targetNodeIndex !== -1) {
              const targetNode = updatedNodes[targetNodeIndex];
              const sourceHandle = edge.sourceHandle || 'default';
              const targetHandle = edge.targetHandle || 'default';
              const outputValue = sourceNode.data.outputs[sourceHandle];

              if (outputValue !== undefined) {
                // Update the target node's data with the incoming value
                updatedNodes[targetNodeIndex] = {
                  ...targetNode,
                  data: {
                    ...targetNode.data,
                    [targetHandle]: outputValue,
                  },
                };
              }
            }
          });
        }

        return updatedNodes;
      });
    };

    window.addEventListener("node-update", handleNodeUpdate);
    return () => window.removeEventListener("node-update", handleNodeUpdate);
  }, [setNodes, edges]);

  // Handle new connections between nodes
  const onConnect = useCallback(
    (params: Connection | Edge) => {
      // Get the source node to determine connector type
      const sourceNode = nodes.find((n) => n.id === params.source);
      if (sourceNode) {
        const connectorType = getConnectorType(
          sourceNode,
          params.sourceHandle,
          true,
        );
        // Add connector type class and data for styling
        const newEdge = {
          ...params,
          className: `connector-type-${connectorType || "any"}`,
          data: { connectorType: connectorType || "any" },
        };
        setEdges((eds) => addEdge(newEdge, eds));

        // Immediately propagate data through the new connection
        if (sourceNode.data?.outputs) {
          const sourceHandle = params.sourceHandle || 'default';
          const targetHandle = params.targetHandle || 'default';
          const outputValue = sourceNode.data.outputs[sourceHandle];

          if (outputValue !== undefined && params.target) {
            // Update target node with the source's output
            setNodes((nds) =>
              nds.map((node) =>
                node.id === params.target
                  ? {
                      ...node,
                      data: {
                        ...node.data,
                        [targetHandle]: outputValue,
                      },
                    }
                  : node,
              ),
            );

            console.log('[WorkflowCanvas] Initial data propagation on connect:', {
              from: params.source,
              to: params.target,
              handle: targetHandle,
              valuePreview: typeof outputValue === 'string' ? outputValue.substring(0, 50) + '...' : outputValue,
            });
          }
        }
      } else {
        setEdges((eds) => addEdge(params, eds));
      }
    },
    [setEdges, setNodes, nodes],
  );

  // Validate connections based on handle data types
  const isValidConnection = useCallback(
    (connection: Connection) => {
      const validation = validateConnection(connection, nodes, edges);

      if (!validation.valid) {
        console.warn("Connection rejected:", validation.reason);
      }

      return validation.valid;
    },
    [nodes, edges],
  );

  // Add a new node to the canvas
  const addNode = useCallback(
    (type: NodeType, position?: { x: number; y: number }) => {
      const nodePosition = position || {
        x: Math.random() * 400 + 100,
        y: Math.random() * 200 + 100,
      };

      // Create default data based on node type
      let data: any = {};

      switch (type) {
        // Input nodes
        case NodeType.Prompt:
          data = { prompt: "", label: "Prompt", outputs: {} };
          break;
        case NodeType.ImageInput:
          data = {
            imageUrl: null,
            file: null,
            label: "Image Input",
            outputs: {},
          };
          break;

        // Modifier nodes
        case NodeType.PromptConcatenator:
          data = {
            separator: "Space",
            label: "Prompt Concatenator",
            outputs: {},
          };
          break;
        case NodeType.Format:
          data = {
            aspectRatio: "16:9",
            durationSeconds: 8,
            generateAudio: true,
            resolution: "1080p",
            label: "Format",
            outputs: {},
          };
          break;
        case NodeType.BrightnessContrast:
          data = {
            brightness: 0,
            contrast: 0,
            label: "Brightness/Contrast",
            outputs: {},
          };
          break;
        case NodeType.Blur:
          data = {
            strength: 8,
            quality: 4,
            label: "Blur",
            outputs: {},
          };
          break;
        case NodeType.Sharpen:
          data = {
            gamma: 1.0,
            label: "Sharpen",
            outputs: {},
          };
          break;
        case NodeType.HueSaturation:
          data = {
            hue: 0,
            saturation: 0,
            label: "Hue/Saturation",
            outputs: {},
          };
          break;
        case NodeType.Noise:
          data = {
            noise: 0.5,
            label: "Noise",
            outputs: {},
          };
          break;
        case NodeType.Vignette:
          data = {
            size: 0.5,
            amount: 0.5,
            label: "Vignette",
            outputs: {},
          };
          break;

        // Action nodes
        case NodeType.GenerateImage:
          data = {
            isGenerating: false,
            status: "ready",
            label: "Generate Image",
            outputs: {},
          };
          break;
        case NodeType.GenerateVideo:
          data = {
            isGenerating: false,
            status: "ready",
            label: "Generate Video",
            outputs: {},
          };
          break;
        case NodeType.LLM:
          data = {
            systemPrompt: "",
            temperature: 0.7,
            isGenerating: false,
            status: "ready",
            label: "LLM",
            outputs: {},
          };
          break;

        // Output nodes
        case NodeType.ImageOutput:
          data = { result: null, type: "image", label: "Image Output" };
          break;
        case NodeType.VideoOutput:
          data = { result: null, type: "video", label: "Video Output" };
          break;
        case NodeType.Download:
          data = { inputData: null, type: "image", label: "Download" };
          break;
      }

      const newNode: WorkflowNode = {
        id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        position: nodePosition,
        data,
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes],
  );

  // Handle drag over for drop zone
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Handle drop to add node
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current || !reactFlowInstance) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const type = event.dataTransfer.getData(
        "application/reactflow",
      ) as NodeType;

      if (!type) return;

      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      addNode(type, position);
    },
    [reactFlowInstance, addNode],
  );

  // Clear canvas
  const clearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
  }, [setNodes, setEdges]);

  // Workflow execution
  const { executeWorkflow, resetWorkflow, executeSingleNode, isExecuting } = useWorkflowExecution(
    nodes,
    edges,
    setNodes,
    onAssetGenerated,
  );

  // Listen for node execute events
  useEffect(() => {
    const handleNodeExecute = (event: any) => {
      const { nodeId } = event.detail;
      console.log("Execute node:", nodeId);
      // Call the single node execution function
      executeSingleNode(nodeId);
    };

    window.addEventListener("node-execute", handleNodeExecute);
    return () => window.removeEventListener("node-execute", handleNodeExecute);
  }, [executeSingleNode]);

  return (
    <div className="flex w-full h-full">
      {/* Node Palette */}
      <div className="hidden lg:block">
        <NodePalette onAddNode={addNode} />
      </div>

      {/* Canvas Area */}
      <div ref={reactFlowWrapper} className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          fitView
          className="bg-background"
          proOptions={{ hideAttribution: true }}
        >
          <Background className="bg-background" />
          <Controls className="bg-card border border-border" />
          <WorkflowToolbar
            onClearCanvas={clearCanvas}
            onExecuteWorkflow={executeWorkflow}
            onResetWorkflow={resetWorkflow}
            isExecuting={isExecuting}
          />
        </ReactFlow>

        {/* Empty state message */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium mb-2">Your canvas is empty</p>
              <p className="text-sm">
                Drag nodes from the palette or click on a node to add it
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkflowCanvas({
  onAssetGenerated,
}: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner onAssetGenerated={onAssetGenerated} />
    </ReactFlowProvider>
  );
}
