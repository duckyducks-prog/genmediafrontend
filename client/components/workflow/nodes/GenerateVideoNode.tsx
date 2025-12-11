import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Button } from "@/components/ui/button";
import { GenerateVideoNodeData } from "../types";
import {
  Sparkles,
  Loader2,
  Video as VideoIcon,
  CheckCircle2,
  AlertCircle,
  Download,
} from "lucide-react";

function GenerateVideoNode({ data, id }: NodeProps<GenerateVideoNodeData>) {
  const status = data.status || "ready";
  const isGenerating = status === "executing";
  const isCompleted = status === "completed";
  const isError = status === "error";
  const videoUrl = (data as any).videoUrl;

  const getBorderColor = () => {
    if (isGenerating) return "border-yellow-500";
    if (isCompleted) return "border-green-500";
    if (isError) return "border-red-500";
    return "border-primary/50";
  };

  const getStatusText = () => {
    if (isGenerating) return "Generating...";
    if (isCompleted) return "Completed";
    if (isError) return data.error || "Error";
    return "Ready";
  };

  const handleDownload = async () => {
    if (!videoUrl) return;

    try {
      // For base64 data URIs, download directly
      if (videoUrl.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = videoUrl;
        link.download = `generated-video-${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // For external URLs, try to fetch with CORS mode
      try {
        const response = await fetch(videoUrl, { mode: "cors" });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `generated-video-${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (fetchError) {
        // Fallback: open in new tab if CORS fails
        window.open(videoUrl, "_blank");
      }
    } catch (error) {
      console.error("Download failed:", error);
      window.open(videoUrl, "_blank");
    }
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[240px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <VideoIcon className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">Generate Video</div>
        </div>
        {isGenerating && (
          <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
        )}
        {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        {isError && <AlertCircle className="w-4 h-4 text-red-500" />}
      </div>

      {/* Input Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="prompt-input"
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
        style={{ top: "25%" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="first-frame-input"
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
        style={{ top: "50%" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="last-frame-input"
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
        style={{ top: "75%" }}
      />

      {/* Node Content */}
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">
          Status: <span className="font-medium">{getStatusText()}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="w-3 h-3" />
          <span>AI Video Generation</span>
        </div>

        {data.promptInput && (
          <div className="text-xs p-2 bg-background/50 rounded border border-border">
            <div className="font-medium mb-1">Prompt:</div>
            <div className="line-clamp-2">{data.promptInput}</div>
          </div>
        )}

        {isCompleted && videoUrl && (
          <Button
            onClick={handleDownload}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <Download className="w-3 h-3 mr-1" />
            Download
          </Button>
        )}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="video-output"
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
        style={{ top: "50%" }}
      />
    </div>
  );
}

export default memo(GenerateVideoNode);
