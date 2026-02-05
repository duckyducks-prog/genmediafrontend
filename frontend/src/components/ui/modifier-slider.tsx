import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

/**
 * ModifierSlider - Enhanced slider for modifier nodes
 *
 * Improvements over base Slider:
 * - Taller track (12px) for easier clicking
 * - Cursor feedback (pointer on track, grab on thumb)
 * - Larger thumb for better grip
 *
 * To revert: Replace ModifierSlider imports with Slider in modifier nodes
 */
const ModifierSlider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => {
  const [isDragging, setIsDragging] = React.useState(false);

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center cursor-pointer",
        className,
      )}
      onPointerDown={(e) => {
        e.stopPropagation();
        setIsDragging(true);
      }}
      onPointerUp={() => setIsDragging(false)}
      onPointerLeave={() => setIsDragging(false)}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-3 w-full grow overflow-hidden rounded-full bg-secondary cursor-pointer">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className={cn(
          "block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
        onPointerDown={(e) => {
          e.stopPropagation();
          setIsDragging(true);
        }}
        onPointerUp={() => setIsDragging(false)}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      />
    </SliderPrimitive.Root>
  );
});
ModifierSlider.displayName = "ModifierSlider";

export { ModifierSlider };
