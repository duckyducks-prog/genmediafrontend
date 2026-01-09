import { memo, useEffect, useCallback, useRef } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { BlurNodeData } from "../types";
import { Slider } from "@/components/ui/slider";
import { Blend } from "lucide-react";
import { FilterConfig, FILTER_DEFINITIONS } from "@/lib/pixi-filter-configs";
import { NodeLockToggle } from "../NodeLockToggle";

function BlurNode({ data, id }: NodeProps<BlurNodeData>) {
  const toggleLock = () => {
    const updateEvent = new CustomEvent("node-update", {
      detail: { id, data: { ...data, locked: !data.locked } },
    });
    window.dispatchEvent(updateEvent);
  };
  // Get incoming data
  // Extract primitive/comparable values to use as dependencies
  const imageInput = (data as any).image || (data as any).imageInput;
  const upstreamFiltersRaw = (data as any).filters || [];

  // Convert filters to a stable string for comparison
  const upstreamFiltersKey = JSON.stringify(
    upstreamFiltersRaw.map((f: FilterConfig) => ({
      type: f.type,
      params: f.params,
    })),
  );

  const createConfig = useCallback(
    (strength: number, quality: number): FilterConfig => ({
      type: "blur",
      params: { strength, quality },
    }),
    [],
  );

  // Update node outputs - use useRef to avoid re-render loops
  const updateOutputsRef = useRef((_strength: number, _quality: number) => {});

  useEffect(() => {
    updateOutputsRef.current = (strength: number, quality: number) => {
      const thisConfig = createConfig(strength, quality);
      const updatedFilters = [...upstreamFiltersRaw, thisConfig];

      const updateEvent = new CustomEvent("node-update", {
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
    };
  });

  useEffect(() => {
    updateOutputsRef.current(data.strength, data.quality);
  }, [data.strength, data.quality, imageInput, upstreamFiltersKey]);

  const def = FILTER_DEFINITIONS.blur;

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Blend className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">{def.label}</span>
        </div>
        <NodeLockToggle locked={!!data.locked} onToggle={toggleLock} disabled={data.readOnly} />
      </div>

      <Handle
        type="target"
        position={Position.Left}
        id="image"
        data-connector-type="image"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "30%" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="filters"
        data-connector-type="any"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "70%" }}
      />

      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.strength.label}</span>
            <span>{data.strength.toFixed(0)}</span>
          </label>
          <Slider
            value={[data.strength]}
            onValueChange={([v]) => updateOutputsRef.current(v, data.quality)}
            min={def.params.strength.min}
            max={def.params.strength.max}
            step={def.params.strength.step}
            className="w-full"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.quality.label}</span>
            <span>{data.quality.toFixed(0)}</span>
          </label>
          <Slider
            value={[data.quality]}
            onValueChange={([v]) => updateOutputsRef.current(data.strength, v)}
            min={def.params.quality.min}
            max={def.params.quality.max}
            step={def.params.quality.step}
            className="w-full"
          />
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="image"
        data-connector-type="image"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "30%" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="filters"
        data-connector-type="any"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "70%" }}
      />
    </div>
  );
}

export default memo(BlurNode);
