import { memo, useMemo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Button } from '@/components/ui/button';
import { GenerateVideoNodeData, NODE_CONFIGURATIONS, NodeType } from '../types';
import {
  Sparkles,
  Loader2,
  Video as VideoIcon,
  CheckCircle2,
  AlertCircle,
  Download,
  Play,
  AlertTriangle,
} from 'lucide-react';

function GenerateVideoNode({ data, id }: NodeProps<GenerateVideoNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.GenerateVideo];
  const status = data.status || 'ready';
  const isGenerating = data.isGenerating || status === 'executing';
  const isCompleted = status === 'completed';
  const isError = status === 'error';
  const videoUrl = (data as any).videoUrl;
  const { getEdges } = useReactFlow();

  // Check for conflicting connections (mutual exclusion)
  const edges = getEdges() as WorkflowEdge[];
  const hasFrameConnections = edges.some(
    e => e.target === id && ['first_frame', 'last_frame'].includes(e.targetHandle || '')
  );
  const hasReferenceConnections = edges.some(
    e => e.target === id && e.targetHandle === 'reference_images'
  );

  const getBorderColor = () => {
    if (isGenerating) return 'border-yellow-500';
    if (isCompleted) return 'border-green-500';
    if (isError) return 'border-red-500';
    return 'border-border';
  };

  const getStatusText = () => {
    if (isGenerating) {
      if (data.pollAttempts) {
        return `Generating... (${data.pollAttempts * 10}s)`;
      }
      return 'Generating...';
    }
    if (isCompleted) return 'Completed';
    if (isError) return 'Error';
    return 'Ready';
  };

  const handleGenerate = () => {
    const event = new CustomEvent('node-execute', {
      detail: { nodeId: id },
    });
    window.dispatchEvent(event);
  };

  const handleDownload = async () => {
    if (!videoUrl) return;

    try {
      // For base64 data URIs, download directly
      if (videoUrl.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = videoUrl;
        link.download = `generated-video-${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // For external URLs, try to fetch with CORS mode
      try {
        const response = await fetch(videoUrl, { mode: 'cors' });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `generated-video-${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (fetchError) {
        window.open(videoUrl, '_blank');
      }
    } catch (error) {
      console.error('Download failed:', error);
      window.open(videoUrl, '_blank');
    }
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[320px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <VideoIcon className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">{data.label || 'Generate Video'}</div>
        </div>
        <div className="flex items-center gap-1">
          {isGenerating && <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />}
          {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
          {isError && <AlertCircle className="w-4 h-4 text-red-500" />}
        </div>
      </div>

      {/* Input Handles - Left side */}
      <div className="space-y-2 mb-3">
        {config.inputConnectors.map((input, index) => {
          const positions = [30, 60, 90, 120, 150]; // Vertical positions for handles
          const isRequired = input.required;
          const isMultiple = input.acceptsMultiple;

          // Check if this handle should be disabled due to mutual exclusion
          const isDisabled =
            (input.id === 'reference_images' && hasFrameConnections) ||
            (['first_frame', 'last_frame'].includes(input.id) && hasReferenceConnections);

          const disabledMessage = isDisabled
            ? input.id === 'reference_images'
              ? 'Cannot use with first/last frame'
              : 'Cannot use with reference images'
            : '';

          return (
            <div key={input.id} className="flex items-center gap-2 relative">
              <Handle
                type="target"
                position={Position.Left}
                id={input.id}
                className={`!w-3 !h-3 !border-2 !border-background ${
                  isDisabled
                    ? 'react-flow__handle-disabled'
                    : isRequired
                    ? '!bg-primary'
                    : '!bg-muted-foreground'
                }`}
                style={{ top: `${positions[index]}px` }}
                title={isDisabled ? disabledMessage : ''}
              />
              <div className={`text-xs font-medium ml-2 ${
                isDisabled ? 'text-muted-foreground/50 line-through' : 'text-muted-foreground'
              }`}>
                {input.label}
                {isRequired && !isDisabled && <span className="text-red-500 ml-1">*</span>}
                {isMultiple && !isDisabled && <span className="text-blue-500 ml-1">(multi)</span>}
                {isDisabled && <span className="text-amber-500 ml-1 text-[10px]">⚠ {disabledMessage}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Node Content */}
      <div className="space-y-3">
        {/* Status */}
        <div className="text-xs text-muted-foreground">
          Status: <span className="font-medium">{getStatusText()}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="w-3 h-3" />
          <span>Veo 3.1</span>
        </div>

        {/* Mutual Exclusion Warning */}
        {data.error?.includes('mutual exclusion') && (
          <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/20 p-2 rounded">
            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <div>{data.error}</div>
          </div>
        )}

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full"
          size="sm"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Play className="w-3 h-3 mr-1" />
              Generate Video
            </>
          )}
        </Button>

        {/* Video Preview */}
        {isCompleted && videoUrl && (
          <div className="space-y-2">
            <video
              src={videoUrl}
              controls
              className="w-full h-auto max-h-[180px] rounded border border-border"
            />
            <Button
              onClick={handleDownload}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Download className="w-3 h-3 mr-1" />
              Download
            </Button>
          </div>
        )}

        {/* Error Display */}
        {isError && data.error && !data.error.includes('mutual exclusion') && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
            {data.error}
          </div>
        )}
      </div>

      {/* Output Handle - Right side */}
      <Handle
        type="source"
        position={Position.Right}
        id="video"
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
        style={{ top: '50%' }}
      />
    </div>
  );
}

export default memo(GenerateVideoNode);
