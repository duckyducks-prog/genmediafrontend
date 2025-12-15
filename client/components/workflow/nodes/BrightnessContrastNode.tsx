import { memo, useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { BrightnessContrastNodeData } from '../types';
import { Slider } from '@/components/ui/slider';
import { Sun, Loader2 } from 'lucide-react';
import { renderWithPixi } from '@/lib/pixi-renderer';
import { FilterConfig, FILTER_DEFINITIONS } from '@/lib/pixi-filter-configs';

// Simple debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function BrightnessContrastNode({ data, id }: NodeProps<BrightnessContrastNodeData>) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  // Request sequencing to prevent race conditions
  const renderRequestId = useRef(0);

  // Get incoming data
  // Extract primitive/comparable values to use as dependencies
  const imageInput = (data as any).image || (data as any).imageInput;
  const upstreamFiltersRaw = (data as any).filters || [];

  // Convert filters to a stable string for comparison
  const upstreamFiltersKey = JSON.stringify(upstreamFiltersRaw.map((f: FilterConfig) => ({
    type: f.type,
    params: f.params
  })));

  // Debounce for preview (500ms for better performance)
  const debouncedBrightness = useDebounce(data.brightness, 500);
  const debouncedContrast = useDebounce(data.contrast, 500);

  // Create this node's filter config (lightweight, no PixiJS instance)
  const createConfig = useCallback(
    (brightness: number, contrast: number): FilterConfig => ({
      type: 'brightness',
      params: { brightness, contrast },
    }),
    []
  );

  // Update node outputs (Layer 1: store ONLY config)
  // Use useRef to avoid recreating this function and causing re-render loops
  const updateOutputsRef = useRef((brightness: number, contrast: number) => {});

  useEffect(() => {
    updateOutputsRef.current = (brightness: number, contrast: number) => {
      const thisConfig = createConfig(brightness, contrast);
      const updatedFilters = [...upstreamFilters, thisConfig];

      console.log('[BrightnessContrastNode] Dispatching node-update:', {
        nodeId: id,
        brightness,
        contrast,
        hasImage: !!imageInput,
        upstreamFilterCount: upstreamFilters.length,
        totalFilterCount: updatedFilters.length,
      });

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
    };
  });

  // Update outputs whenever brightness, contrast, or inputs change
  useEffect(() => {
    updateOutputsRef.current(data.brightness, data.contrast);
  }, [data.brightness, data.contrast, imageInput, upstreamFilters]);

  // Generate inline preview with debouncing
  // Use ref to track if a render is in progress to prevent cascading renders
  const isRenderingRef = useRef(false);

  useEffect(() => {
    console.log('[BrightnessContrastNode] Preview effect triggered:', {
      hasImageInput: !!imageInput,
      brightness: debouncedBrightness,
      contrast: debouncedContrast,
      upstreamFilterCount: upstreamFilters.length,
      isRenderingInProgress: isRenderingRef.current,
    });

    if (!imageInput) {
      console.log('[BrightnessContrastNode] No image input, clearing preview');
      setPreviewUrl(null);
      setIsRendering(false);
      return;
    }

    // Skip if a render is already in progress
    if (isRenderingRef.current) {
      console.log('[BrightnessContrastNode] Skipping render - already in progress');
      return;
    }

    const thisConfig = createConfig(debouncedBrightness, debouncedContrast);
    const allFilters = [...upstreamFilters, thisConfig];

    // Increment request ID to track this render
    const currentRequestId = ++renderRequestId.current;
    isRenderingRef.current = true;

    console.log('[BrightnessContrastNode] Starting inline preview render (request #' + currentRequestId + ')');
    setIsRendering(true);

    renderWithPixi(imageInput, allFilters)
      .then(rendered => {
        // Only update if this is still the latest request
        if (currentRequestId === renderRequestId.current) {
          console.log('[BrightnessContrastNode] Preview render completed (request #' + currentRequestId + ')');
          setPreviewUrl(rendered);
        } else {
          console.log('[BrightnessContrastNode] Discarding stale preview (request #' + currentRequestId + ')');
        }
      })
      .catch(error => {
        if (currentRequestId === renderRequestId.current) {
          console.error('[BrightnessContrastNode] Preview failed (request #' + currentRequestId + '):', {
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          setPreviewUrl(null);
        }
      })
      .finally(() => {
        if (currentRequestId === renderRequestId.current) {
          setIsRendering(false);
        }
        isRenderingRef.current = false; // Always clear the in-progress flag
      });
  }, [imageInput, debouncedBrightness, debouncedContrast, upstreamFilters]);

  const handleBrightnessChange = (value: number) => {
    updateOutputsRef.current(value, data.contrast);
  };

  const handleContrastChange = (value: number) => {
    updateOutputsRef.current(data.brightness, value);
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
          <div className="relative border border-border rounded overflow-hidden bg-muted/30 mt-2">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-24 object-cover"
              />
            ) : (
              <div className="w-full h-24 flex items-center justify-center">
                <span className="text-xs text-muted-foreground">
                  {isRendering ? 'Rendering preview...' : 'No preview'}
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
