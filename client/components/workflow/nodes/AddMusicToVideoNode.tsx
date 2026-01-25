"use client";

import { memo, useCallback } from "react";
import { NodeProps, Handle, Position } from "reactflow";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Music,
  CheckCircle,
  AlertCircle,
  Info,
  Volume2,
} from "lucide-react";
import {
  AddMusicToVideoNodeData,
  NODE_CONFIGURATIONS,
  NodeType,
} from "../types";

function AddMusicToVideoNode({ data, id }: NodeProps<AddMusicToVideoNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.AddMusicToVideo];

  const handleUpdate = (field: keyof AddMusicToVideoNodeData, value: any) => {
    if (data.readOnly) return;

    const event = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          [field]: value,
        },
      },
    });
    window.dispatchEvent(event);
  };

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
        return "Mixing...";
      default:
        return "Ready";
    }
  };

  return (
    <Card className="w-[280px] bg-card border-border shadow-lg">
      {/* Input Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="video"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-background"
        style={{ top: 60 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="audio"
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-background"
        style={{ top: 100 }}
      />

      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">{config.label}</span>
          </div>
          {getStatusIcon()}
        </div>

        {/* Input Labels */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-red-400">Video *</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-red-400">Audio *</span>
          </div>
        </div>

        {/* Volume Controls */}
        <div className="space-y-4 mb-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1">
                <Volume2 className="w-3 h-3" />
                Music Volume
              </Label>
              <span className="text-xs text-muted-foreground">
                {data.musicVolume ?? 50}%
              </span>
            </div>
            <Slider
              value={[data.musicVolume ?? 50]}
              onValueChange={([value]) => handleUpdate("musicVolume", value)}
              min={0}
              max={100}
              step={5}
              disabled={data.readOnly}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1">
                <Volume2 className="w-3 h-3" />
                Original Audio
              </Label>
              <span className="text-xs text-muted-foreground">
                {data.originalVolume ?? 100}%
              </span>
            </div>
            <Slider
              value={[data.originalVolume ?? 100]}
              onValueChange={([value]) => handleUpdate("originalVolume", value)}
              min={0}
              max={100}
              step={5}
              disabled={data.readOnly}
              className="w-full"
            />
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <span>Status: {getStatusText()}</span>
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
          disabled={data.isMixing || data.readOnly}
        >
          {data.isMixing ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Adding Music...
            </>
          ) : (
            <>
              <Music className="w-3 h-3 mr-1" />
              Add Music
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

export default memo(AddMusicToVideoNode);
