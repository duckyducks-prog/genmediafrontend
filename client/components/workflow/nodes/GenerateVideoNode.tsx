import { memo, useState } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { Button } from '@/components/ui/button';
import { GenerateVideoNodeData } from '../types';
import { Sparkles, Loader2, Video as VideoIcon } from 'lucide-react';

function GenerateVideoNode({ data, id }: NodeProps<GenerateVideoNodeData>) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('Ready');
  const { getNode, getEdges, setNodes } = useReactFlow();

  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      setStatus('Gathering inputs...');

      // Get connected edges to find input data
      const edges = getEdges();
      const incomingEdges = edges.filter((edge) => edge.target === id);

      let promptInput = '';
      let firstFrameInput = null;
      let lastFrameInput = null;

      // Extract data from connected nodes
      for (const edge of incomingEdges) {
        const sourceNode = getNode(edge.source);
        if (sourceNode) {
          const nodeData = sourceNode.data as any;
          
          // Check if it's a prompt input
          if (edge.sourceHandle === 'prompt-output') {
            promptInput = nodeData.prompt || '';
          }
          // Check if it's first frame
          if (edge.targetHandle === 'first-frame-input') {
            firstFrameInput = nodeData.imageUrl || null;
          }
          // Check if it's last frame
          if (edge.targetHandle === 'last-frame-input') {
            lastFrameInput = nodeData.imageUrl || null;
          }
        }
      }

      if (!promptInput.trim()) {
        setStatus('Error: No prompt provided');
        setIsGenerating(false);
        return;
      }

      setStatus('Generating video...');

      // Call the video generation API
      const response = await fetch('https://veo-api-82187245577.us-central1.run.app/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptInput }),
      });

      const apiData = await response.json();
      
      // Note: Video generation is async, so we get an operation name
      if (apiData.operation_name) {
        setStatus(`Started: ${apiData.operation_name}`);
        
        // Update this node's data
        setNodes((nodes) =>
          nodes.map((node) =>
            node.id === id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    promptInput,
                    firstFrameInput,
                    lastFrameInput,
                    operationName: apiData.operation_name,
                  },
                }
              : node
          )
        );
      } else {
        setStatus('Error: No operation started');
      }
    } catch (error) {
      console.error('Error generating video:', error);
      setStatus('Error: Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-card border-2 border-primary/50 rounded-lg p-4 min-w-[240px] shadow-lg">
      {/* Node Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
        <VideoIcon className="w-4 h-4 text-primary" />
        <div className="font-semibold text-sm">Generate Video</div>
      </div>

      {/* Input Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="prompt-input"
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
        style={{ top: '25%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="first-frame-input"
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
        style={{ top: '50%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="last-frame-input"
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
        style={{ top: '75%' }}
      />

      {/* Node Content */}
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">
          Status: <span className="font-medium">{status}</span>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full"
          size="sm"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3" />
              Generate
            </>
          )}
        </Button>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="video-output"
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
        style={{ top: '50%' }}
      />
    </div>
  );
}

export default memo(GenerateVideoNode);
