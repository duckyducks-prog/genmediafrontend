import { memo, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "reactflow";
import {
  TextIteratorNodeData,
  NODE_CONFIGURATIONS,
  NodeType,
  WorkflowNode,
  WorkflowEdge,
} from "../types";
import { List, ChevronDown, AlertCircle } from "lucide-react";
import { gatherNodeInputs } from "../executionHelpers";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

function parseBatchInput(input: string, separator: string): string[] {
  if (!input?.trim()) return [];

  const sep = separator === "Newline" ? "\n" : separator;
  return input
    .split(sep)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function TextIteratorNode({ data, id }: NodeProps<TextIteratorNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.TextIterator];
  const status = data.status || "ready";
  const { getNodes, getEdges } = useReactFlow();

  // Real-time execution: Update outputs when inputs change
  useEffect(() => {
    const nodes = getNodes() as WorkflowNode[];
    const edges = getEdges() as WorkflowEdge[];
    const currentNode = nodes.find((n) => n.id === id);

    if (!currentNode) return;

    // Gather inputs from connected nodes
    const inputs = gatherNodeInputs(currentNode, nodes, edges);

    // Resolve separator (handle "Custom" separator properly)
    const resolvedSeparator =
      data.separator === "Custom"
        ? data.customSeparator || ","
        : data.separator || "Newline";

    // Get connected variable items and split if they're text strings
    const connectedItems = inputs.variable_items || [];
    let connectedItemsArray: string[] = [];

    if (typeof connectedItems === "string") {
      // Single connected text - split it using the resolved separator
      connectedItemsArray = parseBatchInput(connectedItems, resolvedSeparator);
    } else if (Array.isArray(connectedItems)) {
      // Multiple connections - split each string and flatten
      connectedItemsArray = connectedItems.flatMap((item) =>
        typeof item === "string"
          ? parseBatchInput(item, resolvedSeparator)
          : [item]
      );
    }

    // Parse batch input using resolved separator
    const batchItems = parseBatchInput(
      data.batchInput || "",
      resolvedSeparator,
    );

    // Combine (batch input takes precedence if not empty)
    const variableItems =
      batchItems.length > 0 ? batchItems : connectedItemsArray;

    // Get fixed section from input or node data
    const fixedSection = inputs.fixed_section || data.fixedSection || "";

    // Combine fixed + each variable to create outputs
    const outputs: Record<string, string> = {};
    const previews: string[] = [];

    variableItems.forEach((item: string, index: number) => {
      const combined =
        `${fixedSection}${fixedSection && item ? " " : ""}${item}`.trim();
      outputs[`output_${index}`] = combined;
      previews.push(combined);
    });

    // Update node with outputs
    const event = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          variableItems,
          itemPreviews: previews,
          dynamicOutputCount: variableItems.length,
          outputs,
        },
      },
    });
    window.dispatchEvent(event);
  }, [
    id,
    data.fixedSection,
    data.batchInput,
    data.separator,
    data.customSeparator,
    getNodes,
    getEdges,
  ]);

  const handleUpdate = (field: keyof TextIteratorNodeData, value: any) => {
    // Block updates in read-only mode
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
    if (status === "error") return "border-red-500";
    return "border-border";
  };

  // Render dynamic output handles
  const renderOutputHandles = () => {
    const count = data.dynamicOutputCount || 0;
    if (count === 0) return null;

    return (
      <div className="absolute right-0 top-0 h-full flex flex-col justify-evenly py-4">
        {Array.from({ length: count }, (_, i) => (
          <div key={`output_${i}`} className="relative flex items-center">
            <Handle
              type="source"
              position={Position.Right}
              id={`output_${i}`}
              data-connector-type="text"
              className="!w-3 !h-3 !border-2 !border-background"
            />
            <div className="absolute right-5 text-xs font-medium text-muted-foreground whitespace-nowrap">
              Output {i + 1}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[320px] max-w-[400px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <List className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Text Iterator"}
          </div>
        </div>
        {data.dynamicOutputCount > 0 && (
          <div className="text-xs text-muted-foreground">
            {data.dynamicOutputCount} items
          </div>
        )}
      </div>

      {/* Input Handles - Left side */}
      <div className="space-y-3 mb-4">
        {config.inputConnectors.map((input, index) => {
          const isRequired = input.required;
          const isMultiple = input.acceptsMultiple;

          return (
            <div
              key={input.id}
              className="flex items-center gap-2 relative h-6"
            >
              <Handle
                type="target"
                position={Position.Left}
                id={input.id}
                data-connector-type={input.type}
                className="!w-3 !h-3 !border-2 !border-background !-left-[18px] !absolute !top-1/2 !-translate-y-1/2"
              />
              <div className="text-xs font-medium text-muted-foreground">
                {input.label}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
                {isMultiple && (
                  <span className="text-blue-500 ml-1">(multi)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Node Content */}
      <div className="space-y-3">
        {/* Fixed Section Input */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Fixed Section (Applied to all)
          </label>
          <Input
            value={data.fixedSection}
            onChange={(e) => handleUpdate("fixedSection", e.target.value)}
            placeholder="Character blocking: Person at desk"
            className="text-sm"
            disabled={data.readOnly}
          />
        </div>

        {/* Batch Input Text Area */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Variable Items (one per line)
          </label>
          <Textarea
            value={data.batchInput}
            onChange={(e) => handleUpdate("batchInput", e.target.value)}
            placeholder="Hello everyone&#10;Today I'll show you&#10;How to use this tool"
            rows={4}
            className="text-sm font-mono"
            disabled={data.readOnly}
          />
        </div>

        {/* Separator Selection */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Split By
          </label>
          <div className="relative">
            <select
              value={data.separator}
              onChange={(e) =>
                handleUpdate(
                  "separator",
                  e.target.value as "Newline" | "Custom",
                )
              }
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md appearance-none pr-8"
              disabled={data.readOnly}
            >
              <option value="Newline">Newline</option>
              <option value="Custom">Custom</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Custom Separator (if selected) */}
        {data.separator === "Custom" && (
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Custom Separator
            </label>
            <Input
              value={data.customSeparator || ""}
              onChange={(e) => handleUpdate("customSeparator", e.target.value)}
              placeholder=","
              className="text-sm"
              disabled={data.readOnly}
            />
          </div>
        )}

        {/* Preview */}
        {data.itemPreviews && data.itemPreviews.length > 0 ? (
          <div className="bg-muted/50 p-2 rounded border border-border max-h-48 overflow-y-auto">
            <div className="text-xs text-muted-foreground mb-1 font-medium">
              Preview:
            </div>
            <div className="space-y-1">
              {data.itemPreviews.map((preview, i) => (
                <div
                  key={i}
                  className="text-xs font-mono leading-relaxed break-words line-clamp-2"
                  title={preview}
                >
                  <span className="text-muted-foreground mr-2">{i + 1}.</span>
                  {preview}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-muted/30 p-3 rounded border border-dashed border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="w-4 h-4" />
              <span>Add variable items to see preview</span>
            </div>
          </div>
        )}

        {data.error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
            {data.error}
          </div>
        )}
      </div>

      {/* Dynamic Output Handles */}
      {renderOutputHandles()}
    </div>
  );
}

export default memo(TextIteratorNode);
