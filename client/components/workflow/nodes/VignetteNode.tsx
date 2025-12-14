import { memo, useEffect, useState, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { VignetteNodeData } from '../types';
import { Slider } from '@/components/ui/slider';
import { Circle, Loader2 } from 'lucide-react';
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

function VignetteNode({ data, id }: NodeProps<VignetteNodeData>) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  const imageInput = (data as any).image || (data as any).imageInput;
  const upstreamFilters: FilterConfig[] = (data as any).filters || [];

  const debouncedSize = useDebounce(data.size, 150);
  const debouncedAmount = useDebounce(data.amount, 150);

  const createConfig = useCallback(
    (size: number, amount: number): FilterConfig => ({
      type: 'vignette',
      params: { size, amount },
    }),
    []
  );

  const updateOutputs = useCallback(
    (size: number, amount: number) => {
      const thisConfig = createConfig(size, amount);
      const updatedFilters = [...upstreamFilters, thisConfig];

      const event = new CustomEvent('node-update', {
        detail: {
          id,
          data: {
            ...data,
            size,
            amount,
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

    const thisConfig = createConfig(debouncedSize, debouncedAmount);
    const allFilters = [...upstreamFilters, thisConfig];

    setIsRendering(true);
    renderWithPixi(imageInput, allFilters)
      .then(rendered => {
        setPreviewUrl(rendered);
        setIsRendering(false);
      })
      .catch(error => {
        console.error('[VignetteNode] Preview render failed:', error);
        setIsRendering(false);
      });
  }, [imageInput, debouncedSize, debouncedAmount, upstreamFilters, createConfig]);

  useEffect(() => {
    updateOutputs(data.size, data.amount);
  }, []);

  const def = FILTER_DEFINITIONS.vignette;

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Circle className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">{def.label}</span>
        </div>
        {isRendering && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      </div>

      <Handle type="target" position={Position.Left} id="image" data-connector-type="image" className="!w-3 !h-3 !border-2 !border-background" style={{ top: '30%' }} />
      <Handle type="target" position={Position.Left} id="filters" data-connector-type="any" className="!w-3 !h-3 !border-2 !border-background" style={{ top: '70%' }} />

      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.size.label}</span>
            <span>{((data.size * (def.params.size.displayMultiplier || 1))).toFixed(0)}{def.params.size.displayMultiplier ? '%' : ''}</span>
          </label>
          <Slider value={[data.size]} onValueChange={([v]) => updateOutputs(v, data.amount)} min={def.params.size.min} max={def.params.size.max} step={def.params.size.step} className="w-full" />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.amount.label}</span>
            <span>{((data.amount * (def.params.amount.displayMultiplier || 1))).toFixed(0)}{def.params.amount.displayMultiplier ? '%' : ''}</span>
          </label>
          <Slider value={[data.amount]} onValueChange={([v]) => updateOutputs(data.size, v)} min={def.params.amount.min} max={def.params.amount.max} step={def.params.amount.step} className="w-full" />
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

export default memo(VignetteNode);
