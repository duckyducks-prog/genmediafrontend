import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Button } from "@/components/ui/button";
import { OutputNodeData } from "../types";
import {
  Video as VideoIcon,
  CheckCircle2,
  Loader2,
  Download,
} from "lucide-react";
import { FilterConfig } from "@/lib/pixi-filter-configs";
import { API_ENDPOINTS } from "@/lib/api-config";
import { auth } from "@/lib/firebase";
import { logger } from "@/lib/logger";

function VideoOutputNode({ data, id }: NodeProps<OutputNodeData>) {
  const videoInput = (data as any).video || (data as any).videoUrl || data.result;
  const filters: FilterConfig[] = (data as any).filters || [];
  const status = (data as any).status || "ready";

  const [displayVideoUrl, setDisplayVideoUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const renderRequestId = useRef(0);

  const isExecuting = status === "executing" || isProcessing;
  const isCompleted = status === "completed";

  // Process video with filters when inputs change
  useEffect(() => {
    if (!videoInput) {
      setDisplayVideoUrl(null);
      return;
    }

    if (filters.length > 0) {
      // Apply filters via backend
      const currentRequestId = ++renderRequestId.current;
      setIsProcessing(true);

      logger.debug("[VideoOutputNode] Applying", filters.length, "filters to video");

      (async () => {
        try {
          const user = auth.currentUser;
          const token = await user?.getIdToken();

          const requestBody: any = {
            filters: filters.map(f => ({ type: f.type, params: f.params })),
          };

          if (videoInput.startsWith("data:")) {
            requestBody.video_base64 = videoInput;
          } else {
            requestBody.video_url = videoInput;
          }

          const response = await fetch(API_ENDPOINTS.video.applyFilters, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Failed to apply filters: ${response.status}`);
          }

          const result = await response.json();
          const filteredVideoUrl = `data:video/mp4;base64,${result.video_base64}`;

          if (currentRequestId === renderRequestId.current) {
            setDisplayVideoUrl(filteredVideoUrl);

            // Update outputs
            const updateEvent = new CustomEvent("node-update", {
              detail: {
                id,
                data: {
                  ...data,
                  outputs: { video: filteredVideoUrl },
                },
              },
            });
            window.dispatchEvent(updateEvent);
          }
        } catch (error) {
          console.error("[VideoOutputNode] Filter processing failed:", error);
          if (currentRequestId === renderRequestId.current) {
            setDisplayVideoUrl(videoInput); // Fallback to original
          }
        } finally {
          if (currentRequestId === renderRequestId.current) {
            setIsProcessing(false);
          }
        }
      })();
    } else {
      // No filters, use original
      setDisplayVideoUrl(videoInput);
    }
  }, [videoInput, JSON.stringify(filters), id, data]);

  const videoUrl = displayVideoUrl;

  const getBorderColor = () => {
    return "border-border";
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
      // Last resort: try opening in new tab
      window.open(videoUrl, "_blank");
    }
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[350px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <VideoIcon className="w-4 h-4 text-accent" />
          <div className="font-semibold text-sm">
            {data.label || "Video Output"}
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
        id="video"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "40%", transform: "translateY(-50%)" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="filters"
        data-connector-type="any"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "60%", transform: "translateY(-50%)" }}
      />

      {/* Node Content */}
      <div className="space-y-2">
        {videoUrl ? (
          <>
            <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
              <video
                src={videoUrl}
                controls
                className="w-full h-auto max-h-[200px]"
              />
            </div>
            <Button
              onClick={handleDownload}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Download className="w-3 h-3 mr-1" />
              Download Video
            </Button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-[150px] border-2 border-dashed border-border rounded-lg bg-muted/30">
            <VideoIcon className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">
              {isExecuting ? "Receiving..." : "No video yet"}
            </p>
            <p className="text-xs text-muted-foreground">
              {!isExecuting && "Run workflow to display"}
            </p>
          </div>
        )}
      </div>

      {/* Output Handle for chaining */}
      <Handle
        type="source"
        position={Position.Right}
        id="media-output"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />
    </div>
  );
}

export default memo(VideoOutputNode);
