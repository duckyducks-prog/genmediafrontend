import { useState, useEffect, useCallback, useRef } from "react";
import { useReactFlow } from "reactflow";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NODE_CONFIGURATIONS, NodeType } from "./types";

interface NodeSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NodeSearchDialog({ isOpen, onClose }: NodeSearchDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { getNodes, setCenter, getZoom } = useReactFlow();
  const inputRef = useRef<HTMLInputElement>(null);

  const nodes = getNodes();

  // Filter nodes by search term (matches label or type)
  const filteredNodes = nodes.filter((node) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    const label = (node.data.label || "").toLowerCase();
    const customLabel = (node.data.customLabel || "").toLowerCase();
    const nodeType = node.type?.toLowerCase() || "";

    // Also check NODE_CONFIGURATIONS for the node type label
    const config = NODE_CONFIGURATIONS[node.type as NodeType];
    const configLabel = config?.label?.toLowerCase() || "";

    return (
      label.includes(searchLower) ||
      customLabel.includes(searchLower) ||
      nodeType.includes(searchLower) ||
      configLabel.includes(searchLower)
    );
  });

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredNodes.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredNodes[selectedIndex]) {
            const node = filteredNodes[selectedIndex];
            // Center on the selected node
            const zoom = getZoom();
            setCenter(
              node.position.x + (node.width || 200) / 2,
              node.position.y + (node.height || 100) / 2,
              { zoom: Math.max(zoom, 1), duration: 500 }
            );
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredNodes, selectedIndex, setCenter, getZoom, onClose]
  );

  const handleNodeClick = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      const zoom = getZoom();
      setCenter(
        node.position.x + (node.width || 200) / 2,
        node.position.y + (node.height || 100) / 2,
        { zoom: Math.max(zoom, 1), duration: 500 }
      );
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-lg shadow-2xl w-[400px] max-h-[60vh] overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-2 p-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search nodes by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            className="border-0 focus-visible:ring-0 p-0 h-auto text-sm"
          />
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[calc(60vh-60px)] overflow-y-auto">
          {filteredNodes.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No nodes found
            </div>
          ) : (
            <ul className="py-1">
              {filteredNodes.map((node, index) => {
                const config = NODE_CONFIGURATIONS[node.type as NodeType];
                const displayLabel = node.data.customLabel || node.data.label || config?.label || node.type;

                return (
                  <li
                    key={node.id}
                    onClick={() => handleNodeClick(node.id)}
                    className={`px-3 py-2 cursor-pointer flex items-center justify-between ${
                      index === selectedIndex
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{displayLabel}</span>
                      <span className="text-xs text-muted-foreground">
                        {config?.label || node.type}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {node.id.slice(0, 8)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground flex gap-4">
          <span><kbd className="px-1 bg-muted rounded">↑↓</kbd> Navigate</span>
          <span><kbd className="px-1 bg-muted rounded">Enter</kbd> Go to node</span>
          <span><kbd className="px-1 bg-muted rounded">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
