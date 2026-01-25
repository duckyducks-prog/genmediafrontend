import { memo, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "reactflow";
import { Textarea } from "@/components/ui/textarea";
import { MusicPromptNodeData } from "../types";
import { Music, CheckCircle2, Loader2 } from "lucide-react";

function MusicPromptNode({ data, id }: NodeProps<MusicPromptNodeData>) {
  const { setNodes } = useReactFlow();

  // Initialize outputs when component mounts or musicPrompt changes externally
  useEffect(() => {
    if (data.musicPrompt && (!data.outputs || data.outputs.music_prompt !== data.musicPrompt)) {
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  outputs: { music_prompt: data.musicPrompt },
                },
              }
            : node,
        ),
      );
    }
  }, [id, data.musicPrompt, data.outputs, setNodes]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Block changes in read-only mode
    if (data.readOnly) return;

    const newMusicPrompt = e.target.value;
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                musicPrompt: newMusicPrompt,
                outputs: { music_prompt: newMusicPrompt },
              },
            }
          : node,
      ),
    );
  };

  const status = (data as any).status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";

  const getBorderColor = () => {
    return "border-border";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Music Prompt"}
          </div>
        </div>
        {isExecuting && (
          <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
        )}
        {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
      </div>

      {/* Node Content */}
      <div>
        <Textarea
          defaultValue={data.musicPrompt}
          onChange={handleChange}
          placeholder="Describe the background music...&#10;&#10;e.g., Upbeat electronic music with a driving beat, synth melodies, and energetic drums. Modern and cinematic."
          className="min-h-[100px] nodrag"
          disabled={data.readOnly}
        />
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="music_prompt"
        data-connector-type="text"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: 'translateY(-50%)' }}
      />
    </div>
  );
}

export default memo(MusicPromptNode);
