import { useViewport } from "reactflow";
import { WorkflowNode } from "./types";

interface FloatingLabelsProps {
  nodes: WorkflowNode[];
}

/**
 * Renders floating labels above nodes that have customLabel set.
 * Labels are positioned in screen space based on node positions and viewport transform.
 */
export function FloatingLabels({ nodes }: FloatingLabelsProps) {
  const { x: viewX, y: viewY, zoom } = useViewport();

  // Filter nodes that have custom labels
  const labeledNodes = nodes.filter((node) => node.data.customLabel);

  if (labeledNodes.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
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
              top: screenY - 28 * zoom, // Position above node
              transform: `scale(${zoom})`,
              transformOrigin: "bottom left",
            }}
          >
            <span
              className="inline-block px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground bg-primary/80 rounded whitespace-nowrap"
              style={{
                fontSize: "10px",
              }}
            >
              {node.data.customLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}
