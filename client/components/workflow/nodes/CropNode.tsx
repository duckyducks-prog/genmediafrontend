import { memo, useEffect, useCallback, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { CropNodeData } from "../types";
import { Crop } from "lucide-react";
import { FilterConfig } from "@/lib/pixi-filter-configs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ASPECT_RATIOS = {
  "1:1": 1,
  "3:4": 3 / 4,
  "4:3": 4 / 3,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  custom: 0,
};

function CropNode({ data, id }: NodeProps<CropNodeData>) {
  const imageInput = (data as any).image || (data as any).imageInput;
  const upstreamFiltersRaw = (data as any).filters || [];
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const upstreamFiltersKey = JSON.stringify(
    upstreamFiltersRaw.map((f: FilterConfig) => ({
      type: f.type,
      params: f.params,
    })),
  );

  const createConfig = useCallback(
    (width: number, height: number): FilterConfig => ({
      type: "crop",
      params: { width, height },
    }),
    [],
  );

  const updateOutputsRef = useRef((width: number, height: number) => {});

  useEffect(() => {
    updateOutputsRef.current = (width: number, height: number) => {
      const thisConfig = createConfig(width, height);
      const updatedFilters = [...upstreamFiltersRaw, thisConfig];

      console.log("[CropNode] Dispatching node-update:", {
        nodeId: id,
        width,
        height,
        hasImage: !!imageInput,
        upstreamFilterCount: upstreamFiltersRaw.length,
        totalFilterCount: updatedFilters.length,
      });

      const updateEvent = new CustomEvent("node-update", {
        detail: {
          id,
          data: {
            ...data,
            width,
            height,
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

  // Load image to get dimensions
  useEffect(() => {
    if (imageInput) {
      setImagePreview(imageInput);

      const img = new Image();
      img.onload = () => {
        const originalWidth = img.width;
        const originalHeight = img.height;

        setImageDimensions({ width: originalWidth, height: originalHeight });

        // Initialize dimensions if not set or if original dimensions changed
        if (
          !data.originalWidth ||
          data.originalWidth !== originalWidth ||
          data.originalHeight !== originalHeight
        ) {
          const updateEvent = new CustomEvent("node-update", {
            detail: {
              id,
              data: {
                ...data,
                width: originalWidth,
                height: originalHeight,
                originalWidth,
                originalHeight,
              },
            },
          });
          window.dispatchEvent(updateEvent);
        }
      };
      img.src = imageInput;
    } else {
      setImagePreview(null);
      setImageDimensions(null);
    }
  }, [imageInput, id]);

  // Update outputs whenever dimensions change
  useEffect(() => {
    if (data.width && data.height) {
      updateOutputsRef.current(data.width, data.height);
    }
  }, [data.width, data.height, imageInput, upstreamFiltersKey]);

  const handleAspectRatioChange = (value: string) => {
    const aspectRatio = value as CropNodeData["aspectRatio"];

    const updateEvent = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          aspectRatio,
        },
      },
    });
    window.dispatchEvent(updateEvent);

    // Calculate new dimensions based on aspect ratio
    if (aspectRatio !== "custom" && imageDimensions) {
      const ratio = ASPECT_RATIOS[aspectRatio];
      const currentRatio = imageDimensions.width / imageDimensions.height;

      let newWidth = imageDimensions.width;
      let newHeight = imageDimensions.height;

      if (currentRatio > ratio) {
        // Image is wider, constrain width
        newWidth = Math.round(imageDimensions.height * ratio);
      } else {
        // Image is taller, constrain height
        newHeight = Math.round(imageDimensions.width / ratio);
      }

      const dimensionUpdateEvent = new CustomEvent("node-update", {
        detail: {
          id,
          data: {
            ...data,
            aspectRatio,
            width: newWidth,
            height: newHeight,
          },
        },
      });
      window.dispatchEvent(dimensionUpdateEvent);
    }
  };

  const handleWidthChange = (value: string) => {
    const width = parseInt(value) || 1;
    const updateEvent = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          width,
          aspectRatio: "custom",
        },
      },
    });
    window.dispatchEvent(updateEvent);
  };

  const handleHeightChange = (value: string) => {
    const height = parseInt(value) || 1;
    const updateEvent = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          height,
          aspectRatio: "custom",
        },
      },
    });
    window.dispatchEvent(updateEvent);
  };

  const handleReset = () => {
    if (imageDimensions) {
      const updateEvent = new CustomEvent("node-update", {
        detail: {
          id,
          data: {
            ...data,
            width: imageDimensions.width,
            height: imageDimensions.height,
            aspectRatio: "custom",
          },
        },
      });
      window.dispatchEvent(updateEvent);
    }
  };

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[320px] shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Crop className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Crop</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="h-7 text-xs"
        >
          Reset
        </Button>
      </div>

      {/* Input Handles */}
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

      {/* Image Preview */}
      {imagePreview ? (
        <div className="mb-3 rounded-lg overflow-hidden bg-muted border border-border">
          <img
            src={imagePreview}
            alt="Crop preview"
            className="w-full h-auto max-h-[200px] object-contain"
            crossOrigin={
              imagePreview?.startsWith("data:") ? undefined : "anonymous"
            }
          />
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-center h-[150px] border-2 border-dashed border-border rounded-lg bg-muted/30">
          <div className="text-center text-muted-foreground">
            <Crop className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">No image connected</p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="space-y-3">
        {/* Aspect Ratio Selector */}
        <div>
          <label className="text-xs text-muted-foreground block mb-2">
            Aspect ratio
          </label>
          <Select
            value={data.aspectRatio}
            onValueChange={handleAspectRatioChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Custom</SelectItem>
              <SelectItem value="1:1">1:1</SelectItem>
              <SelectItem value="3:4">3:4</SelectItem>
              <SelectItem value="4:3">4:3</SelectItem>
              <SelectItem value="16:9">16:9</SelectItem>
              <SelectItem value="9:16">9:16</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Dimensions */}
        <div>
          <label className="text-xs text-muted-foreground block mb-2">
            Dimensions
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">W</div>
              <Input
                type="number"
                value={data.width || ""}
                onChange={(e) => handleWidthChange(e.target.value)}
                className="w-full"
                min={1}
                max={4096}
              />
            </div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">H</div>
              <Input
                type="number"
                value={data.height || ""}
                onChange={(e) => handleHeightChange(e.target.value)}
                className="w-full"
                min={1}
                max={4096}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Output Handles */}
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

export default memo(CropNode);
