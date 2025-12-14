import { memo, useEffect, useState, useCallback, useRef } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { BrightnessContrastNodeData } from '../types';
import { Slider } from '@/components/ui/slider';
import { Sun, Loader2 } from 'lucide-react';
import { renderWithPixi } from '@/lib/pixi-renderer';
import { FilterConfig, FILTER_DEFINITIONS } from '@/lib/pixi-filter-configs';

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

function BrightnessContrastNode({ data, id }: NodeProps<BrightnessContrastNodeData>) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  // Get incoming data
  const imageInput = (data as any).image || (data as any).imageInput;
  const upstreamFilters: FilterConfig[] = (data as any).filters || [];

  // Debounce params for preview rendering
  const debouncedBrightness = useDebounce(data.brightness, 150);
  const debouncedContrast = useDebounce(data.contrast, 150);

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

      const event = new CustomEvent('node-update', {
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
      window.dispatchEvent(event);
    },
    [id, data, imageInput, upstreamFilters, createConfig]
  );

  // Generate inline preview
  useEffect(() => {
    if (!imageInput) {
      setPreviewUrl(null);
      return;
    }

    const thisConfig = createConfig(debouncedBrightness, debouncedContrast);
    const allFilters = [...upstreamFilters, thisConfig];

    setIsRendering(true);
    renderWithPixi(imageInput, allFilters)
      .then(rendered => {
        setPreviewUrl(rendered);
        setIsRendering(false);
      })
      .catch(error => {
        console.error('[BrightnessContrastNode] Preview render failed:', error);
        setIsRendering(false);
      });
  }, [imageInput, debouncedBrightness, debouncedContrast, upstreamFilters, createConfig]);

  // Initialize outputs on mount
  useEffect(() => {
    updateOutputs(data.brightness, data.contrast);
  }, []); // Only on mount

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
        {isRendering && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
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

        {/* Inline Preview */}
        {imageInput && (
          <div className="relative border border-border rounded overflow-hidden bg-muted/30">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-20 object-cover"
              />
            ) : (
              <div className="w-full h-20 flex items-center justify-center">
                <span className="text-xs text-muted-foreground">
                  {isRendering ? 'Rendering...' : 'No preview'}
                </span>
              </div>
            )}
          </div>
        )}
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
