import {
  useCallback,
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
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
import SaveWorkflowDialog from "./SaveWorkflowDialog";
import { useWorkflowExecution } from "./useWorkflowExecution";
import { validateConnection, getConnectorType } from "./connectionValidation";
import { useToast } from "@/hooks/use-toast";
import { SavedWorkflow } from "@/lib/workflow-api";

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
import CropNode from "./nodes/CropNode";

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
  [NodeType.Crop]: CropNode,

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

export interface WorkflowCanvasRef {
  loadWorkflow: (workflow: SavedWorkflow) => void;
}

interface WorkflowCanvasProps {
  onAssetGenerated?: () => void;
  onLoadWorkflowRequest?: () => void;
}

const WorkflowCanvasInner = forwardRef<WorkflowCanvasRef, WorkflowCanvasProps>(
  ({ onAssetGenerated, onLoadWorkflowRequest }, ref) => {
    const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeData>(
      [],
    );
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [reactFlowInstance, setReactFlowInstance] =
      useState<ReactFlowInstance | null>(null);
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
    const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(
      null,
    );
    const [copiedNodes, setCopiedNodes] = useState<WorkflowNode[]>([]);
    const [copiedEdges, setCopiedEdges] = useState<WorkflowEdge[]>([]);
    const hasInitialized = useRef(false);
    const { toast } = useToast();

    // Listen for node update events from node components
    useEffect(() => {
      const handleNodeUpdate = (event: any) => {
        const { id, data } = event.detail;

        console.log("[WorkflowCanvas] node-update received:", {
          nodeId: id,
          hasOutputs: !!data?.outputs,
          outputs: data?.outputs,
        });

        setNodes((nds) => {
          // Update the source node
          const updatedNodes = nds.map((node) =>
            node.id === id ? { ...node, data } : node,
          );

          // Propagate outputs to downstream nodes
          const sourceNode = updatedNodes.find((n) => n.id === id);
          if (sourceNode?.data?.outputs) {
            // Find all edges going OUT from this node
            const outgoingEdges = edges.filter((e) => e.source === id);

            console.log(
              "[WorkflowCanvas] Propagating to",
              outgoingEdges.length,
              "downstream nodes",
            );

            outgoingEdges.forEach((edge) => {
              const targetNodeIndex = updatedNodes.findIndex(
                (n) => n.id === edge.target,
              );
              if (targetNodeIndex !== -1) {
                const targetNode = updatedNodes[targetNodeIndex];

                // For modifier nodes, propagate ALL outputs, not just the connected handle
                // This ensures both 'image' and 'filters' are passed to downstream nodes
                const allOutputs = sourceNode.data.outputs;

                console.log("[WorkflowCanvas] Propagating to node:", {
                  targetId: edge.target,
                  targetType: targetNode.type,
                  propagatedData: {
                    hasImage: !!allOutputs.image,
                    filterCount: allOutputs.filters?.length || 0,
                  },
                });

                // Update the target node's data with ALL outputs
                // Set BOTH top-level properties (for direct access) AND data.outputs (for execution helpers)
                updatedNodes[targetNodeIndex] = {
                  ...targetNode,
                  data: {
                    ...targetNode.data,
                    ...allOutputs, // Merge all outputs into target node data (top-level)
                    outputs: {
                      // Also set outputs property for consistency
                      ...(targetNode.data?.outputs || {}),
                      ...allOutputs,
                    },
                  },
                };
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
        console.log('[onConnect] Creating edge:', {
          source: params.source,
          target: params.target,
          sourceHandle: params.sourceHandle,
          targetHandle: params.targetHandle,
        });

        // Get the source node to determine connector type
        const sourceNode = nodes.find((n) => n.id === params.source);
        console.log('[onConnect] Source node:', {
          found: !!sourceNode,
          type: sourceNode?.type,
          hasOutputs: !!sourceNode?.data?.outputs,
          outputKeys: sourceNode?.data?.outputs ? Object.keys(sourceNode.data.outputs) : [],
        });

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
          console.log('[onConnect] Edge created with handles:', {
            sourceHandle: newEdge.sourceHandle,
            targetHandle: newEdge.targetHandle,
          });
          setEdges((eds) => addEdge(newEdge, eds));

          // Immediately propagate ALL outputs through the new connection
          if (sourceNode.data?.outputs && params.target) {
            const allOutputs = sourceNode.data.outputs;

            // Update target node with ALL source outputs
            setNodes((nds) =>
              nds.map((node) =>
                node.id === params.target
                  ? {
                      ...node,
                      data: {
                        ...node.data,
                        ...allOutputs, // Merge all outputs
                      },
                    }
                  : node,
              ),
            );
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
              outputs: {}, // Ensure outputs is always initialized
            };
            console.log('[addNode] Created ImageInput node with data:', data);
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
          case NodeType.Crop:
            data = {
              aspectRatio: "custom",
              x: 0,
              y: 0,
              width: 1024,
              height: 1024,
              label: "Crop",
              outputs: {},
            };
            break;

          // Action nodes
          case NodeType.GenerateImage:
            data = {
              isGenerating: false,
              status: "ready",
              label: "Generate Image",
              aspectRatio: "1:1",
              outputs: {},
            };
            break;
          case NodeType.GenerateVideo:
            data = {
              isGenerating: false,
              status: "ready",
              label: "Generate Video",
              aspectRatio: "16:9",
              generateAudio: true,
              durationSeconds: 8,
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

    // Validate image file type and size
    const validateImageFile = (
      file: File,
    ): { valid: boolean; error?: string } => {
      const validTypes = ["image/jpeg", "image/png"];
      const maxSize = 10 * 1024 * 1024; // 10MB

      if (!validTypes.includes(file.type)) {
        return {
          valid: false,
          error: "Only JPG and PNG images are supported",
        };
      }

      if (file.size > maxSize) {
        return {
          valid: false,
          error: `Image size exceeds 10MB limit (${(file.size / (1024 * 1024)).toFixed(2)}MB)`,
        };
      }

      return { valid: true };
    };

    // Convert file to data URI
    const readFileAsDataURL = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          resolve(result);
        };
        reader.onerror = () => {
          reject(new Error("Failed to read image file"));
        };
        reader.readAsDataURL(file);
      });
    };

    // Handle drag over for drop zone
    const onDragOver = useCallback((event: React.DragEvent) => {
      event.preventDefault();
      // Check if dragging files or nodes
      const hasFiles = event.dataTransfer.types.includes("Files");
      const hasReactFlow = event.dataTransfer.types.includes(
        "application/reactflow",
      );

      if (hasFiles) {
        event.dataTransfer.dropEffect = "copy";
      } else if (hasReactFlow) {
        event.dataTransfer.dropEffect = "move";
      }
    }, []);

    // Handle drop to add node or create image input nodes from files
    const onDrop = useCallback(
      async (event: React.DragEvent) => {
        event.preventDefault();

        if (!reactFlowWrapper.current || !reactFlowInstance) return;

        // First, try to handle React Flow node drops
        const type = event.dataTransfer.getData(
          "application/reactflow",
        ) as NodeType;

        if (type) {
          // Use screenToFlowPosition (replaces deprecated project method)
          const position = reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });

          addNode(type, position);
          return;
        }

        // Handle file drops
        const files = event.dataTransfer.files;
        if (files.length === 0) return;

        const imageFiles: File[] = [];
        const errors: string[] = [];

        // Validate all files
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const validation = validateImageFile(file);

          if (validation.valid) {
            imageFiles.push(file);
          } else if (validation.error) {
            errors.push(`${file.name}: ${validation.error}`);
          }
        }

        // Show error toasts for invalid files
        errors.forEach((error) => {
          toast({
            title: "Invalid image",
            description: error,
            variant: "destructive",
          });
        });

        // Process valid image files
        if (imageFiles.length > 0) {
          try {
            // Calculate base position for stacking nodes
            const basePosition = reactFlowInstance.screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            });

            // Read all files in parallel
            const imageDataPromises = imageFiles.map((file) =>
              readFileAsDataURL(file).catch((error) => {
                toast({
                  title: "Failed to read image",
                  description: `${file.name}: ${error.message}`,
                  variant: "destructive",
                });
                return null;
              }),
            );

            const imageDataArray = await Promise.all(imageDataPromises);

            // Create nodes for valid image data
            let nodeCount = 0;
            imageDataArray.forEach((imageUrl, index) => {
              if (!imageUrl) return;

              // Stack nodes slightly offset from drop position
              const offsetY = index * 50;
              const position = {
                x: basePosition.x,
                y: basePosition.y + offsetY,
              };

              // Create image input node with image data
              const newNode: WorkflowNode = {
                id: `${NodeType.ImageInput}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: NodeType.ImageInput,
                position,
                data: {
                  imageUrl,
                  file: imageFiles[index],
                  label: "Image Input",
                  outputs: { image: imageUrl },
                },
              };

              setNodes((nds) => [...nds, newNode]);
              nodeCount++;
            });

            // Show success toast
            if (nodeCount > 0) {
              toast({
                title: "Images loaded",
                description: `Created ${nodeCount} image input node${nodeCount > 1 ? "s" : ""}`,
              });
            }
          } catch (error) {
            toast({
              title: "Error loading images",
              description:
                error instanceof Error ? error.message : "Unknown error",
              variant: "destructive",
            });
          }
        }
      },
      [reactFlowInstance, addNode, setNodes, toast, validateImageFile, readFileAsDataURL],
    );

    // Clear canvas
    const clearCanvas = useCallback(() => {
      setNodes([]);
      setEdges([]);
      setCurrentWorkflowId(null);
    }, [setNodes, setEdges]);

    // Load a workflow
    const loadWorkflow = useCallback(
      (workflow: SavedWorkflow) => {
        setNodes(workflow.nodes || []);
        setEdges(workflow.edges || []);
        setCurrentWorkflowId(workflow.id || null);
        toast({
          title: "Workflow loaded",
          description: `"${workflow.name}" has been loaded`,
        });
        // Fit view after loading workflow
        setTimeout(() => {
          if (reactFlowInstance && workflow.nodes.length > 0) {
            reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
          }
        }, 50);
      },
      [setNodes, setEdges, toast, reactFlowInstance],
    );

    // Handle ReactFlow initialization
    const handleInit = useCallback(
      (instance: ReactFlowInstance) => {
        setReactFlowInstance(instance);
        // Only fit view on initial load if there are nodes
        if (!hasInitialized.current && nodes.length > 0) {
          setTimeout(() => {
            instance.fitView({ padding: 0.2, duration: 300 });
          }, 50);
          hasInitialized.current = true;
        }
      },
      [nodes.length],
    );

    // Save workflow handler
    const handleSaveWorkflow = useCallback(() => {
      setIsSaveDialogOpen(true);
    }, []);

    // Load workflow handler (navigate to home)
    const handleLoadWorkflow = useCallback(() => {
      toast({
        title: "Load workflow",
        description: "Go to the Home tab to browse and load workflows",
      });
    }, [toast]);

    // Workflow execution
    const {
      executeWorkflow,
      resetWorkflow,
      executeSingleNode,
      isExecuting,
      executionProgress,
      totalNodes,
    } = useWorkflowExecution(nodes, edges, setNodes, onAssetGenerated);

    // Copy selected nodes
    const copySelectedNodes = useCallback(() => {
      const selectedNodes = nodes.filter((node) => (node as any).selected);
      if (selectedNodes.length === 0) {
        toast({
          title: "No nodes selected",
          description: "Select one or more nodes to copy",
        });
        return;
      }

      // Get IDs of selected nodes
      const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));

      // Copy edges that connect selected nodes
      const relevantEdges = edges.filter(
        (edge) =>
          selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target),
      );

      setCopiedNodes(selectedNodes);
      setCopiedEdges(relevantEdges);

      toast({
        title: "Copied",
        description: `${selectedNodes.length} node${selectedNodes.length > 1 ? "s" : ""} copied to clipboard`,
      });
    }, [nodes, edges, toast]);

    // Paste copied nodes
    const pasteNodes = useCallback(() => {
      if (copiedNodes.length === 0) {
        toast({
          title: "Nothing to paste",
          description: "Copy some nodes first",
        });
        return;
      }

      // Generate new IDs and offset positions
      const idMap = new Map<string, string>();
      const PASTE_OFFSET = 50;

      const newNodes = copiedNodes.map((node) => {
        const newId = `${node.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        idMap.set(node.id, newId);

        return {
          ...node,
          id: newId,
          position: {
            x: node.position.x + PASTE_OFFSET,
            y: node.position.y + PASTE_OFFSET,
          },
          selected: true, // Select the pasted nodes
          data: {
            ...node.data,
            outputs: {}, // Clear outputs
          },
        };
      });

      // Update edges with new IDs
      const newEdges = copiedEdges
        .map((edge) => {
          const newSource = idMap.get(edge.source);
          const newTarget = idMap.get(edge.target);

          if (!newSource || !newTarget) return null;

          return {
            ...edge,
            id: `e-${newSource}-${newTarget}-${Date.now()}`,
            source: newSource,
            target: newTarget,
          };
        })
        .filter((edge): edge is WorkflowEdge => edge !== null);

      // Deselect existing nodes
      setNodes((nds) =>
        nds
          .map((node) => ({ ...node, selected: false }))
          .concat(newNodes as any),
      );
      setEdges((eds) => eds.concat(newEdges));

      toast({
        title: "Pasted",
        description: `${newNodes.length} node${newNodes.length > 1 ? "s" : ""} pasted`,
      });
    }, [copiedNodes, copiedEdges, setNodes, setEdges, toast]);

    // Keyboard shortcuts for copy/paste
    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        // Check if we're in an input/textarea to avoid conflicts
        const target = event.target as HTMLElement;
        const isInputField =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable;

        if (isInputField) return;

        const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
        const modifier = isMac ? event.metaKey : event.ctrlKey;

        if (modifier && event.key === "c") {
          event.preventDefault();
          copySelectedNodes();
        } else if (modifier && event.key === "v") {
          event.preventDefault();
          pasteNodes();
        } else if (event.key === "Delete" || event.key === "Backspace") {
          // Delete selected nodes
          const selectedNodes = nodes.filter((node) => (node as any).selected);
          if (selectedNodes.length > 0) {
            event.preventDefault();
            const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
            setNodes((nds) => nds.filter((n) => !selectedNodeIds.has(n.id)));
            setEdges((eds) =>
              eds.filter(
                (e) =>
                  !selectedNodeIds.has(e.source) &&
                  !selectedNodeIds.has(e.target),
              ),
            );
            toast({
              title: "Deleted",
              description: `${selectedNodes.length} node${selectedNodes.length > 1 ? "s" : ""} deleted`,
            });
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [copySelectedNodes, pasteNodes, nodes, setNodes, setEdges, toast]);

    // Expose loadWorkflow method to parent
    useImperativeHandle(
      ref,
      () => ({
        loadWorkflow,
      }),
      [loadWorkflow],
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
      return () =>
        window.removeEventListener("node-execute", handleNodeExecute);
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
            onInit={handleInit}
            onDrop={onDrop}
            onDragOver={onDragOver}
            isValidConnection={isValidConnection}
            nodeTypes={nodeTypes}
            connectionMode={ConnectionMode.Loose}
            className="bg-background"
            proOptions={{ hideAttribution: true }}
            multiSelectionKeyCode="Shift"
            selectionKeyCode="Shift"
            deleteKeyCode="Delete"
            selectionOnDrag={true}
            panOnDrag={[1, 2]}
            selectNodesOnDrag={true}
            minZoom={0.1}
            maxZoom={4}
            defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
            translateExtent={[
              [-5000, -5000],
              [5000, 5000],
            ]}
            nodeExtent={[
              [-5000, -5000],
              [5000, 5000],
            ]}
          >
            <Background className="bg-background" />
            <Controls className="bg-card border border-border" />
            <WorkflowToolbar
              onClearCanvas={clearCanvas}
              onExecuteWorkflow={executeWorkflow}
              onResetWorkflow={resetWorkflow}
              onSaveWorkflow={handleSaveWorkflow}
              onLoadWorkflow={handleLoadWorkflow}
              isExecuting={isExecuting}
              executionProgress={executionProgress}
              totalNodes={totalNodes}
            />
          </ReactFlow>

          {/* Empty state message */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-muted-foreground max-w-md">
                <p className="text-lg font-medium mb-2">Your canvas is empty</p>
                <p className="text-sm mb-4">
                  Drag nodes from the palette or click on a node to add it
                </p>
                <div className="text-xs space-y-1 bg-muted/50 rounded-lg p-3 pointer-events-auto">
                  <p className="font-medium mb-2">Selection & Shortcuts:</p>
                  <p>
                    • <strong>Drag</strong> on empty canvas to select area
                  </p>
                  <p>
                    • Hold{" "}
                    <kbd className="px-1.5 py-0.5 bg-background rounded border">
                      Shift
                    </kbd>{" "}
                    + Click for multi-select
                  </p>
                  <p>
                    •{" "}
                    <kbd className="px-1.5 py-0.5 bg-background rounded border">
                      Ctrl/Cmd
                    </kbd>{" "}
                    +{" "}
                    <kbd className="px-1.5 py-0.5 bg-background rounded border">
                      C
                    </kbd>{" "}
                    to copy
                  </p>
                  <p>
                    •{" "}
                    <kbd className="px-1.5 py-0.5 bg-background rounded border">
                      Ctrl/Cmd
                    </kbd>{" "}
                    +{" "}
                    <kbd className="px-1.5 py-0.5 bg-background rounded border">
                      V
                    </kbd>{" "}
                    to paste
                  </p>
                  <p>
                    •{" "}
                    <kbd className="px-1.5 py-0.5 bg-background rounded border">
                      Delete
                    </kbd>{" "}
                    to remove
                  </p>
                  <p>
                    • <strong>Right-click</strong> or{" "}
                    <strong>Middle-click</strong> to pan canvas
                  </p>
                  <p>
                    • <strong>Scroll</strong> to zoom in/out
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Save Workflow Dialog */}
        <SaveWorkflowDialog
          open={isSaveDialogOpen}
          onOpenChange={setIsSaveDialogOpen}
          nodes={nodes}
          edges={edges}
          onSaveSuccess={(workflowId) => {
            setCurrentWorkflowId(workflowId);
          }}
        />
      </div>
    );
  },
);

WorkflowCanvasInner.displayName = "WorkflowCanvasInner";

const WorkflowCanvas = forwardRef<WorkflowCanvasRef, WorkflowCanvasProps>(
  ({ onAssetGenerated, onLoadWorkflowRequest }, ref) => {
    return (
      <ReactFlowProvider>
        <WorkflowCanvasInner
          ref={ref}
          onAssetGenerated={onAssetGenerated}
          onLoadWorkflowRequest={onLoadWorkflowRequest}
        />
      </ReactFlowProvider>
    );
  },
);

WorkflowCanvas.displayName = "WorkflowCanvas";

export default WorkflowCanvas;
