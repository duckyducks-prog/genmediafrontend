import { memo, useState, useEffect } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { CheckCircle2, Loader2, Eye } from "lucide-react";

export interface PreviewNodeData {
  label: string;
  status?: "ready" | "executing" | "completed" | "error";
  error?: string;
  imageUrl?: string;
  videoUrl?: string;
  textContent?: string;
  outputs?: Record<string, any>;
}

function PreviewNode({ data, id }: NodeProps<PreviewNodeData>) {
  const [displayContent, setDisplayContent] = useState<{
    type: "image" | "video" | "text" | "none";
    content: string;
  }>({ type: "none", content: "" });

  const status = (data as any).status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";

  useEffect(() => {
    // Determine what content to display based on available data
    if ((data as any).imageUrl) {
      setDisplayContent({ type: "image", content: (data as any).imageUrl });
    } else if ((data as any).videoUrl) {
      setDisplayContent({ type: "video", content: (data as any).videoUrl });
    } else if ((data as any).textContent) {
      setDisplayContent({ type: "text", content: (data as any).textContent });
    } else {
      setDisplayContent({ type: "none", content: "" });
    }
  }, [(data as any).imageUrl, (data as any).videoUrl, (data as any).textContent]);

  const getBorderColor = () => {
    if (isExecuting) return "border-yellow-500";
    if (isCompleted) return "border-green-500";
    return "border-border";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[300px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-accent" />
          <div className="font-semibold text-sm">
            {data.label || "Preview"}
          </div>
        </div>
        {isExecuting && (
          <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
        )}
        {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
      </div>

      {/* Input Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        data-connector-type="image"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "30%", transform: "translateY(-50%)" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="video"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="text"
        data-connector-type="text"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "70%", transform: "translateY(-50%)" }}
      />

      {/* Node Content */}
      <div className="space-y-3">
        {displayContent.type === "image" && displayContent.content ? (
          <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
            <img
              src={displayContent.content}
              alt="Preview"
              className="w-full h-auto max-h-[250px] object-contain"
              crossOrigin={
                displayContent.content?.startsWith("data:") ? undefined : "anonymous"
              }
              onError={(e) => {
                console.error("[PreviewNode] Image failed to load");
              }}
            />
          </div>
        ) : displayContent.type === "video" && displayContent.content ? (
          <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
            <video
              src={displayContent.content}
              controls
              className="w-full h-auto max-h-[250px] object-contain bg-black"
              onError={(e) => {
                console.error("[PreviewNode] Video failed to load");
              }}
            />
          </div>
        ) : displayContent.type === "text" && displayContent.content ? (
          <div className="bg-muted border border-border rounded-lg p-3 max-h-[250px] overflow-y-auto">
            <p className="text-sm text-foreground whitespace-pre-wrap break-words">
              {displayContent.content}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[150px] border-2 border-dashed border-border rounded-lg bg-muted/30">
            <Eye className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">
              {isExecuting ? "Receiving..." : "No content to preview"}
            </p>
            <p className="text-xs text-muted-foreground">
              {!isExecuting && "Connect inputs to display"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(PreviewNode);
