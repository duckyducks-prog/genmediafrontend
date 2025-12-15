import { memo, useEffect, useCallback, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { CropNodeData } from "../types";
import { Crop, Maximize2 } from "lucide-react";
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
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const cropOverlayRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const upstreamFiltersKey = JSON.stringify(
    upstreamFiltersRaw.map((f: FilterConfig) => ({
      type: f.type,
      params: f.params,
    })),
  );

  const createConfig = useCallback(
    (x: number, y: number, width: number, height: number): FilterConfig => ({
      type: "crop",
      params: { x, y, width, height },
    }),
    [],
  );

  const updateOutputsRef = useRef(
    (x: number, y: number, width: number, height: number) => {},
  );

  useEffect(() => {
    updateOutputsRef.current = (
      x: number,
      y: number,
      width: number,
      height: number,
    ) => {
      const thisConfig = createConfig(x, y, width, height);
      const updatedFilters = [...upstreamFiltersRaw, thisConfig];

      console.log("[CropNode] Dispatching node-update:", {
        nodeId: id,
        x,
        y,
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
            x,
            y,
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
                x: 0,
                y: 0,
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

  // Update outputs whenever crop parameters change
  useEffect(() => {
    if (
      data.width &&
      data.height &&
      data.x !== undefined &&
      data.y !== undefined
    ) {
      updateOutputsRef.current(data.x, data.y, data.width, data.height);
    }
  }, [data.x, data.y, data.width, data.height, imageInput, upstreamFiltersKey]);

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

      // Center the crop area
      const newX = Math.floor((imageDimensions.width - newWidth) / 2);
      const newY = Math.floor((imageDimensions.height - newHeight) / 2);

      const dimensionUpdateEvent = new CustomEvent("node-update", {
        detail: {
          id,
          data: {
            ...data,
            aspectRatio,
            x: newX,
            y: newY,
            width: newWidth,
            height: newHeight,
          },
        },
      });
      window.dispatchEvent(dimensionUpdateEvent);
    }
  };

  const handlePositionChange = (axis: "x" | "y", value: string) => {
    const numValue = parseInt(value) || 0;
    const maxValue =
      axis === "x"
        ? (imageDimensions?.width || 0) - data.width
        : (imageDimensions?.height || 0) - data.height;
    const clampedValue = Math.max(0, Math.min(numValue, maxValue));

    const updateEvent = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          [axis]: clampedValue,
          aspectRatio: "custom",
        },
      },
    });
    window.dispatchEvent(updateEvent);
  };

  const handleDimensionChange = (dimension: "width" | "height", value: string) => {
    const numValue = parseInt(value) || 1;
    const updateEvent = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          [dimension]: numValue,
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
            x: 0,
            y: 0,
            width: imageDimensions.width,
            height: imageDimensions.height,
            aspectRatio: "custom",
          },
        },
      });
      window.dispatchEvent(updateEvent);
    }
  };

  const handleFitToCrop = () => {
    if (imageDimensions) {
      // Keep current crop dimensions, just center it
      const newX = Math.floor((imageDimensions.width - data.width) / 2);
      const newY = Math.floor((imageDimensions.height - data.height) / 2);

      const updateEvent = new CustomEvent("node-update", {
        detail: {
          id,
          data: {
            ...data,
            x: Math.max(0, newX),
            y: Math.max(0, newY),
          },
        },
      });
      window.dispatchEvent(updateEvent);
    }
  };

  // Handle drag on crop overlay
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageRef.current || !imageDimensions) return;

    // Prevent React Flow from dragging the node
    e.stopPropagation();
    e.preventDefault();

    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = imageDimensions.width / rect.width;
    const scaleY = imageDimensions.height / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    setIsDragging(true);
    setDragStart({ x: clickX - data.x, y: clickY - data.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStart || !imageRef.current || !imageDimensions)
      return;

    // Prevent React Flow from handling this
    e.stopPropagation();
    e.preventDefault();

    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = imageDimensions.width / rect.width;
    const scaleY = imageDimensions.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const newX = Math.max(
      0,
      Math.min(mouseX - dragStart.x, imageDimensions.width - data.width),
    );
    const newY = Math.max(
      0,
      Math.min(mouseY - dragStart.y, imageDimensions.height - data.height),
    );

    const updateEvent = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          x: Math.round(newX),
          y: Math.round(newY),
          aspectRatio: "custom",
        },
      },
    });
    window.dispatchEvent(updateEvent);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        if (!imageRef.current || !imageDimensions || !dragStart) return;

        const rect = imageRef.current.getBoundingClientRect();
        const scaleX = imageDimensions.width / rect.width;
        const scaleY = imageDimensions.height / rect.height;

        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        const newX = Math.max(
          0,
          Math.min(mouseX - dragStart.x, imageDimensions.width - data.width),
        );
        const newY = Math.max(
          0,
          Math.min(mouseY - dragStart.y, imageDimensions.height - data.height),
        );

        const updateEvent = new CustomEvent("node-update", {
          detail: {
            id,
            data: {
              ...data,
              x: Math.round(newX),
              y: Math.round(newY),
              aspectRatio: "custom",
            },
          },
        });
        window.dispatchEvent(updateEvent);
      };

      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleMouseUp as any);
      return () => {
        window.removeEventListener("mousemove", handleGlobalMouseMove);
        window.removeEventListener("mouseup", handleMouseUp as any);
      };
    }
  }, [isDragging, dragStart, imageDimensions, data, id]);

  // Calculate crop overlay position and size for display
  const getCropOverlayStyle = () => {
    if (!imageDimensions || !imageRef.current) return {};

    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = rect.width / imageDimensions.width;
    const scaleY = rect.height / imageDimensions.height;

    return {
      left: `${data.x * scaleX}px`,
      top: `${data.y * scaleY}px`,
      width: `${data.width * scaleX}px`,
      height: `${data.height * scaleY}px`,
    };
  };

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[340px] shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Crop className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Crop</span>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFitToCrop}
            className="h-7 text-xs px-2"
            title="Center crop area"
          >
            <Maximize2 className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-7 text-xs"
          >
            Reset
          </Button>
        </div>
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

      {/* Image Preview with Crop Overlay */}
      {imagePreview ? (
        <div className="noDrag mb-3 rounded-lg overflow-hidden bg-muted border border-border relative">
          <img
            ref={imageRef}
            src={imagePreview}
            alt="Crop preview"
            className="w-full h-auto max-h-[220px] object-contain"
            crossOrigin={
              imagePreview?.startsWith("data:") ? undefined : "anonymous"
            }
          />
          {/* Crop overlay */}
          {imageDimensions && (
            <>
              {/* Dark overlay outside crop area */}
              <div className="absolute inset-0 bg-black/40 pointer-events-none" />
              {/* Crop box */}
              <div
                ref={cropOverlayRef}
                className={`noDrag absolute border-2 border-primary bg-transparent select-none transition-all ${
                  isDragging
                    ? "cursor-grabbing border-primary shadow-lg shadow-primary/50"
                    : "cursor-grab hover:border-primary/80 hover:shadow-md hover:shadow-primary/30"
                }`}
                style={getCropOverlayStyle()}
                onMouseDown={handleMouseDown}
              >
                {/* Corner handles */}
                <div className="absolute -top-1 -left-1 w-3 h-3 bg-primary rounded-full" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full" />
                <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-primary rounded-full" />
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-full" />
                {/* Crosshair lines */}
                <div className="absolute top-1/2 left-0 right-0 h-px bg-primary/50" />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-primary/50" />
              </div>
            </>
          )}
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

        {/* Position */}
        <div>
          <label className="text-xs text-muted-foreground block mb-2">
            Position
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">X</div>
              <Input
                type="number"
                value={data.x || 0}
                onChange={(e) => handlePositionChange("x", e.target.value)}
                className="w-full"
                min={0}
                max={Math.max(0, (imageDimensions?.width || 0) - data.width)}
              />
            </div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">Y</div>
              <Input
                type="number"
                value={data.y || 0}
                onChange={(e) => handlePositionChange("y", e.target.value)}
                className="w-full"
                min={0}
                max={Math.max(0, (imageDimensions?.height || 0) - data.height)}
              />
            </div>
          </div>
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
                onChange={(e) => handleDimensionChange("width", e.target.value)}
                className="w-full"
                min={1}
                max={imageDimensions?.width || 4096}
              />
            </div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">H</div>
              <Input
                type="number"
                value={data.height || ""}
                onChange={(e) =>
                  handleDimensionChange("height", e.target.value)
                }
                className="w-full"
                min={1}
                max={imageDimensions?.height || 4096}
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
