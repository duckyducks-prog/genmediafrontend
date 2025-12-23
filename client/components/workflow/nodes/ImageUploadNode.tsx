import { memo, useState } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "reactflow";
import { Button } from "@/components/ui/button";
import { ImageInputNodeData } from "../types";
import { Upload, X, Image as ImageIcon } from "lucide-react";

function ImageUploadNode({ data, id }: NodeProps<ImageInputNodeData>) {
  const [imageUrl, setImageUrl] = useState<string | null>(data.imageUrl);
  const { setNodes } = useReactFlow();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;

        console.log('[ImageUploadNode] Image loaded:', {
          nodeId: id,
          urlLength: url.length,
          urlPreview: url.substring(0, 50) + '...',
          fileType: file.type,
          fileSize: file.size,
        });

        setImageUrl(url);

        // Create new data object with outputs
        const newData = {
          ...data,
          imageUrl: url,
          file,
          outputs: { image: url }, // Ensure outputs is set with the image
        };

        console.log('[ImageUploadNode] Updating node with data:', {
          nodeId: id,
          hasOutputs: !!newData.outputs,
          outputKeys: Object.keys(newData.outputs),
          imageLength: newData.outputs.image?.length || 0,
        });

        // Update node data first
        setNodes((nodes) =>
          nodes.map((node) =>
            node.id === id
              ? {
                  ...node,
                  data: newData,
                }
              : node,
          ),
        );

        // Then trigger propagation with the same data
        console.log('[ImageUploadNode] Dispatching node-update event');
        const updateEvent = new CustomEvent('node-update', {
          detail: {
            id,
            data: newData,
          },
        });
        window.dispatchEvent(updateEvent);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemove = () => {
    console.log('[ImageUploadNode] Removing image from node:', id);

    setImageUrl(null);

    const newData = {
      ...data,
      imageUrl: null,
      file: null,
      outputs: {}, // Clear outputs
    };

    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: newData,
            }
          : node,
      ),
    );

    // Trigger data propagation to downstream nodes
    console.log('[ImageUploadNode] Dispatching node-update event (clear)');
    const updateEvent = new CustomEvent('node-update', {
      detail: {
        id,
        data: newData,
      },
    });
    window.dispatchEvent(updateEvent);
  };

  const status = (data as any).status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";

  const getBorderColor = () => {
    return "border-border";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[250px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-accent" />
          <div className="font-semibold text-sm">
            {data.label || "Image Upload"}
          </div>
        </div>
        {isExecuting && (
          <span className="w-4 h-4 animate-pulse text-yellow-500">⚡</span>
        )}
        {isCompleted && <span className="text-green-500">✓</span>}
      </div>

      {/* Node Content */}
      <div className="space-y-2">
        {imageUrl ? (
          <div className="relative rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center h-48">
            <img
              src={imageUrl}
              alt="Upload preview"
              className="max-w-full max-h-full object-contain"
            />
            <Button
              onClick={handleRemove}
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ) : (
          <label
            htmlFor={`file-upload-${id}`}
            className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary hover:bg-accent/10 transition-colors"
          >
            <Upload className="w-8 h-8 text-muted-foreground mb-2" />
            <span className="text-xs text-muted-foreground">
              Click to upload
            </span>
            <input
              id={`file-upload-${id}`}
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleFileUpload}
            />
          </label>
        )}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        data-connector-type="image"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: 'translateY(-50%)' }}
      />
    </div>
  );
}

export default memo(ImageUploadNode);
