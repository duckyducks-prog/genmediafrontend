import { memo, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "reactflow";
import { Textarea } from "@/components/ui/textarea";
import { PromptNodeData } from "../types";
import { Type, CheckCircle2, Loader2, Power } from "lucide-react";

function PromptInputNode({ data, id }: NodeProps<PromptNodeData>) {
  const { setNodes } = useReactFlow();
  const isEnabled = data.enabled !== false; // Default to enabled

  // ✅ Initialize outputs when component mounts or prompt changes externally
  // This ensures downstream nodes can read the prompt even before user edits
  useEffect(() => {
    if (data.prompt && (!data.outputs || data.outputs.text !== data.prompt)) {
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  outputs: { text: data.prompt },
                },
              }
            : node,
        ),
      );
    }
  }, [id, data.prompt, data.outputs, setNodes]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Block changes in read-only mode
    if (data.readOnly) return;

    const newPrompt = e.target.value;
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                prompt: newPrompt,
                outputs: { text: newPrompt }, // Store output for downstream nodes
              },
            }
          : node,
      ),
    );
  };

  const handleToggleEnabled = () => {
    if (data.readOnly) return;
    const event = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          enabled: !isEnabled,
        },
      },
    });
    window.dispatchEvent(event);
  };

  const status = (data as any).status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";

  const getBorderColor = () => {
    if (!isEnabled) return "border-muted";
    return "border-border";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg transition-colors ${getBorderColor()} ${!isEnabled ? "opacity-50" : ""}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Text Input"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Enable/Disable Toggle */}
          <button
            onClick={handleToggleEnabled}
            disabled={data.readOnly}
            className={`p-1 rounded transition-colors ${
              isEnabled
                ? "text-green-500 hover:bg-green-500/10"
                : "text-muted-foreground hover:bg-muted"
            }`}
            title={isEnabled ? "Disable node" : "Enable node"}
          >
            <Power className="w-4 h-4" />
          </button>
          {isExecuting && (
            <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
          )}
          {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        </div>
      </div>

      {/* Node Content */}
      <div>
        <Textarea
          defaultValue={data.prompt}
          onChange={handleChange}
          placeholder="Enter your prompt..."
          className="min-h-[100px] nodrag"
          disabled={data.readOnly || !isEnabled}
        />
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        data-connector-type="text"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: 'translateY(-50%)' }}
      />
    </div>
  );
}

export default memo(PromptInputNode);
