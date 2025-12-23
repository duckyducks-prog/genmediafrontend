import { memo, useState, useCallback, useRef } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "reactflow";
import { Button } from "@/components/ui/button";
import { Upload, X, Film, Play, FolderOpen } from "lucide-react";
import { VideoInputNodeData } from "../types";

function VideoUploadNode({ data, id }: NodeProps<VideoInputNodeData>) {
  const [videoUrl, setVideoUrl] = useState<string | null>(data.videoUrl || null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(data.thumbnailUrl || null);
  const [showPreview, setShowPreview] = useState(false);
  const [duration, setDuration] = useState<number | null>(data.duration || null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { setNodes } = useReactFlow();

  // Generate thumbnail from video at 1 second mark
  const generateThumbnail = useCallback((videoElement: HTMLVideoElement): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }

      // Wait for video to load metadata
      videoElement.onloadedmetadata = () => {
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        
        // Seek to 1 second (or 10% of duration, whichever is smaller)
        const seekTime = Math.min(1, videoElement.duration * 0.1);
        videoElement.currentTime = seekTime;
      };

      // Capture frame when seeked
      videoElement.onseeked = () => {
        ctx.drawImage(videoElement, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
    });
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('video/')) {
      console.error('[VideoUploadNode] Invalid file type:', file.type);
      return;
    }

    const url = URL.createObjectURL(file);
    setVideoUrl(url);

    // Create temporary video element to extract metadata and thumbnail
    const tempVideo = document.createElement('video');
    tempVideo.src = url;
    tempVideo.muted = true;

    tempVideo.onloadedmetadata = async () => {
      const videoDuration = tempVideo.duration;
      setDuration(videoDuration);

      // Generate thumbnail
      const thumb = await generateThumbnail(tempVideo);
      setThumbnailUrl(thumb);

      // Read file as data URL for output
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;

        const newData = {
          ...data,
          videoUrl: url, // Object URL for preview
          file,
          duration: videoDuration,
          thumbnailUrl: thumb,
          outputs: { video: dataUrl }, // Data URL for downstream nodes
        };

        console.log('[VideoUploadNode] Video loaded:', {
          nodeId: id,
          duration: videoDuration,
          fileSize: file.size,
          fileType: file.type,
        });

        // Update React Flow node
        setNodes((nodes) =>
          nodes.map((node) =>
            node.id === id ? { ...node, data: newData } : node
          )
        );

        // Dispatch for propagation
        window.dispatchEvent(new CustomEvent('node-update', {
          detail: { id, data: newData },
        }));
      };
      reader.readAsDataURL(file);
    };
  }, [id, data, setNodes, generateThumbnail]);

  const handleRemove = useCallback(() => {
    setVideoUrl(null);
    setThumbnailUrl(null);
    setDuration(null);

    const newData = {
      ...data,
      videoUrl: null,
      file: null,
      videoRef: undefined,
      duration: undefined,
      thumbnailUrl: null,
      outputs: {},
    };

    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id ? { ...node, data: newData } : node
      )
    );

    window.dispatchEvent(new CustomEvent('node-update', {
      detail: { id, data: newData },
    }));
  }, [id, data, setNodes]);

  const handleBrowseLibrary = useCallback(() => {
    // Dispatch event to open Asset Library with video filter
    window.dispatchEvent(new CustomEvent('open-asset-library', {
      detail: { assetType: 'video', targetNodeId: id },
    }));
  }, [id]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const status = (data as any).status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[250px] shadow-lg transition-colors border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-accent" />
          <div className="font-semibold text-sm">{data.label || "Video Input"}</div>
        </div>
        {isExecuting && <span className="w-4 h-4 animate-pulse text-yellow-500">⚡</span>}
        {isCompleted && <span className="text-green-500">✓</span>}
      </div>

      {/* Content */}
      <div className="space-y-2">
        {videoUrl ? (
          <div className="relative group">
            {/* Thumbnail with play overlay */}
            <div 
              className="relative rounded-lg overflow-hidden border border-border bg-muted cursor-pointer"
              onMouseEnter={() => setShowPreview(true)}
              onMouseLeave={() => setShowPreview(false)}
            >
              {showPreview ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  autoPlay
                  loop
                  muted
                  className="w-full h-32 object-cover"
                />
              ) : (
                <>
                  <img 
                    src={thumbnailUrl || ''} 
                    alt="Video thumbnail"
                    className="w-full h-32 object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="w-12 h-12 text-white/90" fill="white" />
                  </div>
                </>
              )}
            </div>

            {/* Remove button */}
            <Button
              onClick={handleRemove}
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </Button>

            {/* Duration badge */}
            {duration && (
              <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-2 py-0.5 rounded">
                {formatDuration(duration)}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Upload area */}
            <label
              htmlFor={`file-upload-${id}`}
              className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary hover:bg-accent/10 transition-colors"
            >
              <Upload className="w-8 h-8 text-muted-foreground mb-2" />
              <span className="text-xs text-muted-foreground">Click to upload video</span>
              <input
                id={`file-upload-${id}`}
                type="file"
                className="hidden"
                accept="video/*"
                onChange={handleFileUpload}
              />
            </label>

            {/* Browse Library button */}
            <Button
              onClick={handleBrowseLibrary}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Browse Library
            </Button>
          </div>
        )}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="video"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%" }}
      />
    </div>
  );
}

export default memo(VideoUploadNode);
