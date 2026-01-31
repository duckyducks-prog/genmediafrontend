import { memo, useState, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "reactflow";
import { Stamp, Loader2, CheckCircle2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { NodeLockToggle } from "../NodeLockToggle";

export interface VideoWatermarkNodeData {
  label: string;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  opacity: number;
  scale: number;
  margin: number;
  status?: "ready" | "executing" | "completed" | "error";
  error?: string;
  outputs?: Record<string, any>;
  locked?: boolean;
  readOnly?: boolean;
}

function VideoWatermarkNode({ data, id }: NodeProps<VideoWatermarkNodeData>) {
  const { setNodes: _setNodes } = useReactFlow();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const status = data.status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";

  const handleUpdate = (field: string, value: any) => {
    if (data.readOnly) return;
    const event = new CustomEvent("node-update", {
      detail: {
        id,
        data: { ...data, [field]: value },
      },
    });
    window.dispatchEvent(event);
  };

  const toggleLock = () => {
    handleUpdate("locked", !data.locked);
  };

  // Don't auto-process - wait for workflow execution
  // This prevents "Failed to fetch" errors from large payloads
  // and ensures proper execution order
  useEffect(() => {
    const videoInput = (data as any).video || (data as any).videoInput;
    const watermarkInput = (data as any).watermark || (data as any).image;

    // Just update preview URL from outputs if execution completed
    if (data.outputs?.video && !previewUrl) {
      setPreviewUrl(data.outputs.video);
    }

    // Clear preview if inputs are removed
    if (!videoInput || !watermarkInput) {
      setPreviewUrl(null);
    }
  }, [
    (data as any).video,
    (data as any).videoInput,
    (data as any).watermark,
    (data as any).image,
    data.outputs?.video,
    previewUrl,
  ]);

  const getBorderColor = () => {
    if (status === "error") return "border-red-500";
    return "border-border";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Stamp className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Video Compositing"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <NodeLockToggle
            locked={!!data.locked}
            onToggle={toggleLock}
            disabled={data.readOnly}
          />
          {isExecuting && (
            <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
          )}
          {isCompleted && !isExecuting && (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          )}
        </div>
      </div>

      {/* Input Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="video"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "30%", transform: "translateY(-50%)" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="watermark"
        data-connector-type="image"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />

      {/* Controls */}
      <div className="space-y-3 mb-3">
        {/* Position */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Position
          </label>
          <Select
            value={data.position}
            onValueChange={(value) => handleUpdate("position", value)}
            disabled={data.readOnly}
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue placeholder="Select position" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top-left">Top Left</SelectItem>
              <SelectItem value="top-right">Top Right</SelectItem>
              <SelectItem value="bottom-left">Bottom Left</SelectItem>
              <SelectItem value="bottom-right">Bottom Right</SelectItem>
              <SelectItem value="center">Center</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Opacity */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Opacity: {Math.round(data.opacity * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={data.opacity * 100}
            onChange={(e) => handleUpdate("opacity", parseInt(e.target.value) / 100)}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={data.readOnly}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer nodrag"
          />
        </div>

        {/* Scale */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Size: {Math.round(data.scale * 100)}%
          </label>
          <input
            type="range"
            min="5"
            max="50"
            value={data.scale * 100}
            onChange={(e) => handleUpdate("scale", parseInt(e.target.value) / 100)}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={data.readOnly}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer nodrag"
          />
        </div>

        {/* Margin */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Margin: {data.margin}px
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={data.margin}
            onChange={(e) => handleUpdate("margin", parseInt(e.target.value))}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={data.readOnly}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer nodrag"
          />
        </div>
      </div>

      {/* Preview */}
      {previewUrl && (
        <div className="mb-3">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Preview:
          </div>
          <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
            <video
              src={previewUrl}
              controls
              className="w-full h-auto max-h-[120px] object-contain bg-black"
            />
          </div>
        </div>
      )}

      {/* Error Display */}
      {data.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
          <div className="text-xs text-red-500">{data.error}</div>
        </div>
      )}

      {/* Input Labels */}
      <div className="text-[10px] text-muted-foreground space-y-1 mb-3">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <span>Video Input</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-purple-500"></div>
          <span>Watermark Image (PNG)</span>
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="video"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />
    </div>
  );
}

export default memo(VideoWatermarkNode);
