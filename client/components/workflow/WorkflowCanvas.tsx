import { useCallback, useState, useRef } from 'react';
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
} from 'reactflow';
import 'reactflow/dist/style.css';
import './workflow.css';
import { WorkflowNode, WorkflowEdge, NodeType } from './types';
import NodePalette from './NodePalette';
import WorkflowToolbar from './WorkflowToolbar';

// Import all custom node components
import PromptInputNode from './nodes/PromptInputNode';
import ImageUploadNode from './nodes/ImageUploadNode';
import GenerateImageNode from './nodes/GenerateImageNode';
import GenerateVideoNode from './nodes/GenerateVideoNode';
import ImageOutputNode from './nodes/ImageOutputNode';
import VideoOutputNode from './nodes/VideoOutputNode';
import DownloadNode from './nodes/DownloadNode';

const nodeTypes: NodeTypes = {
  [NodeType.PromptInput]: PromptInputNode,
  [NodeType.ImageUpload]: ImageUploadNode,
  [NodeType.GenerateImage]: GenerateImageNode,
  [NodeType.GenerateVideo]: GenerateVideoNode,
  [NodeType.ImageOutput]: ImageOutputNode,
  [NodeType.VideoOutput]: VideoOutputNode,
  [NodeType.Download]: DownloadNode,
};

function WorkflowCanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowEdge>([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Handle new connections between nodes
  const onConnect = useCallback(
    (params: Connection | Edge) => {
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges]
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
        case NodeType.PromptInput:
          data = { prompt: '', label: 'Prompt Input' };
          break;
        case NodeType.ImageUpload:
          data = { imageUrl: null, file: null, label: 'Image Upload' };
          break;
        case NodeType.GenerateImage:
          data = { isGenerating: false, status: 'Ready' };
          break;
        case NodeType.GenerateVideo:
          data = { isGenerating: false, status: 'Ready' };
          break;
        case NodeType.ImageOutput:
          data = { result: null, type: 'image', label: 'Image Output' };
          break;
        case NodeType.VideoOutput:
          data = { result: null, type: 'video', label: 'Video Output' };
          break;
        case NodeType.Download:
          data = { inputData: null, type: 'image', label: 'Download' };
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
    [setNodes]
  );

  // Handle drag over for drop zone
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle drop to add node
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current || !reactFlowInstance) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const type = event.dataTransfer.getData('application/reactflow') as NodeType;

      if (!type) return;

      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      addNode(type, position);
    },
    [reactFlowInstance, addNode]
  );

  // Clear canvas
  const clearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
  }, [setNodes, setEdges]);

  return (
    <div className="w-full h-full flex">
      <NodePalette onAddNode={addNode} />
      
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
        >
          <Background className="bg-background" />
          <Controls className="bg-card border border-border" />
          <MiniMap
            className="bg-card border border-border"
            nodeColor="#F3C5DB"
            maskColor="rgba(70, 6, 43, 0.6)"
          />
          <WorkflowToolbar onClearCanvas={clearCanvas} />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner />
    </ReactFlowProvider>
  );
}
