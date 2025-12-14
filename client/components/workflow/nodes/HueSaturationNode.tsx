import { memo, useEffect, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { HueSaturationNodeData } from '../types';
import { Slider } from '@/components/ui/slider';
import { Palette } from 'lucide-react';
import { FilterConfig, FILTER_DEFINITIONS } from '@/lib/pixi-filter-configs';

function HueSaturationNode({ data, id }: NodeProps<HueSaturationNodeData>) {
  const imageInput = (data as any).image || (data as any).imageInput;
  const upstreamFilters: FilterConfig[] = (data as any).filters || [];

  const createConfig = useCallback(
    (hue: number, saturation: number): FilterConfig => ({
      type: 'hueSaturation',
      params: { hue, saturation },
    }),
    []
  );

  const updateOutputs = useCallback(
    (hue: number, saturation: number) => {
      const thisConfig = createConfig(hue, saturation);
      const updatedFilters = [...upstreamFilters, thisConfig];

      const updateEvent = new CustomEvent('node-update', {
        detail: {
          id,
          data: {
            ...data,
            hue,
            saturation,
            outputs: {
              image: imageInput,
              filters: updatedFilters,
            },
          },
        },
      });
      window.dispatchEvent(updateEvent);
    },
    [id, data, imageInput, upstreamFilters, createConfig]
  );

  useEffect(() => {
    updateOutputs(data.hue, data.saturation);
  }, [data.hue, data.saturation, imageInput, upstreamFilters, updateOutputs]);

  const def = FILTER_DEFINITIONS.hueSaturation;

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">{def.label}</span>
        </div>
      </div>

      <Handle type="target" position={Position.Left} id="image" data-connector-type="image" className="!w-3 !h-3 !border-2 !border-background" style={{ top: '30%' }} />
      <Handle type="target" position={Position.Left} id="filters" data-connector-type="any" className="!w-3 !h-3 !border-2 !border-background" style={{ top: '70%' }} />

      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.hue.label}</span>
            <span>{data.hue.toFixed(0)}°</span>
          </label>
          <Slider value={[data.hue]} onValueChange={([v]) => updateOutputs(v, data.saturation)} min={def.params.hue.min} max={def.params.hue.max} step={def.params.hue.step} className="w-full" />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.saturation.label}</span>
            <span>{((data.saturation * (def.params.saturation.displayMultiplier || 1))).toFixed(0)}{def.params.saturation.displayMultiplier ? '%' : ''}</span>
          </label>
          <Slider value={[data.saturation]} onValueChange={([v]) => updateOutputs(data.hue, v)} min={def.params.saturation.min} max={def.params.saturation.max} step={def.params.saturation.step} className="w-full" />
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="image" data-connector-type="image" className="!w-3 !h-3 !border-2 !border-background" style={{ top: '30%' }} />
      <Handle type="source" position={Position.Right} id="filters" data-connector-type="any" className="!w-3 !h-3 !border-2 !border-background" style={{ top: '70%' }} />
    </div>
  );
}

export default memo(HueSaturationNode);
