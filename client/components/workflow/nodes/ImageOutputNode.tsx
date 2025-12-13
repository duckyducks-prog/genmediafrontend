import { memo, useState, useEffect } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OutputNodeData } from "../types";
import {
  Image as ImageIcon,
  CheckCircle2,
  Loader2,
  Download,
  Sparkles,
} from "lucide-react";

function ImageOutputNode({ data, id }: NodeProps<OutputNodeData>) {
  const [upscaleFactor, setUpscaleFactor] = useState<string>("x2");
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [upscaleError, setUpscaleError] = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);

  const incomingImageUrl = (data as any).imageUrl || data.result;
  const imageUrl = currentImageUrl || incomingImageUrl;
  const status = (data as any).status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";

  // Debug logging
  useEffect(() => {
    console.log('[ImageOutputNode] Data update:', {
      nodeId: id,
      incomingImageUrl: incomingImageUrl ? `${incomingImageUrl.substring(0, 50)}...` : null,
      currentImageUrl: currentImageUrl ? `${currentImageUrl.substring(0, 50)}...` : null,
      status,
      data
    });
  }, [data, incomingImageUrl, currentImageUrl, status, id]);

  // Reset to new incoming image when workflow executes
  useEffect(() => {
    if (incomingImageUrl && incomingImageUrl !== currentImageUrl) {
      console.log('[ImageOutputNode] Resetting to new incoming image');
      setCurrentImageUrl(null); // Reset to show the new incoming image
      setUpscaleError(null); // Clear any previous errors
    }
  }, [incomingImageUrl, currentImageUrl]);

  const getBorderColor = () => {
    if (isExecuting) return "border-yellow-500";
    if (isCompleted) return "border-green-500";
    return "border-border";
  };

  const handleUpscale = async () => {
    if (!imageUrl || isUpscaling) return;

    setIsUpscaling(true);
    setUpscaleError(null);

    try {
      // Extract base64 from data URI or use as-is
      let base64Image = imageUrl;
      if (imageUrl.startsWith("data:")) {
        // Remove data:image/png;base64, prefix
        base64Image = imageUrl.split(",")[1];
      }

      const response = await fetch(
        "https://veo-api-82187245577.us-central1.run.app/upscale/image",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: base64Image,
            upscale_factor: upscaleFactor,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upscale failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();

      if (result.image) {
        // Update to upscaled image
        const mimeType = result.mime_type || "image/png";
        setCurrentImageUrl(`data:${mimeType};base64,${result.image}`);
      } else {
        throw new Error("No image returned from upscale API");
      }
    } catch (error) {
      console.error("Upscale error:", error);
      setUpscaleError(
        error instanceof Error ? error.message : "Upscale failed",
      );
    } finally {
      setIsUpscaling(false);
    }
  };

  const handleDownload = async () => {
    if (!imageUrl) return;

    try {
      // For base64 data URIs, download directly
      if (imageUrl.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = imageUrl;
        link.download = `generated-image-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // For external URLs, try to fetch with CORS mode
      try {
        const response = await fetch(imageUrl, { mode: "cors" });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `generated-image-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (fetchError) {
        // Fallback: open in new tab if CORS fails
        window.open(imageUrl, "_blank");
      }
    } catch (error) {
      console.error("Download failed:", error);
      // Last resort: try direct link
      window.open(imageUrl, "_blank");
    }
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[300px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-accent" />
          <div className="font-semibold text-sm">
            {data.label || "Image Output"}
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
        id="image-input"
        data-connector-type="image"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />

      {/* Node Content */}
      <div className="space-y-2">
        {imageUrl ? (
          <>
            <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
              <img
                src={imageUrl}
                alt="Generated output"
                className="w-full h-auto max-h-[200px] object-contain"
                onError={(e) => {
                  console.error('[ImageOutputNode] Image failed to load:', imageUrl?.substring(0, 100));
                }}
                crossOrigin={imageUrl?.startsWith('data:') ? undefined : 'anonymous'}
              />
            </div>

            {/* Upscale Controls */}
            <div className="flex gap-2 items-center">
              <Select
                value={upscaleFactor}
                onValueChange={setUpscaleFactor}
                disabled={isUpscaling}
              >
                <SelectTrigger className="w-20 h-8">
                  <SelectValue placeholder="x2" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="x2">x2</SelectItem>
                  <SelectItem value="x3">x3</SelectItem>
                  <SelectItem value="x4">x4</SelectItem>
                </SelectContent>
              </Select>

              <Button
                onClick={handleUpscale}
                disabled={isUpscaling}
                variant="secondary"
                size="sm"
                className="flex-1"
              >
                {isUpscaling ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Upscaling...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 mr-1" />
                    Upscale
                  </>
                )}
              </Button>
            </div>

            {/* Error Message */}
            {upscaleError && (
              <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
                {upscaleError}
              </div>
            )}

            {/* Download Button */}
            <Button
              onClick={handleDownload}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Download className="w-3 h-3 mr-1" />
              Download Image
            </Button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-[150px] border-2 border-dashed border-border rounded-lg bg-muted/30">
            <ImageIcon className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">
              {isExecuting ? "Receiving..." : "No image yet"}
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
        data-connector-type="image"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />
    </div>
  );
}

export default memo(ImageOutputNode);
