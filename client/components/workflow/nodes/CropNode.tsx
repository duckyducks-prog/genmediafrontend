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
  "1:1": { ratio: 1, width: 1080, height: 1080 },
  "3:4": { ratio: 3 / 4, width: 1080, height: 1440 },
  "4:3": { ratio: 4 / 3, width: 1440, height: 1080 },
  "16:9": { ratio: 16 / 9, width: 1920, height: 1080 },
  "9:16": { ratio: 9 / 16, width: 1080, height: 1920 },
  custom: { ratio: 0, width: 0, height: 0 },
};

type ResizeHandle = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | null;

function CropNode({ data, id }: NodeProps<CropNodeData>) {
  const imageInput = (data as any).image || (data as any).imageInput;
  const upstreamFiltersRaw = (data as any).filters || [];
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<ResizeHandle>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [cropStart, setCropStart] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
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
        const originalWidth = img.naturalWidth;
        const originalHeight = img.naturalHeight;

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
      const aspectConfig = ASPECT_RATIOS[aspectRatio];

      // Start with standard dimensions
      let newWidth = aspectConfig.width;
      let newHeight = aspectConfig.height;

      // Check if standard dimensions fit within the image
      if (newWidth > imageDimensions.width || newHeight > imageDimensions.height) {
        // Scale down proportionally to fit
        const scaleX = imageDimensions.width / newWidth;
        const scaleY = imageDimensions.height / newHeight;
        const scale = Math.min(scaleX, scaleY);

        newWidth = Math.round(newWidth * scale);
        newHeight = Math.round(newHeight * scale);
      }

      // Center the crop area both horizontally and vertically
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

  // Handle drag on crop box center
  const handleCropMouseDown = (e: React.MouseEvent) => {
    if (!imageRef.current || !imageDimensions) return;

    e.stopPropagation();
    e.preventDefault();

    const rect = imageRef.current.getBoundingClientRect();

    // Calculate object-contain offset
    const containerWidth = rect.width;
    const containerHeight = rect.height;
    const imageAspect = imageDimensions.width / imageDimensions.height;
    const containerAspect = containerWidth / containerHeight;

    let renderedWidth, renderedHeight, offsetX, offsetY;

    if (imageAspect > containerAspect) {
      renderedWidth = containerWidth;
      renderedHeight = containerWidth / imageAspect;
      offsetX = 0;
      offsetY = (containerHeight - renderedHeight) / 2;
    } else {
      renderedHeight = containerHeight;
      renderedWidth = containerHeight * imageAspect;
      offsetX = (containerWidth - renderedWidth) / 2;
      offsetY = 0;
    }

    const scaleX = imageDimensions.width / renderedWidth;
    const scaleY = imageDimensions.height / renderedHeight;

    const clickX = (e.clientX - rect.left - offsetX) * scaleX;
    const clickY = (e.clientY - rect.top - offsetY) * scaleY;

    setIsDragging(true);
    setDragStart({ x: clickX - data.x, y: clickY - data.y });
    setCropStart({ x: data.x, y: data.y, width: data.width, height: data.height });
  };

  // Handle resize handle drag
  const handleResizeMouseDown = (e: React.MouseEvent, handle: ResizeHandle) => {
    if (!imageRef.current || !imageDimensions) return;

    e.stopPropagation();
    e.preventDefault();

    const rect = imageRef.current.getBoundingClientRect();

    // Calculate object-contain offset
    const containerWidth = rect.width;
    const containerHeight = rect.height;
    const imageAspect = imageDimensions.width / imageDimensions.height;
    const containerAspect = containerWidth / containerHeight;

    let renderedWidth, renderedHeight, offsetX, offsetY;

    if (imageAspect > containerAspect) {
      renderedWidth = containerWidth;
      renderedHeight = containerWidth / imageAspect;
      offsetX = 0;
      offsetY = (containerHeight - renderedHeight) / 2;
    } else {
      renderedHeight = containerHeight;
      renderedWidth = containerHeight * imageAspect;
      offsetX = (containerWidth - renderedWidth) / 2;
      offsetY = 0;
    }

    const scaleX = imageDimensions.width / renderedWidth;
    const scaleY = imageDimensions.height / renderedHeight;

    const clickX = (e.clientX - rect.left - offsetX) * scaleX;
    const clickY = (e.clientY - rect.top - offsetY) * scaleY;

    setIsResizing(handle);
    setDragStart({ x: clickX, y: clickY });
    setCropStart({ x: data.x, y: data.y, width: data.width, height: data.height });
  };

  // Global mouse move handler
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!imageRef.current || !imageDimensions || !dragStart || !cropStart) return;

      const rect = imageRef.current.getBoundingClientRect();

      // Calculate object-contain offset
      const containerWidth = rect.width;
      const containerHeight = rect.height;
      const imageAspect = imageDimensions.width / imageDimensions.height;
      const containerAspect = containerWidth / containerHeight;

      let renderedWidth, renderedHeight, offsetX, offsetY;

      if (imageAspect > containerAspect) {
        renderedWidth = containerWidth;
        renderedHeight = containerWidth / imageAspect;
        offsetX = 0;
        offsetY = (containerHeight - renderedHeight) / 2;
      } else {
        renderedHeight = containerHeight;
        renderedWidth = containerHeight * imageAspect;
        offsetX = (containerWidth - renderedWidth) / 2;
        offsetY = 0;
      }

      const scaleX = imageDimensions.width / renderedWidth;
      const scaleY = imageDimensions.height / renderedHeight;

      const mouseX = (e.clientX - rect.left - offsetX) * scaleX;
      const mouseY = (e.clientY - rect.top - offsetY) * scaleY;

      if (isDragging) {
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
      } else if (isResizing) {
        const dx = mouseX - dragStart.x;
        const dy = mouseY - dragStart.y;

        let newX = cropStart.x;
        let newY = cropStart.y;
        let newW = cropStart.width;
        let newH = cropStart.height;

        const aspectRatio = data.aspectRatio !== "custom" && data.aspectRatio
          ? ASPECT_RATIOS[data.aspectRatio].ratio
          : null;

        if (isResizing === 'bottomRight') {
          newW = Math.max(50, cropStart.width + dx);
          newH = aspectRatio ? newW / aspectRatio : Math.max(50, cropStart.height + dy);
        } else if (isResizing === 'bottomLeft') {
          newW = Math.max(50, cropStart.width - dx);
          newH = aspectRatio ? newW / aspectRatio : Math.max(50, cropStart.height + dy);
          newX = cropStart.x + cropStart.width - newW;
        } else if (isResizing === 'topRight') {
          newW = Math.max(50, cropStart.width + dx);
          newH = aspectRatio ? newW / aspectRatio : Math.max(50, cropStart.height - dy);
          newY = cropStart.y + cropStart.height - newH;
        } else if (isResizing === 'topLeft') {
          newW = Math.max(50, cropStart.width - dx);
          newH = aspectRatio ? newW / aspectRatio : Math.max(50, cropStart.height - dy);
          newX = cropStart.x + cropStart.width - newW;
          newY = cropStart.y + cropStart.height - newH;
        }

        // Constrain to image bounds
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);
        newW = Math.min(newW, imageDimensions.width - newX);
        newH = Math.min(newH, imageDimensions.height - newY);

        const updateEvent = new CustomEvent("node-update", {
          detail: {
            id,
            data: {
              ...data,
              x: Math.round(newX),
              y: Math.round(newY),
              width: Math.round(newW),
              height: Math.round(newH),
              aspectRatio: "custom",
            },
          },
        });
        window.dispatchEvent(updateEvent);
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setIsResizing(null);
      setDragStart(null);
      setCropStart(null);
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [isDragging, isResizing, dragStart, cropStart, imageDimensions, data, id]);

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

  // Get handle positions
  const getHandleStyle = (handle: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight') => {
    if (!imageDimensions || !imageRef.current) return {};

    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = rect.width / imageDimensions.width;
    const scaleY = rect.height / imageDimensions.height;

    const cropStyle = getCropOverlayStyle();
    const left = parseFloat(cropStyle.left as string || '0');
    const top = parseFloat(cropStyle.top as string || '0');
    const width = parseFloat(cropStyle.width as string || '0');
    const height = parseFloat(cropStyle.height as string || '0');

    switch (handle) {
      case 'topLeft':
        return { left: `${left}px`, top: `${top}px` };
      case 'topRight':
        return { left: `${left + width}px`, top: `${top}px` };
      case 'bottomLeft':
        return { left: `${left}px`, top: `${top + height}px` };
      case 'bottomRight':
        return { left: `${left + width}px`, top: `${top + height}px` };
    }
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
        <div 
          ref={imageContainerRef}
          className="nodrag mb-3 rounded-lg overflow-hidden bg-muted border border-border relative"
        >
          <img
            ref={imageRef}
            src={imagePreview}
            alt="Crop preview"
            className="w-full h-auto max-h-[220px] object-contain"
            crossOrigin={
              imagePreview?.startsWith("data:") ? undefined : "anonymous"
            }
          />
          {/* Crop overlay with cutout effect */}
          {imageDimensions && (() => {
            const rect = imageRef.current?.getBoundingClientRect();
            if (!rect) return null;

            // Calculate actual rendered image size with object-contain
            const containerWidth = rect.width;
            const containerHeight = rect.height;
            const imageAspect = imageDimensions.width / imageDimensions.height;
            const containerAspect = containerWidth / containerHeight;

            let renderedWidth, renderedHeight, offsetX, offsetY;

            if (imageAspect > containerAspect) {
              // Image is wider - letterbox top/bottom
              renderedWidth = containerWidth;
              renderedHeight = containerWidth / imageAspect;
              offsetX = 0;
              offsetY = (containerHeight - renderedHeight) / 2;
            } else {
              // Image is taller - letterbox left/right
              renderedHeight = containerHeight;
              renderedWidth = containerHeight * imageAspect;
              offsetX = (containerWidth - renderedWidth) / 2;
              offsetY = 0;
            }

            const scaleX = renderedWidth / imageDimensions.width;
            const scaleY = renderedHeight / imageDimensions.height;

            const cropLeft = offsetX + data.x * scaleX;
            const cropTop = offsetY + data.y * scaleY;
            const cropWidth = data.width * scaleX;
            const cropHeight = data.height * scaleY;

            return (
              <>
                {/* Dark overlay - 4 rectangles around crop box */}
                {/* Top */}
                <div
                  className="absolute bg-black/60 pointer-events-none"
                  style={{
                    left: offsetX,
                    top: offsetY,
                    width: renderedWidth,
                    height: cropTop - offsetY,
                  }}
                />
                {/* Bottom */}
                <div
                  className="absolute bg-black/60 pointer-events-none"
                  style={{
                    left: offsetX,
                    top: cropTop + cropHeight,
                    width: renderedWidth,
                    height: offsetY + renderedHeight - cropTop - cropHeight,
                  }}
                />
                {/* Left */}
                <div
                  className="absolute bg-black/60 pointer-events-none"
                  style={{
                    left: offsetX,
                    top: cropTop,
                    width: cropLeft - offsetX,
                    height: cropHeight,
                  }}
                />
                {/* Right */}
                <div
                  className="absolute bg-black/60 pointer-events-none"
                  style={{
                    left: cropLeft + cropWidth,
                    top: cropTop,
                    width: offsetX + renderedWidth - cropLeft - cropWidth,
                    height: cropHeight,
                  }}
                />

                {/* Crop box border and drag area */}
                <div
                  className={`nodrag absolute select-none transition-all ${
                    isDragging ? "cursor-grabbing" : "cursor-grab"
                  }`}
                  style={{
                    left: cropLeft,
                    top: cropTop,
                    width: cropWidth,
                    height: cropHeight,
                  }}
                  onMouseDown={handleCropMouseDown}
                >
                  {/* Border */}
                  <div className="absolute inset-0 border-2 border-white pointer-events-none" />

                  {/* Rule of thirds grid */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.3 }}>
                    <line x1="33.33%" y1="0" x2="33.33%" y2="100%" stroke="white" strokeWidth="1" />
                    <line x1="66.66%" y1="0" x2="66.66%" y2="100%" stroke="white" strokeWidth="1" />
                    <line x1="0" y1="33.33%" x2="100%" y2="33.33%" stroke="white" strokeWidth="1" />
                    <line x1="0" y1="66.66%" x2="100%" y2="66.66%" stroke="white" strokeWidth="1" />
                  </svg>
                </div>

                {/* Resize handles */}
                <div
                  className="nodrag absolute w-3 h-3 bg-white rounded-full cursor-nwse-resize -translate-x-1/2 -translate-y-1/2 border-2 border-primary shadow-md hover:scale-125 transition-transform"
                  style={{ left: cropLeft, top: cropTop }}
                  onMouseDown={(e) => handleResizeMouseDown(e, 'topLeft')}
                />
                <div
                  className="nodrag absolute w-3 h-3 bg-white rounded-full cursor-nesw-resize -translate-x-1/2 -translate-y-1/2 border-2 border-primary shadow-md hover:scale-125 transition-transform"
                  style={{ left: cropLeft + cropWidth, top: cropTop }}
                  onMouseDown={(e) => handleResizeMouseDown(e, 'topRight')}
                />
                <div
                  className="nodrag absolute w-3 h-3 bg-white rounded-full cursor-nesw-resize -translate-x-1/2 -translate-y-1/2 border-2 border-primary shadow-md hover:scale-125 transition-transform"
                  style={{ left: cropLeft, top: cropTop + cropHeight }}
                  onMouseDown={(e) => handleResizeMouseDown(e, 'bottomLeft')}
                />
                <div
                  className="nodrag absolute w-3 h-3 bg-white rounded-full cursor-nwse-resize -translate-x-1/2 -translate-y-1/2 border-2 border-primary shadow-md hover:scale-125 transition-transform"
                  style={{ left: cropLeft + cropWidth, top: cropTop + cropHeight }}
                  onMouseDown={(e) => handleResizeMouseDown(e, 'bottomRight')}
                />
              </>
            );
          })()}
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
