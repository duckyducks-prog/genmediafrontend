import { useCallback, useState } from 'react';
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
} from 'reactflow';
import 'reactflow/dist/style.css';
import { WorkflowNode, WorkflowEdge, HandleDataType } from './types';

const nodeTypes: NodeTypes = {
  // We'll register custom nodes here as we create them
};

export default function WorkflowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowEdge>([]);

  // Handle new connections between nodes
  const onConnect = useCallback(
    (params: Connection | Edge) => {
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges]
  );

  // Validate connections based on handle data types
  const isValidConnection = useCallback((connection: Connection) => {
    // We'll implement type checking here
    // For now, allow all connections
    return true;
  }, []);

  // Add a new node to the canvas
  const addNode = useCallback(
    (type: string, position: { x: number; y: number }, data: any) => {
      const newNode: WorkflowNode = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data,
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
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
      </ReactFlow>
    </div>
  );
}
