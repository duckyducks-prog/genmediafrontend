import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { GenerateImageNodeData } from '../types';
import { Sparkles, Loader2, Image as ImageIcon, CheckCircle2, AlertCircle } from 'lucide-react';

function GenerateImageNode({ data, id }: NodeProps<GenerateImageNodeData>) {
  const status = data.status || 'ready';
  const isGenerating = status === 'executing';
  const isCompleted = status === 'completed';
  const isError = status === 'error';

  const getBorderColor = () => {
    if (isGenerating) return 'border-yellow-500';
    if (isCompleted) return 'border-green-500';
    if (isError) return 'border-red-500';
    return 'border-primary/50';
  };

  const getStatusText = () => {
    if (isGenerating) return 'Generating...';
    if (isCompleted) return 'Completed';
    if (isError) return data.error || 'Error';
    return 'Ready';
  };

  return (
    <div className={`bg-card border-2 rounded-lg p-4 min-w-[240px] shadow-lg transition-colors ${getBorderColor()}`}>
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">Generate Image</div>
        </div>
        {isGenerating && <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />}
        {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        {isError && <AlertCircle className="w-4 h-4 text-red-500" />}
      </div>

      {/* Input Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="prompt-input"
        className="!w-3 !h-3 !bg-primary !border-2 !border-background !top-[30%]"
        style={{ top: '30%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="image-input"
        className="!w-3 !h-3 !bg-accent !border-2 !border-background !top-[70%]"
        style={{ top: '70%' }}
      />

      {/* Node Content */}
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">
          Status: <span className="font-medium">{getStatusText()}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="w-3 h-3" />
          <span>AI Image Generation</span>
        </div>

        {data.promptInput && (
          <div className="text-xs p-2 bg-background/50 rounded border border-border">
            <div className="font-medium mb-1">Prompt:</div>
            <div className="line-clamp-2">{data.promptInput}</div>
          </div>
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

export default memo(GenerateImageNode);
