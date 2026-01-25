"use client";

import { memo, useCallback } from "react";
import { NodeProps, Handle, Position } from "reactflow";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Combine, CheckCircle, AlertCircle, Info } from "lucide-react";
import { MergeVideosNodeData, NODE_CONFIGURATIONS, NodeType } from "../types";

function MergeVideosNode({ data, id }: NodeProps<MergeVideosNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.MergeVideos];

  const getStatusIcon = () => {
    if (data.status === "completed") {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
    if (data.status === "error") {
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
    return <Info className="w-4 h-4 text-muted-foreground" />;
  };

  const getStatusText = () => {
    switch (data.status) {
      case "completed":
        return "Completed";
      case "error":
        return "Error";
      case "running":
        return "Merging...";
      default:
        return "Ready";
    }
  };

  return (
    <Card className="w-[280px] bg-card border-border shadow-lg">
      {/* Input Handles */}
      {config.inputConnectors.map((connector, index) => (
        <Handle
          key={connector.id}
          type="target"
          position={Position.Left}
          id={connector.id}
          className="!w-3 !h-3 !bg-blue-500 !border-2 !border-background"
          style={{ top: 60 + index * 40 }}
        />
      ))}

      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Combine className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">{config.label}</span>
          </div>
          {getStatusIcon()}
        </div>

        {/* Input Labels */}
        <div className="space-y-2 mb-4">
          {config.inputConnectors.map((connector) => (
            <div
              key={connector.id}
              className="flex items-center gap-2 text-xs"
            >
              <span
                className={
                  connector.required
                    ? "text-red-400"
                    : "text-muted-foreground"
                }
              >
                {connector.label}
                {connector.required && " *"}
              </span>
            </div>
          ))}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <span>Status: {getStatusText()}</span>
        </div>

        {/* Description */}
        <div className="bg-muted rounded-lg p-3 mb-3">
          <div className="flex flex-col items-center text-center gap-2">
            <Combine className="w-6 h-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Connect 2-4 videos to merge
              <br />
              Click Run to concatenate
            </p>
          </div>
        </div>

        {/* Error display */}
        {data.status === "error" && data.error && (
          <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1 mb-3">
            {data.error}
          </div>
        )}

        {/* Action Button */}
        <Button
          variant="outline"
          className="w-full"
          disabled={data.isMerging || data.readOnly}
        >
          {data.isMerging ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Merging Videos...
            </>
          ) : (
            <>
              <Combine className="w-3 h-3 mr-1" />
              Merge Videos
            </>
          )}
        </Button>

        {/* Output Video Preview */}
        {data.outputVideoUrl && (
          <div className="mt-3">
            <video
              src={data.outputVideoUrl}
              controls
              className="w-full rounded-lg"
              style={{ maxHeight: "150px" }}
            />
          </div>
        )}

        {/* Output Label */}
        <div className="flex justify-end mt-2">
          <span className="text-xs text-muted-foreground">Video</span>
        </div>
      </CardContent>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="video"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-background"
        style={{ top: "50%" }}
      />
    </Card>
  );
}

export default memo(MergeVideosNode);
