import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { OutputNodeData } from '../types';
import { Video as VideoIcon, CheckCircle2, Loader2 } from 'lucide-react';

function VideoOutputNode({ data, id }: NodeProps<OutputNodeData>) {
  const videoUrl = (data as any).videoUrl || data.result;
  const status = (data as any).status || 'ready';
  const isExecuting = status === 'executing';
  const isCompleted = status === 'completed';

  const getBorderColor = () => {
    if (isExecuting) return 'border-yellow-500';
    if (isCompleted) return 'border-green-500';
    return 'border-border';
  };

  return (
    <div className={`bg-card border-2 rounded-lg p-4 min-w-[350px] shadow-lg transition-colors ${getBorderColor()}`}>
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <VideoIcon className="w-4 h-4 text-accent" />
          <div className="font-semibold text-sm">{data.label || 'Video Output'}</div>
        </div>
        {isExecuting && <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />}
        {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
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
            <p className="text-xs text-muted-foreground">
              {isExecuting ? 'Receiving...' : 'No video yet'}
            </p>
            <p className="text-xs text-muted-foreground">
              {!isExecuting && 'Run workflow to display'}
            </p>
          </div>
        )}
      </div>

      {/* Output Handle for chaining */}
      <Handle
        type="source"
        position={Position.Right}
        id="media-output"
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
        style={{ top: '50%' }}
      />
    </div>
  );
}

export default memo(VideoOutputNode);
