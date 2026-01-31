import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Button } from "@/components/ui/button";
import { OutputNodeData, FilterConfig } from "../types";
import { API_ENDPOINTS } from "@/lib/api-config";
import { auth } from "@/lib/firebase";
import {
  Video as VideoIcon,
  CheckCircle2,
  Loader2,
  Download,
} from "lucide-react";

const logger = {
  info: (...args: any[]) => console.log("[VideoOutputNode]", ...args),
  error: (...args: any[]) => console.error("[VideoOutputNode]", ...args),
  warn: (...args: any[]) => console.warn("[VideoOutputNode]", ...args),
};

async function applyFiltersToVideo(
  videoDataUrl: string,
  filters: FilterConfig[],
): Promise<string> {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("User not authenticated");
    }
    const token = await user.getIdToken();

    // Extract base64 from data URL if present
    let videoBase64 = videoDataUrl;
    if (videoDataUrl.startsWith("data:")) {
      const commaIndex = videoDataUrl.indexOf(",");
      if (commaIndex !== -1) {
        videoBase64 = videoDataUrl.substring(commaIndex + 1);
      }
    }

    logger.info("Applying filters to video:", filters);

    const response = await fetch(API_ENDPOINTS.video.applyFilters, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        video_base64: videoBase64,
        filters: filters,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }

    const result = await response.json();
    logger.info("Video filters applied successfully");
    return `data:video/mp4;base64,${result.video_base64}`;
  } catch (error) {
    logger.error("[applyFiltersToVideo] Failed:", error);
    throw error;
  }
}

function VideoOutputNode({ data, id: _id }: NodeProps<OutputNodeData>) {
  const videoInput = (data as any).videoInput;
  const filterInputs = (data as any).filterInputs || [];
  const status = (data as any).status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";

  const [displayVideo, setDisplayVideo] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const renderRequestId = useRef(0);

  // Collect all filter configurations from connected filter nodes
  const filters: FilterConfig[] = filterInputs.flatMap(
    (input: any) => input?.filters || [],
  );

  // Process video with filters when inputs change
  useEffect(() => {
    if (!videoInput) {
      setDisplayVideo(null);
      return;
    }

    // If we have filters, apply them to the video
    if (filters.length > 0) {
      const currentRequestId = ++renderRequestId.current;
      setIsRendering(true);

      applyFiltersToVideo(videoInput, filters)
        .then((rendered) => {
          if (currentRequestId === renderRequestId.current) {
            setDisplayVideo(rendered);
          }
        })
        .catch((error) => {
          if (currentRequestId === renderRequestId.current) {
            logger.error("Video filter render failed:", error);
            setDisplayVideo(videoInput); // Fallback to unfiltered
          }
        })
        .finally(() => {
          if (currentRequestId === renderRequestId.current) {
            setIsRendering(false);
          }
        });
    } else {
      // No filters, show video directly
      setDisplayVideo(videoInput);
    }
  }, [videoInput, JSON.stringify(filters)]);

  const getBorderColor = () => {
    return "border-border";
  };

  const handleDownload = async () => {
    if (!displayVideo) return;

    try {
      // For base64 data URIs, download directly
      if (displayVideo.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = displayVideo;
        link.download = `generated-video-${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // For external URLs, try to fetch with CORS mode
      try {
        const response = await fetch(displayVideo, { mode: "cors" });
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
        window.open(displayVideo, "_blank");
      }
    } catch (error) {
      console.error("Download failed:", error);
      // Last resort: try opening in new tab
      window.open(displayVideo, "_blank");
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
        id="video-input"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "40%", transform: "translateY(-50%)" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="filter-input"
        data-connector-type="filter"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "60%", transform: "translateY(-50%)" }}
      />

      {/* Node Content */}
      <div className="space-y-2">
        {isRendering && (
          <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Applying filters...
          </div>
        )}
        {displayVideo ? (
          <>
            <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
              <video
                src={displayVideo}
                controls
                className="w-full h-auto max-h-[200px]"
              />
            </div>
            <Button
              onClick={handleDownload}
              variant="outline"
              size="sm"
              className="w-full"
              disabled={isRendering}
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
