import { memo, useEffect, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { BrightnessContrastNodeData } from '../types';
import { Slider } from '@/components/ui/slider';
import { Sun } from 'lucide-react';
import { FilterConfig, FILTER_DEFINITIONS } from '@/lib/pixi-filter-configs';

function BrightnessContrastNode({ data, id }: NodeProps<BrightnessContrastNodeData>) {
  // Get incoming data
  const imageInput = (data as any).image || (data as any).imageInput;
  const upstreamFilters: FilterConfig[] = (data as any).filters || [];

  // Create this node's filter config (lightweight, no PixiJS instance)
  const createConfig = useCallback(
    (brightness: number, contrast: number): FilterConfig => ({
      type: 'brightness',
      params: { brightness, contrast },
    }),
    []
  );

  // Update node outputs (Layer 1: store ONLY config)
  const updateOutputs = useCallback(
    (brightness: number, contrast: number) => {
      const thisConfig = createConfig(brightness, contrast);
      const updatedFilters = [...upstreamFilters, thisConfig];

      const updateEvent = new CustomEvent('node-update', {
        detail: {
          id,
          data: {
            ...data,
            brightness,
            contrast,
            outputs: {
              image: imageInput, // Pass through original
              filters: updatedFilters, // Append our config
            },
          },
        },
      });
      window.dispatchEvent(updateEvent);
    },
    [id, data, imageInput, upstreamFilters, createConfig]
  );

  // Update outputs whenever brightness, contrast, or inputs change
  useEffect(() => {
    updateOutputs(data.brightness, data.contrast);
  }, [data.brightness, data.contrast, imageInput, upstreamFilters, updateOutputs]);

  const handleBrightnessChange = (value: number) => {
    updateOutputs(value, data.contrast);
  };

  const handleContrastChange = (value: number) => {
    updateOutputs(data.brightness, value);
  };

  const def = FILTER_DEFINITIONS.brightness;

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Sun className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">{def.label}</span>
        </div>
      </div>

      {/* Input Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        data-connector-type="image"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: '30%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="filters"
        data-connector-type="any"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: '70%' }}
      />

      {/* Controls */}
      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.brightness.label}</span>
            <span>
              {((data.brightness * (def.params.brightness.displayMultiplier || 1))).toFixed(0)}
              {def.params.brightness.displayMultiplier ? '%' : ''}
            </span>
          </label>
          <Slider
            value={[data.brightness]}
            onValueChange={([v]) => handleBrightnessChange(v)}
            min={def.params.brightness.min}
            max={def.params.brightness.max}
            step={def.params.brightness.step}
            className="w-full"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.contrast.label}</span>
            <span>
              {((data.contrast * (def.params.contrast.displayMultiplier || 1))).toFixed(0)}
              {def.params.contrast.displayMultiplier ? '%' : ''}
            </span>
          </label>
          <Slider
            value={[data.contrast]}
            onValueChange={([v]) => handleContrastChange(v)}
            min={def.params.contrast.min}
            max={def.params.contrast.max}
            step={def.params.contrast.step}
            className="w-full"
          />
        </div>
      </div>

      {/* Output Handles */}
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        data-connector-type="image"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: '30%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="filters"
        data-connector-type="any"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: '70%' }}
      />
    </div>
  );
}

export default memo(BrightnessContrastNode);
