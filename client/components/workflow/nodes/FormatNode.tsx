import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { FormatNodeData, NODE_CONFIGURATIONS, NodeType } from '../types';
import { Settings, ChevronDown } from 'lucide-react';

function FormatNode({ data, id }: NodeProps<FormatNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.Format];
  const status = data.status || 'ready';

  const getBorderColor = () => {
    if (status === 'executing') return 'border-yellow-500';
    if (status === 'completed') return 'border-green-500';
    if (status === 'error') return 'border-red-500';
    return 'border-border';
  };

  const handleUpdate = (field: keyof FormatNodeData, value: any) => {
    const event = new CustomEvent('node-update', {
      detail: {
        id,
        data: { ...data, [field]: value },
      },
    });
    window.dispatchEvent(event);
  };

  return (
    <div className={`bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg transition-colors ${getBorderColor()}`}>
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">{data.label || 'Format'}</div>
        </div>
      </div>

      {/* Optional Input Handle - Left side */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
        style={{ top: '30px' }}
      />

      {/* Configuration Options */}
      <div className="space-y-3">
        {/* Aspect Ratio */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Aspect Ratio
          </label>
          <div className="relative">
            <select
              value={data.aspectRatio}
              onChange={(e) => handleUpdate('aspectRatio', e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md appearance-none pr-8"
            >
              <option value="16:9">16:9 (Landscape)</option>
              <option value="9:16">9:16 (Portrait)</option>
              <option value="1:1">1:1 (Square)</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Duration (for video) */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Duration (for video)
          </label>
          <div className="relative">
            <select
              value={data.durationSeconds}
              onChange={(e) => handleUpdate('durationSeconds', parseInt(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md appearance-none pr-8"
            >
              <option value="5">5 seconds</option>
              <option value="6">6 seconds</option>
              <option value="7">7 seconds</option>
              <option value="8">8 seconds</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Generate Audio */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={data.generateAudio}
              onChange={(e) => handleUpdate('generateAudio', e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-xs font-medium text-muted-foreground">
              Generate Audio
            </span>
          </label>
        </div>

        {/* Resolution */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Resolution
          </label>
          <div className="relative">
            <select
              value={data.resolution}
              onChange={(e) => handleUpdate('resolution', e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md appearance-none pr-8"
            >
              <option value="1080p">1080p (Full HD)</option>
              <option value="720p">720p (HD)</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Current Settings Summary */}
        <div className="bg-muted/50 p-2 rounded border border-border mt-3">
          <div className="text-xs text-muted-foreground mb-1">Settings:</div>
          <div className="text-xs space-y-0.5">
            <div>• {data.aspectRatio} • {data.durationSeconds}s</div>
            <div>• Audio: {data.generateAudio ? 'On' : 'Off'} • {data.resolution}</div>
          </div>
        </div>

        {data.error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
            {data.error}
          </div>
        )}
      </div>

      {/* Output Handle - Right side */}
      <Handle
        type="source"
        position={Position.Right}
        id="format"
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
        style={{ top: '50%' }}
      />
    </div>
  );
}

export default memo(FormatNode);
