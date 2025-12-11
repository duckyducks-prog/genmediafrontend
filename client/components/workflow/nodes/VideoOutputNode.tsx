import { memo, useEffect, useState } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { OutputNodeData } from '../types';
import { Video as VideoIcon } from 'lucide-react';

function VideoOutputNode({ data, id }: NodeProps<OutputNodeData>) {
  const [videoUrl, setVideoUrl] = useState<string | null>(data.result);
  const { getNode, getEdges } = useReactFlow();

  useEffect(() => {
    // Listen for updates from connected nodes
    const edges = getEdges();
    const incomingEdges = edges.filter((edge) => edge.target === id);

    if (incomingEdges.length > 0) {
      const edge = incomingEdges[0];
      const sourceNode = getNode(edge.source);
      
      if (sourceNode && (sourceNode.data as any).result) {
        setVideoUrl((sourceNode.data as any).result);
      }
    }
  }, [id, getEdges, getNode]);

  return (
    <div className="bg-card border-2 border-border rounded-lg p-4 min-w-[350px] shadow-lg">
      {/* Node Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
        <VideoIcon className="w-4 h-4 text-accent" />
        <div className="font-semibold text-sm">{data.label || 'Video Output'}</div>
      </div>

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="video-input"
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
        style={{ top: '50%' }}
      />

      {/* Node Content */}
      <div className="space-y-2">
        {videoUrl ? (
          <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
            <video
              src={videoUrl}
              controls
              className="w-full h-auto max-h-[200px]"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[150px] border-2 border-dashed border-border rounded-lg bg-muted/30">
            <VideoIcon className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">No video yet</p>
            <p className="text-xs text-muted-foreground">Connect a generator node</p>
          </div>
        )}
      </div>

      {/* Output Handle for chaining */}
      <Handle
        type="source"
        position={Position.Right}
        id="video-passthrough"
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
        style={{ top: '50%' }}
      />
    </div>
  );
}

export default memo(VideoOutputNode);
