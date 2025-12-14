import { memo, useEffect, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { BlurNodeData } from '../types';
import { Slider } from '@/components/ui/slider';
import { Blend } from 'lucide-react';
import { FilterConfig, FILTER_DEFINITIONS } from '@/lib/pixi-filter-configs';

function BlurNode({ data, id }: NodeProps<BlurNodeData>) {
  const imageInput = (data as any).image || (data as any).imageInput;
  const upstreamFilters: FilterConfig[] = (data as any).filters || [];

  const createConfig = useCallback(
    (strength: number, quality: number): FilterConfig => ({
      type: 'blur',
      params: { strength, quality },
    }),
    []
  );

  const updateOutputs = useCallback(
    (strength: number, quality: number) => {
      const thisConfig = createConfig(strength, quality);
      const updatedFilters = [...upstreamFilters, thisConfig];

      const updateEvent = new CustomEvent('node-update', {
        detail: {
          id,
          data: {
            ...data,
            strength,
            quality,
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
    updateOutputs(data.strength, data.quality);
  }, [data.strength, data.quality, imageInput, upstreamFilters, updateOutputs]);

  const def = FILTER_DEFINITIONS.blur;

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Blend className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">{def.label}</span>
        </div>
      </div>

      <Handle type="target" position={Position.Left} id="image" data-connector-type="image" className="!w-3 !h-3 !border-2 !border-background" style={{ top: '30%' }} />
      <Handle type="target" position={Position.Left} id="filters" data-connector-type="any" className="!w-3 !h-3 !border-2 !border-background" style={{ top: '70%' }} />

      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.strength.label}</span>
            <span>{data.strength.toFixed(0)}</span>
          </label>
          <Slider value={[data.strength]} onValueChange={([v]) => updateOutputs(v, data.quality)} min={def.params.strength.min} max={def.params.strength.max} step={def.params.strength.step} className="w-full" />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.quality.label}</span>
            <span>{data.quality.toFixed(0)}</span>
          </label>
          <Slider value={[data.quality]} onValueChange={([v]) => updateOutputs(data.strength, v)} min={def.params.quality.min} max={def.params.quality.max} step={def.params.quality.step} className="w-full" />
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="image" data-connector-type="image" className="!w-3 !h-3 !border-2 !border-background" style={{ top: '30%' }} />
      <Handle type="source" position={Position.Right} id="filters" data-connector-type="any" className="!w-3 !h-3 !border-2 !border-background" style={{ top: '70%' }} />
    </div>
  );
}

export default memo(BlurNode);
