import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { DownloadNodeData } from "../types";
import { Download, CheckCircle2, Loader2 } from "lucide-react";
import { renderWithPixi } from "@/lib/pixi-renderer";
import { FilterConfig } from "@/lib/pixi-filter-configs";

function DownloadNode({ data, id }: NodeProps<DownloadNodeData>) {
  const status = (data as any).status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";
  const downloaded = (data as any).downloaded || false;

  const getBorderColor = () => {
    return "border-border";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[200px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Download"}
          </div>
        </div>
        {isExecuting && (
          <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
        )}
        {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
      </div>

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="media-input"
        data-connector-type="any"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: 'translateY(-50%)' }}
      />

      {/* Node Content */}
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground mb-2">
          {isCompleted && downloaded ? (
            <span className="text-green-500 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Downloaded!
            </span>
          ) : isExecuting ? (
            <span className="text-yellow-500">Processing...</span>
          ) : (
            <span>Waiting to run</span>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2 p-2 bg-background/50 rounded border border-border">
            <Download className="w-4 h-4 text-primary" />
            <span className="text-xs">Auto-download on run</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight px-1">
            Note: Browser may block auto-download. Use output node's download
            button if needed.
          </p>
        </div>
      </div>
    </div>
  );
}

export default memo(DownloadNode);
