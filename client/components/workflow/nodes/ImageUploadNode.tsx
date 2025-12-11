import { memo, useState } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { Button } from '@/components/ui/button';
import { ImageUploadNodeData } from '../types';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

function ImageUploadNode({ data, id }: NodeProps<ImageUploadNodeData>) {
  const [imageUrl, setImageUrl] = useState<string | null>(data.imageUrl);
  const { setNodes } = useReactFlow();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setImageUrl(url);
        
        // Update node data
        setNodes((nodes) =>
          nodes.map((node) =>
            node.id === id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    imageUrl: url,
                    file,
                  },
                }
              : node
          )
        );
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemove = () => {
    setImageUrl(null);
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                imageUrl: null,
                file: null,
              },
            }
          : node
      )
    );
  };

  const status = (data as any).status || 'ready';
  const isExecuting = status === 'executing';
  const isCompleted = status === 'completed';

  const getBorderColor = () => {
    if (isExecuting) return 'border-yellow-500';
    if (isCompleted) return 'border-green-500';
    return 'border-border';
  };

  return (
    <div className={`bg-card border-2 rounded-lg p-4 min-w-[250px] shadow-lg transition-colors ${getBorderColor()}`}>
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-accent" />
          <div className="font-semibold text-sm">{data.label || 'Image Upload'}</div>
        </div>
        {isExecuting && <span className="w-4 h-4 animate-pulse text-yellow-500">⚡</span>}
        {isCompleted && <span className="text-green-500">✓</span>}
      </div>

      {/* Node Content */}
      <div className="space-y-2">
        {imageUrl ? (
          <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
            <img src={imageUrl} alt="Upload preview" className="w-full h-32 object-cover" />
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
            className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-lg cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors nodrag"
          >
            <Upload className="w-6 h-6 mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Click to upload</p>
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
        id="image-output"
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
        style={{ top: '50%' }}
      />
    </div>
  );
}

export default memo(ImageUploadNode);
