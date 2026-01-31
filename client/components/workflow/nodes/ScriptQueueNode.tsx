"use client";

import { memo, useEffect, useMemo } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "reactflow";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScriptQueueNodeData } from "../types";
import { ListOrdered, CheckCircle2, Loader2, Power } from "lucide-react";

function ScriptQueueNode({ data, id }: NodeProps<ScriptQueueNodeData>) {
  const { setNodes } = useReactFlow();
  const isEnabled = data.enabled !== false;

  // Parse scripts from batchInput based on separator
  const scripts = useMemo(() => {
    if (!data.batchInput || data.batchInput.trim() === "") return [];

    let separator = "\n";
    if (data.separator === "---") {
      separator = "---";
    } else if (data.separator === "custom" && data.customSeparator) {
      separator = data.customSeparator;
    }

    return data.batchInput
      .split(separator)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }, [data.batchInput, data.separator, data.customSeparator]);

  // Update scripts array when batchInput changes
  useEffect(() => {
    if (JSON.stringify(scripts) !== JSON.stringify(data.scripts)) {
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  scripts,
                  outputs: { text: scripts[0] || "" }, // First script as default output
                },
              }
            : node
        )
      );
    }
  }, [scripts, data.scripts, id, setNodes]);

  const handleBatchInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (data.readOnly) return;
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                batchInput: e.target.value,
              },
            }
          : node
      )
    );
  };

  const handleSeparatorChange = (value: "---" | "newline" | "custom") => {
    if (data.readOnly) return;
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                separator: value,
              },
            }
          : node
      )
    );
  };

  const handleCustomSeparatorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (data.readOnly) return;
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                customSeparator: e.target.value,
              },
            }
          : node
      )
    );
  };

  const handleToggleEnabled = () => {
    if (data.readOnly) return;
    const event = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          enabled: !isEnabled,
        },
      },
    });
    window.dispatchEvent(event);
  };

  const status = data.status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";
  const currentIndex = data.currentIndex || 0;

  const getBorderColor = () => {
    if (!isEnabled) return "border-muted";
    if (data.isProcessing) return "border-yellow-500";
    return "border-border";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[320px] shadow-lg transition-colors ${getBorderColor()} ${!isEnabled ? "opacity-50" : ""}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">Script Queue</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleEnabled}
            disabled={data.readOnly}
            className={`p-1 rounded transition-colors ${
              isEnabled
                ? "text-green-500 hover:bg-green-500/10"
                : "text-muted-foreground hover:bg-muted"
            }`}
            title={isEnabled ? "Disable node" : "Enable node"}
          >
            <Power className="w-4 h-4" />
          </button>
          {isExecuting && (
            <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
          )}
          {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        </div>
      </div>

      {/* Script Count Badge */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {scripts.length === 0
            ? "No scripts loaded"
            : `${scripts.length} script${scripts.length !== 1 ? "s" : ""} loaded`}
        </span>
        {data.isProcessing && (
          <span className="text-xs font-medium text-yellow-500">
            Processing {currentIndex + 1}/{scripts.length}
          </span>
        )}
      </div>

      {/* Separator Selector */}
      <div className="mb-3">
        <label className="text-xs font-medium text-muted-foreground block mb-1">
          Split by
        </label>
        <Select
          value={data.separator || "---"}
          onValueChange={handleSeparatorChange}
          disabled={data.readOnly || !isEnabled}
        >
          <SelectTrigger className="w-full h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="---">--- (triple dash)</SelectItem>
            <SelectItem value="newline">New line</SelectItem>
            <SelectItem value="custom">Custom separator</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Custom Separator Input */}
      {data.separator === "custom" && (
        <div className="mb-3">
          <Input
            value={data.customSeparator || ""}
            onChange={handleCustomSeparatorChange}
            placeholder="Enter custom separator..."
            className="h-8 text-xs nodrag"
            disabled={data.readOnly || !isEnabled}
          />
        </div>
      )}

      {/* Scripts Input */}
      <div className="mb-3">
        <label className="text-xs font-medium text-muted-foreground block mb-1">
          Paste scripts below
        </label>
        <Textarea
          value={data.batchInput || ""}
          onChange={handleBatchInputChange}
          placeholder={`Script 1...\n---\nScript 2...\n---\nScript 3...`}
          className="min-h-[150px] text-xs nodrag font-mono"
          disabled={data.readOnly || !isEnabled}
        />
      </div>

      {/* Script Preview */}
      {scripts.length > 0 && (
        <div className="bg-muted/50 rounded p-2 max-h-[100px] overflow-y-auto">
          <div className="text-xs text-muted-foreground mb-1">Preview:</div>
          {scripts.slice(0, 5).map((script, i) => (
            <div
              key={i}
              className={`text-xs py-1 border-b border-border/50 last:border-0 ${
                data.isProcessing && i === currentIndex
                  ? "text-yellow-500 font-medium"
                  : "text-foreground/70"
              }`}
            >
              <span className="text-muted-foreground mr-2">{i + 1}.</span>
              {script.substring(0, 50)}
              {script.length > 50 ? "..." : ""}
            </div>
          ))}
          {scripts.length > 5 && (
            <div className="text-xs text-muted-foreground mt-1">
              +{scripts.length - 5} more...
            </div>
          )}
        </div>
      )}

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        data-connector-type="text"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />
    </div>
  );
}

export default memo(ScriptQueueNode);
