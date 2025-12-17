import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { LLMNodeData, NODE_CONFIGURATIONS, NodeType } from '../types';
import { Brain, Loader2, Play, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

function LLMNode({ data, id }: NodeProps<LLMNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.LLM];
  const status = data.status || 'ready';
  const isGenerating = data.isGenerating || status === 'executing';

  const getBorderColor = () => {
    if (status === 'error') return 'border-red-500';
    return 'border-border';
  };

  const handleUpdate = (field: keyof LLMNodeData, value: any) => {
    const event = new CustomEvent('node-update', {
      detail: {
        id,
        data: { ...data, [field]: value },
      },
    });
    window.dispatchEvent(event);
  };

  const handleRun = () => {
    const event = new CustomEvent('node-execute', {
      detail: { nodeId: id },
    });
    window.dispatchEvent(event);
  };

  return (
    <div className={`bg-card border-2 rounded-lg p-4 min-w-[320px] max-w-[400px] shadow-lg transition-colors ${getBorderColor()}`}>
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">{data.label || 'LLM'}</div>
        </div>
        <div className="flex items-center gap-1">
          {isGenerating && <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />}
          {status === 'completed' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
          {status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
        </div>
      </div>

      {/* Input Handles - Left side */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-2 relative h-6">
          <Handle
            type="target"
            position={Position.Left}
            id="prompt"
            data-connector-type="text"
            className="!w-3 !h-3 !border-2 !border-background !-left-[18px] !absolute !top-1/2 !-translate-y-1/2"
          />
          <div className="text-xs font-medium text-muted-foreground">
            Prompt<span className="text-red-500 ml-1">*</span>
          </div>
        </div>
        <div className="flex items-center gap-2 relative h-6">
          <Handle
            type="target"
            position={Position.Left}
            id="context"
            data-connector-type="text"
            className="!w-3 !h-3 !border-2 !border-background !-left-[18px] !absolute !top-1/2 !-translate-y-1/2"
          />
          <div className="text-xs font-medium text-muted-foreground">
            Context
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="space-y-3">
        {/* System Prompt */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            System Prompt
          </label>
          <Textarea
            value={data.systemPrompt || ''}
            onChange={(e) => handleUpdate('systemPrompt', e.target.value)}
            placeholder="Instructions to the LLM..."
            className="text-xs min-h-[60px] resize-none"
          />
        </div>

        {/* Temperature */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1 flex items-center justify-between">
            <span>Temperature</span>
            <span className="text-primary font-mono">{data.temperature.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={data.temperature}
            onChange={(e) => handleUpdate('temperature', parseFloat(e.target.value))}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Precise</span>
            <span>Creative</span>
          </div>
        </div>

        {/* Response Preview */}
        {data.responsePreview && (
          <div className="bg-muted/50 p-3 rounded border border-border max-h-[120px] overflow-y-auto">
            <div className="text-xs text-muted-foreground mb-1">Response:</div>
            <div className="text-xs whitespace-pre-wrap">{data.responsePreview}</div>
          </div>
        )}

        {data.error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
            {data.error}
          </div>
        )}

        {/* Run Node Button */}
        <Button
          onClick={handleRun}
          disabled={isGenerating}
          variant="ghost"
          size="sm"
          className="w-full text-xs"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Play className="w-3 h-3 mr-1" />
              Run Node
            </>
          )}
        </Button>
      </div>

      {/* Output Handle - Right side */}
      <Handle
        type="source"
        position={Position.Right}
        id="response"
        data-connector-type="text"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      />
    </div>
  );
}

export default memo(LLMNode);
