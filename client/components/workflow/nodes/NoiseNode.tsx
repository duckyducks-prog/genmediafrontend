import { memo, useEffect, useState, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NoiseNodeData } from '../types';
import { Slider } from '@/components/ui/slider';
import { Sparkles, Loader2 } from 'lucide-react';
import { renderWithPixi } from '@/lib/pixi-renderer';
import { FilterConfig, FILTER_DEFINITIONS } from '@/lib/pixi-filter-configs';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function NoiseNode({ data, id }: NodeProps<NoiseNodeData>) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  const imageInput = (data as any).image || (data as any).imageInput;
  const upstreamFilters: FilterConfig[] = (data as any).filters || [];

  const debouncedNoise = useDebounce(data.noise, 150);

  const createConfig = useCallback(
    (noise: number): FilterConfig => ({
      type: 'noise',
      params: { noise },
    }),
    []
  );

  const updateOutputs = useCallback(
    (noise: number) => {
      const thisConfig = createConfig(noise);
      const updatedFilters = [...upstreamFilters, thisConfig];

      const event = new CustomEvent('node-update', {
        detail: {
          id,
          data: {
            ...data,
            noise,
            outputs: {
              image: imageInput,
              filters: updatedFilters,
            },
          },
        },
      });
      window.dispatchEvent(event);
    },
    [id, data, imageInput, upstreamFilters, createConfig]
  );

  useEffect(() => {
    if (!imageInput) {
      setPreviewUrl(null);
      return;
    }

    const thisConfig = createConfig(debouncedNoise);
    const allFilters = [...upstreamFilters, thisConfig];

    setIsRendering(true);
    renderWithPixi(imageInput, allFilters)
      .then(rendered => {
        setPreviewUrl(rendered);
        setIsRendering(false);
      })
      .catch(error => {
        console.error('[NoiseNode] Preview render failed:', error);
        setIsRendering(false);
      });
  }, [imageInput, debouncedNoise, upstreamFilters, createConfig]);

  useEffect(() => {
    updateOutputs(data.noise);
  }, [data.noise, imageInput, upstreamFilters, updateOutputs]);

  const def = FILTER_DEFINITIONS.noise;

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">{def.label}</span>
        </div>
        {isRendering && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      </div>

      <Handle type="target" position={Position.Left} id="image" data-connector-type="image" className="!w-3 !h-3 !border-2 !border-background" style={{ top: '30%' }} />
      <Handle type="target" position={Position.Left} id="filters" data-connector-type="any" className="!w-3 !h-3 !border-2 !border-background" style={{ top: '70%' }} />

      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.noise.label}</span>
            <span>{((data.noise * (def.params.noise.displayMultiplier || 1))).toFixed(0)}{def.params.noise.displayMultiplier ? '%' : ''}</span>
          </label>
          <Slider value={[data.noise]} onValueChange={([v]) => updateOutputs(v)} min={def.params.noise.min} max={def.params.noise.max} step={def.params.noise.step} className="w-full" />
        </div>

        {imageInput && (
          <div className="relative border border-border rounded overflow-hidden bg-muted/30">
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" className="w-full h-20 object-cover" />
            ) : (
              <div className="w-full h-20 flex items-center justify-center">
                <span className="text-xs text-muted-foreground">{isRendering ? 'Rendering...' : 'No preview'}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="image" data-connector-type="image" className="!w-3 !h-3 !border-2 !border-background" style={{ top: '30%' }} />
      <Handle type="source" position={Position.Right} id="filters" data-connector-type="any" className="!w-3 !h-3 !border-2 !border-background" style={{ top: '70%' }} />
    </div>
  );
}

export default memo(NoiseNode);
