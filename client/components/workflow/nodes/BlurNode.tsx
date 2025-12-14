import { memo, useEffect, useState, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { BlurNodeData } from '../types';
import { Slider } from '@/components/ui/slider';
import { Droplet, Loader2 } from 'lucide-react';
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

function BlurNode({ data, id }: NodeProps<BlurNodeData>) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  const imageInput = (data as any).image || (data as any).imageInput;
  const upstreamFilters: FilterConfig[] = (data as any).filters || [];

  const debouncedStrength = useDebounce(data.strength, 150);
  const debouncedQuality = useDebounce(data.quality, 150);

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

      const event = new CustomEvent('node-update', {
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
      window.dispatchEvent(event);
    },
    [id, data, imageInput, upstreamFilters, createConfig]
  );

  useEffect(() => {
    if (!imageInput) {
      setPreviewUrl(null);
      return;
    }

    const thisConfig = createConfig(debouncedStrength, debouncedQuality);
    const allFilters = [...upstreamFilters, thisConfig];

    setIsRendering(true);
    renderWithPixi(imageInput, allFilters)
      .then(rendered => {
        setPreviewUrl(rendered);
        setIsRendering(false);
      })
      .catch(error => {
        console.error('[BlurNode] Preview render failed:', error);
        setIsRendering(false);
      });
  }, [imageInput, debouncedStrength, debouncedQuality, upstreamFilters, createConfig]);

  useEffect(() => {
    updateOutputs(data.strength, data.quality);
  }, []);

  const def = FILTER_DEFINITIONS.blur;

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Droplet className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">{def.label}</span>
        </div>
        {isRendering && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
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

export default memo(BlurNode);
