import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { CompoundNodeData } from "@/lib/compound-nodes/types";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function CompoundNode({ data, id }: NodeProps<CompoundNodeData>) {
  const {
    name,
    icon,
    description,
    inputs,
    outputs,
    controls,
    controlValues = {},
    readOnly,
  } = data;

  // Helper to dispatch node updates
  const handleControlChange = (controlId: string, value: any) => {
    if (readOnly) return;

    const event = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          controlValues: {
            ...controlValues,
            [controlId]: value,
          },
        },
      },
    });
    window.dispatchEvent(event);
  };

  return (
    <div className="bg-card border-2 border-border rounded-lg shadow-lg min-w-[250px] max-w-[350px]">
      {/* Header */}
      <div className="bg-accent/50 px-4 py-2.5 rounded-t-md border-b border-border flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="font-semibold text-sm">{name}</span>
      </div>

      {/* Description (optional) */}
      {description && (
        <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border bg-muted/30">
          {description}
        </div>
      )}

      {/* Inputs Section */}
      {inputs.length > 0 && (
        <div className="py-2">
          {inputs.map((input, index) => (
            <div
              key={input.id}
              className="flex items-center px-4 py-1.5 relative"
            >
              <Handle
                type="target"
                position={Position.Left}
                id={input.id}
                data-connector-type={input.type}
                className="!w-3 !h-3 !border-2 !-left-[7px]"
                style={{
                  top: `${((index + 1) / (inputs.length + 1)) * 100}%`,
                }}
              />
              <span className="text-xs text-muted-foreground ml-2">
                {input.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Controls Section */}
      {controls.length > 0 && (
        <div className="px-4 py-3 space-y-3 border-t border-border bg-accent/10">
          {controls.map((control) => {
            const value = controlValues[control.id] ?? control.default;

            return (
              <div key={control.id} className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {control.name}
                </label>

                {/* Slider Control */}
                {control.type === "slider" && (
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[value]}
                      onValueChange={([newValue]) =>
                        handleControlChange(control.id, newValue)
                      }
                      min={control.min ?? 0}
                      max={control.max ?? 100}
                      step={control.step ?? 1}
                      disabled={readOnly}
                      className="flex-1"
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    <span className="text-xs font-mono w-12 text-right">
                      {typeof value === "number" ? value.toFixed(1) : value}
                    </span>
                  </div>
                )}

                {/* Dropdown Control */}
                {control.type === "dropdown" && (
                  <Select
                    value={String(value)}
                    onValueChange={(newValue) =>
                      handleControlChange(control.id, newValue)
                    }
                    disabled={readOnly}
                  >
                    <SelectTrigger
                      className="h-8 text-xs"
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {control.options?.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Text Control */}
                {control.type === "text" && (
                  <Input
                    value={String(value || "")}
                    onChange={(e) =>
                      handleControlChange(control.id, e.target.value)
                    }
                    disabled={readOnly}
                    className="h-8 text-xs"
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                )}

                {/* Toggle Control */}
                {control.type === "toggle" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(e) =>
                        handleControlChange(control.id, e.target.checked)
                      }
                      disabled={readOnly}
                      className="w-4 h-4"
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    <span className="text-xs">
                      {value ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Outputs Section */}
      {outputs.length > 0 && (
        <div className={`py-2 ${controls.length > 0 ? "border-t border-border" : ""}`}>
          {outputs.map((output, index) => (
            <div
              key={output.id}
              className="flex items-center justify-end px-4 py-1.5 relative"
            >
              <span className="text-xs text-muted-foreground mr-2">
                {output.name}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={output.id}
                data-connector-type={output.type}
                className="!w-3 !h-3 !border-2 !-right-[7px]"
                style={{
                  top: `${((index + 1) / (outputs.length + 1)) * 100}%`,
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(CompoundNode);
