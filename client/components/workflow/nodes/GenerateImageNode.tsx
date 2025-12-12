import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Button } from '@/components/ui/button';
import { GenerateImageNodeData, NODE_CONFIGURATIONS, NodeType } from '../types';
import {
  Sparkles,
  Loader2,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Download,
  Play,
} from 'lucide-react';

function GenerateImageNode({ data, id }: NodeProps<GenerateImageNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.GenerateImage];
  const status = data.status || 'ready';
  const isGenerating = data.isGenerating || status === 'executing';
  const isCompleted = status === 'completed';
  const isError = status === 'error';
  const imageUrl = (data as any).imageUrl;
  const images = (data as any).images || [];

  const getBorderColor = () => {
    if (isGenerating) return 'border-yellow-500';
    if (isCompleted) return 'border-green-500';
    if (isError) return 'border-red-500';
    return 'border-border';
  };

  const getStatusText = () => {
    if (isGenerating) return 'Generating...';
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
    if (!imageUrl) return;

    try {
      if (imageUrl.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `generated-image-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      try {
        const response = await fetch(imageUrl, { mode: 'cors' });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `generated-image-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (fetchError) {
        window.open(imageUrl, '_blank');
      }
    } catch (error) {
      console.error('Download failed:', error);
      window.open(imageUrl, '_blank');
    }
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[300px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">{data.label || 'Generate Image'}</div>
        </div>
        <div className="flex items-center gap-1">
          {isGenerating && <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />}
          {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
          {isError && <AlertCircle className="w-4 h-4 text-red-500" />}
        </div>
      </div>

      {/* Input Handles - Left side */}
      <div className="space-y-3 mb-4">
        {config.inputConnectors.map((input, index) => {
          const isRequired = input.required;
          const isMultiple = input.acceptsMultiple;

          return (
            <div key={input.id} className="flex items-center gap-2 relative h-6">
              <Handle
                type="target"
                position={Position.Left}
                id={input.id}
                className={`!w-3 !h-3 !border-2 !border-background !-left-[18px] !absolute !top-1/2 !-translate-y-1/2 ${
                  isRequired ? '!bg-primary' : '!bg-muted-foreground'
                }`}
              />
              <div className="text-xs font-medium text-muted-foreground">
                {input.label}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
                {isMultiple && <span className="text-blue-500 ml-1">(multi)</span>}
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
          <span>Gemini 3 Pro</span>
        </div>

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
              Generate Image
            </>
          )}
        </Button>

        {/* Image Preview */}
        {isCompleted && imageUrl && (
          <div className="space-y-2">
            <img
              src={imageUrl}
              alt="Generated"
              className="w-full h-auto max-h-[180px] object-cover rounded border border-border"
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
        {isError && data.error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
            {data.error}
          </div>
        )}
      </div>

      {/* Output Handles - Right side */}
      <div className="space-y-2">
        <Handle
          type="source"
          position={Position.Right}
          id="images"
          className="!w-3 !h-3 !bg-primary !border-2 !border-background"
          style={{ top: '40%' }}
        />
        <Handle
          type="source"
          position={Position.Right}
          id="image"
          className="!w-3 !h-3 !bg-primary !border-2 !border-background"
          style={{ top: '60%' }}
        />
      </div>
    </div>
  );
}

export default memo(GenerateImageNode);
