import { memo, useState, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "reactflow";
import { DownloadNodeData } from "../types";
import { Download, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { createMediaZip, downloadBlob } from "@/lib/zip-utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function DownloadNode({ data, id }: NodeProps<DownloadNodeData>) {
  const { getEdges, getNodes } = useReactFlow();
  const [isDownloading, setIsDownloading] = useState(false);
  const [connectedMedia, setConnectedMedia] = useState<
    Array<{ type: "image" | "video"; url: string }>
  >([]);

  // Detect connected media from incoming edges
  useEffect(() => {
    const edges = getEdges();
    const nodes = getNodes();

    const incomingEdges = edges.filter((edge) => edge.target === id);
    const media: Array<{ type: "image" | "video"; url: string }> = [];

    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode || !sourceNode.data) continue;

      const nodeData = sourceNode.data as any;

      // Extract image/video URLs from various node types
      const imageUrl =
        nodeData.imageUrl ||
        nodeData.image ||
        nodeData.outputs?.image ||
        nodeData.outputs?.images?.[0];

      const videoUrl =
        nodeData.videoUrl ||
        nodeData.video ||
        nodeData.outputs?.video ||
        nodeData.outputs?.videos?.[0];

      const textContent =
        nodeData.textContent || nodeData.outputs?.text || nodeData.text;

      if (imageUrl && typeof imageUrl === "string") {
        media.push({ type: "image", url: imageUrl });
      } else if (videoUrl && typeof videoUrl === "string") {
        media.push({ type: "video", url: videoUrl });
      } else if (
        textContent &&
        typeof textContent === "string" &&
        textContent.startsWith("data:")
      ) {
        // Handle text that's been converted to data URL
        media.push({ type: "image", url: textContent });
      }

      // Handle arrays of images
      if (
        Array.isArray(nodeData.images) ||
        Array.isArray(nodeData.outputs?.images)
      ) {
        const images = nodeData.images || nodeData.outputs?.images;
        for (const img of images) {
          if (typeof img === "string") {
            media.push({ type: "image", url: img });
          }
        }
      }
    }

    setConnectedMedia(media);
  }, [id, getEdges, getNodes]);

  const handleDownload = async () => {
    if (connectedMedia.length === 0) {
      toast.error("No media connected to download");
      return;
    }

    setIsDownloading(true);

    try {
      if (connectedMedia.length === 1) {
        // Single file: download directly without ZIP
        const media = connectedMedia[0];
        const link = document.createElement("a");

        // Get file extension from data URL
        const mimeMatch = media.url.match(/data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : "application/octet-stream";

        const ext = mimeType.includes("image")
          ? mimeType.split("/")[1] || "png"
          : mimeType.split("/")[1] || "mp4";

        link.href = media.url;
        link.download = `${media.type}.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success("File downloaded!");
      } else {
        // Multiple files: create ZIP
        const filesToZip = connectedMedia.map((media, index) => ({
          ...media,
          index,
        }));

        const zipBlob = await createMediaZip(filesToZip);
        downloadBlob(zipBlob, "media-export.zip");

        toast.success(`Downloaded ${connectedMedia.length} files in ZIP`);
      }
    } catch (error) {
      console.error("[DownloadNode] Download error:", error);
      toast.error(
        `Download failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const isEmpty = connectedMedia.length === 0;

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[250px] shadow-lg transition-colors ${
        isEmpty ? "border-border" : "border-primary/30"
      }`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">{data.label || "Download"}</div>
        </div>
        {isDownloading && (
          <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
        )}
      </div>

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="media-input"
        data-connector-type="any"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />

      {/* Node Content */}
      <div className="space-y-3">
        {isEmpty ? (
          <div className="flex items-start gap-2 p-2 bg-muted/50 rounded border border-border">
            <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Connect image or video nodes to download media
            </p>
          </div>
        ) : (
          <>
            {/* Connected Media List */}
            <div className="space-y-1 p-2 bg-background/50 rounded border border-border">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Connected media ({connectedMedia.length}):
              </p>
              <div className="space-y-1">
                {connectedMedia.map((media, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 text-xs text-foreground"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                    <span className="capitalize">{media.type}</span>
                    <span className="text-muted-foreground">#{index + 1}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Download Button */}
            <Button
              onClick={handleDownload}
              disabled={isDownloading}
              variant="default"
              size="sm"
              className="w-full"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  Downloading...
                </>
              ) : connectedMedia.length === 1 ? (
                <>
                  <Download className="w-3 h-3 mr-2" />
                  Download File
                </>
              ) : (
                <>
                  <Download className="w-3 h-3 mr-2" />
                  Download ZIP ({connectedMedia.length})
                </>
              )}
            </Button>

            {/* Info Text */}
            <p className="text-[10px] text-muted-foreground leading-tight px-1">
              {connectedMedia.length === 1
                ? "Click to download the file in full quality"
                : "Multiple files will be packaged in a ZIP archive"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default memo(DownloadNode);
