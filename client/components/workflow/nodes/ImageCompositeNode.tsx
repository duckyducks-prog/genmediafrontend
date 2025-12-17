import { useEffect, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { ImageCompositeNodeData, NODE_CONFIGURATIONS, NodeType } from "../types";
import { Layers, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function ImageCompositeNode({ data, id }: NodeProps<ImageCompositeNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.ImageComposite];
  const status = data.status || "ready";

  const handleUpdate = (field: string, value: any) => {
    if (data.readOnly) return;

    const event = new CustomEvent("node-update", {
      detail: {
        id,
        data: { ...data, [field]: value },
      },
    });
    window.dispatchEvent(event);
  };

  const getBorderColor = () => {
    if (status === "executing") return "border-yellow-500";
    if (status === "completed") return "border-green-500";
    if (status === "error") return "border-red-500";
    return "border-border";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Image Composite"}
          </div>
        </div>
        {status === "executing" && (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
        )}
        {status === "completed" && (
          <div className="text-green-500 text-xs">✓</div>
        )}
        {status === "error" && (
          <div className="text-red-500 text-xs">✗</div>
        )}
      </div>

      {/* Input Handles - Left side */}
      <div className="space-y-3 mb-3">
        {config.inputConnectors.map((input) => (
          <div key={input.id} className="flex items-center gap-2 relative h-6">
            <Handle
              type="target"
              position={Position.Left}
              id={input.id}
              data-connector-type={input.type}
              className="!w-3 !h-3 !border-2 !border-background !-left-[18px] !absolute !top-1/2 !-translate-y-1/2"
            />
            <div className="text-xs font-medium text-muted-foreground">
              {input.label}
              {input.required && <span className="text-red-500 ml-1">*</span>}
              {input.acceptsMultiple && (
                <span className="text-xs text-muted-foreground/70 ml-1">
                  (multi)
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Blend Mode Selector */}
      <div className="space-y-3 mb-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Blend Mode
          </label>
          <Select
            value={data.blendMode}
            onValueChange={(value) => handleUpdate("blendMode", value)}
            disabled={data.readOnly}
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue placeholder="Select mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="multiply">Multiply</SelectItem>
              <SelectItem value="screen">Screen</SelectItem>
              <SelectItem value="add">Add</SelectItem>
              <SelectItem value="overlay">Overlay*</SelectItem>
              <SelectItem value="darken">Darken*</SelectItem>
              <SelectItem value="lighten">Lighten*</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-[10px] text-muted-foreground/60 mt-1">
            * Approximated modes
          </div>
        </div>

        {/* Opacity Slider */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Opacity: {Math.round(data.opacity * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={data.opacity * 100}
            onChange={(e) =>
              handleUpdate("opacity", parseInt(e.target.value) / 100)
            }
            disabled={data.readOnly}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer 
                     [&::-webkit-slider-thumb]:appearance-none 
                     [&::-webkit-slider-thumb]:w-4 
                     [&::-webkit-slider-thumb]:h-4 
                     [&::-webkit-slider-thumb]:rounded-full 
                     [&::-webkit-slider-thumb]:bg-primary
                     [&::-moz-range-thumb]:w-4 
                     [&::-moz-range-thumb]:h-4 
                     [&::-moz-range-thumb]:rounded-full 
                     [&::-moz-range-thumb]:bg-primary
                     [&::-moz-range-thumb]:border-0"
          />
        </div>
      </div>

      {/* Preview Info */}
      {data.compositePreview && (
        <div className="bg-muted/50 p-2 rounded border border-border mb-3">
          <div className="text-xs text-muted-foreground">
            {data.compositePreview}
          </div>
        </div>
      )}

      {/* Error Display */}
      {data.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
          <div className="text-xs text-red-500">{data.error}</div>
        </div>
      )}

      {/* Output Handle - Right side */}
      <div className="flex items-center justify-end gap-2 relative h-6">
        <div className="text-xs font-medium text-muted-foreground">
          {config.outputConnectors[0].label}
        </div>
        <Handle
          type="source"
          position={Position.Right}
          id={config.outputConnectors[0].id}
          data-connector-type={config.outputConnectors[0].type}
          className="!w-3 !h-3 !border-2 !border-background !-right-[18px] !absolute !top-1/2 !-translate-y-1/2"
        />
      </div>
    </div>
  );
}

export default ImageCompositeNode;
