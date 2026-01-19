import { useViewport } from "reactflow";
import { WorkflowNode } from "./types";

interface FloatingLabelsProps {
  nodes: WorkflowNode[];
}

/**
 * Renders floating labels above nodes that have customLabel set.
 * Labels are positioned in screen space based on node positions and viewport transform.
 * Labels maintain a readable size regardless of zoom level.
 */
export function FloatingLabels({ nodes }: FloatingLabelsProps) {
  const { x: viewX, y: viewY, zoom } = useViewport();

  // Filter nodes that have custom labels
  const labeledNodes = nodes.filter((node) => node.data.customLabel);

  if (labeledNodes.length === 0) return null;

  // Keep labels readable: min scale 0.7, max scale 1.2
  const labelScale = Math.max(0.7, Math.min(1.2, zoom));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-[1000]">
      {labeledNodes.map((node) => {
        // Transform node position to screen position
        const screenX = node.position.x * zoom + viewX;
        const screenY = node.position.y * zoom + viewY;

        return (
          <div
            key={`label-${node.id}`}
            className="absolute pointer-events-none"
            style={{
              left: screenX,
              top: screenY - 24, // Fixed offset above node
              transform: `scale(${labelScale})`,
              transformOrigin: "bottom left",
            }}
          >
            <span
              className="inline-block px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground bg-primary rounded whitespace-nowrap shadow-sm"
            >
              {node.data.customLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}
