import { memo, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Button } from "@/components/ui/button";
import { OutputNodeData } from "../types";
import {
  Video as VideoIcon,
  CheckCircle2,
  Loader2,
  Download,
  Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function VideoOutputNode({ data, id }: NodeProps<OutputNodeData>) {
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const videoUrl = (data as any).videoUrl || data.result;
  const status = (data as any).status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";

  const getBorderColor = () => {
    if (isExecuting) return "border-yellow-500";
    if (isCompleted) return "border-green-500";
    return "border-border";
  };

  const handleSaveToLibrary = async () => {
    if (!videoUrl || isSaving) return;

    setIsSaving(true);

    try {
      // Extract base64 from data URI or use as-is
      let base64Data = videoUrl;
      if (videoUrl.startsWith("data:")) {
        base64Data = videoUrl.split(",")[1];
      }

      // Try to get the prompt from connected nodes (if available)
      const prompt = (data as any).prompt || "Generated video";

      const response = await fetch(
        "https://veo-api-82187245577.us-central1.run.app/library/save",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: base64Data,
            asset_type: "video",
            prompt: prompt,
            mime_type: "video/mp4",
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save: ${response.status} ${errorText}`);
      }

      const result = await response.json();

      toast({
        title: "Saved to Library",
        description: "Video has been saved to your library",
      });
    } catch (error) {
      console.error("Save to library error:", error);
      toast({
        title: "Failed to save",
        description:
          error instanceof Error ? error.message : "Could not save to library",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
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

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="video-input"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: 'translateY(-50%)' }}
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
            <div className="flex gap-2">
              <Button
                onClick={handleSaveToLibrary}
                disabled={isSaving}
                variant="default"
                size="sm"
                className="flex-1"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-3 h-3 mr-1" />
                    Save
                  </>
                )}
              </Button>
              <Button
                onClick={handleDownload}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                <Download className="w-3 h-3 mr-1" />
                Download
              </Button>
            </div>
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
        style={{ top: "50%", transform: 'translateY(-50%)' }}
      />
    </div>
  );
}

export default memo(VideoOutputNode);
