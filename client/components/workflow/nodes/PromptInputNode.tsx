import { memo } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "reactflow";
import { Textarea } from "@/components/ui/textarea";
import { PromptNodeData } from "../types";
import { Type, CheckCircle2, Loader2 } from "lucide-react";

function PromptInputNode({ data, id }: NodeProps<PromptNodeData>) {
  const { setNodes } = useReactFlow();

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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

  const status = (data as any).status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";

  const getBorderColor = () => {
    if (isExecuting) return "border-yellow-500";
    if (isCompleted) return "border-green-500";
    return "border-border";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Prompt Input"}
          </div>
        </div>
        {isExecuting && (
          <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
        )}
        {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
      </div>

      {/* Node Content */}
      <div>
        <Textarea
          defaultValue={data.prompt}
          onChange={handleChange}
          placeholder="Enter your prompt..."
          className="min-h-[100px] nodrag"
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
