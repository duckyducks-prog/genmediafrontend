import { memo, useEffect, useState } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { OutputNodeData } from '../types';
import { Image as ImageIcon } from 'lucide-react';

function ImageOutputNode({ data, id }: NodeProps<OutputNodeData>) {
  const [imageUrl, setImageUrl] = useState<string | null>(data.result);
  const { getNode, getEdges } = useReactFlow();

  useEffect(() => {
    // Listen for updates from connected nodes
    const edges = getEdges();
    const incomingEdges = edges.filter((edge) => edge.target === id);

    if (incomingEdges.length > 0) {
      const edge = incomingEdges[0];
      const sourceNode = getNode(edge.source);
      
      if (sourceNode && (sourceNode.data as any).result) {
        setImageUrl((sourceNode.data as any).result);
      }
    }
  }, [id, getEdges, getNode]);

  return (
    <div className="bg-card border-2 border-border rounded-lg p-4 min-w-[300px] shadow-lg">
      {/* Node Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
        <ImageIcon className="w-4 h-4 text-accent" />
        <div className="font-semibold text-sm">{data.label || 'Image Output'}</div>
      </div>

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="image-input"
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
        style={{ top: '50%' }}
      />

      {/* Node Content */}
      <div className="space-y-2">
        {imageUrl ? (
          <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
            <img
              src={imageUrl}
              alt="Generated output"
              className="w-full h-auto max-h-[200px] object-contain"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[150px] border-2 border-dashed border-border rounded-lg bg-muted/30">
            <ImageIcon className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">No image yet</p>
            <p className="text-xs text-muted-foreground">Connect a generator node</p>
          </div>
        )}
      </div>

      {/* Output Handle for chaining */}
      <Handle
        type="source"
        position={Position.Right}
        id="image-passthrough"
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
        style={{ top: '50%' }}
      />
    </div>
  );
}

export default memo(ImageOutputNode);
