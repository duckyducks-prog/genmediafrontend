import { useCallback, useState, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
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
import { WorkflowNode, WorkflowEdge, NodeType } from "./types";
import NodePalette from "./NodePalette";
import WorkflowToolbar from "./WorkflowToolbar";
import { useWorkflowExecution } from "./useWorkflowExecution";

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

const nodeTypes: NodeTypes = {
  // Input nodes
  [NodeType.Prompt]: PromptInputNode,
  [NodeType.ImageInput]: ImageUploadNode,

  // Modifier nodes
  [NodeType.PromptConcatenator]: PromptConcatenatorNode,
  [NodeType.Format]: FormatNode,

  // Action nodes
  [NodeType.GenerateImage]: GenerateImageNode,
  [NodeType.GenerateVideo]: GenerateVideoNode,
  [NodeType.LLM]: LLMNode,

  // Output nodes
  [NodeType.ImageOutput]: ImageOutputNode,
  [NodeType.VideoOutput]: VideoOutputNode,
  [NodeType.Download]: DownloadNode,
};

function WorkflowCanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowEdge>([]);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Listen for node update events from node components
  useEffect(() => {
    const handleNodeUpdate = (event: any) => {
      const { id, data } = event.detail;
      setNodes((nds) =>
        nds.map((node) => (node.id === id ? { ...node, data } : node))
      );
    };

    window.addEventListener('node-update', handleNodeUpdate);
    return () => window.removeEventListener('node-update', handleNodeUpdate);
  }, [setNodes]);

  // Listen for node execute events
  useEffect(() => {
    const handleNodeExecute = (event: any) => {
      const { nodeId } = event.detail;
      // Trigger execution for a single node
      // This will be handled by the workflow execution system
      console.log('Execute node:', nodeId);
    };

    window.addEventListener('node-execute', handleNodeExecute);
    return () => window.removeEventListener('node-execute', handleNodeExecute);
  }, []);

  // Handle new connections between nodes
  const onConnect = useCallback(
    (params: Connection | Edge) => {
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges],
  );

  // Validate connections based on handle data types
  const isValidConnection = useCallback((connection: Connection) => {
    // Basic validation - can be extended
    return true;
  }, []);

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
          data = { imageUrl: null, file: null, label: "Image Input", outputs: {} };
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

        // Action nodes
        case NodeType.GenerateImage:
          data = { isGenerating: false, status: "ready", label: "Generate Image", outputs: {} };
          break;
        case NodeType.GenerateVideo:
          data = { isGenerating: false, status: "ready", label: "Generate Video", outputs: {} };
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
  const { executeWorkflow, resetWorkflow, isExecuting } = useWorkflowExecution(
    nodes,
    edges,
    setNodes,
  );

  return (
    <div ref={reactFlowWrapper} className="w-full h-full relative">
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
        <MiniMap
          className="bg-card border border-border"
          nodeColor="#F3C5DB"
          maskColor="rgba(70, 6, 43, 0.6)"
        />
        <WorkflowToolbar
          onClearCanvas={clearCanvas}
          onExecuteWorkflow={executeWorkflow}
          onResetWorkflow={resetWorkflow}
          isExecuting={isExecuting}
        />
      </ReactFlow>
    </div>
  );
}

interface WorkflowCanvasProps {
  onAddNode?: (type: NodeType) => void;
}

export default function WorkflowCanvas({ onAddNode }: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner />
    </ReactFlowProvider>
  );
}
