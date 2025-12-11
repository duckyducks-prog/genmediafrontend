import { memo, useState } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { Button } from '@/components/ui/button';
import { GenerateImageNodeData } from '../types';
import { Sparkles, Loader2, Image as ImageIcon } from 'lucide-react';

function GenerateImageNode({ data, id }: NodeProps<GenerateImageNodeData>) {
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
      let referenceImageInput = null;

      // Extract data from connected nodes
      for (const edge of incomingEdges) {
        const sourceNode = getNode(edge.source);
        if (sourceNode) {
          // Check if it's a prompt input
          if (edge.sourceHandle === 'prompt-output') {
            promptInput = (sourceNode.data as any).prompt || '';
          }
          // Check if it's a reference image
          if (edge.sourceHandle === 'image-output') {
            referenceImageInput = (sourceNode.data as any).imageUrl || null;
          }
        }
      }

      if (!promptInput.trim()) {
        setStatus('Error: No prompt provided');
        setIsGenerating(false);
        return;
      }

      setStatus('Generating image...');

      // Call the image generation API
      const response = await fetch('https://veo-api-82187245577.us-central1.run.app/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptInput }),
      });

      const apiData = await response.json();
      
      if (apiData.images && apiData.images[0]) {
        const imageResult = `data:image/png;base64,${apiData.images[0]}`;
        
        // Update this node's data with the result
        setNodes((nodes) =>
          nodes.map((node) =>
            node.id === id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    promptInput,
                    referenceImageInput,
                    result: imageResult,
                  },
                }
              : node
          )
        );

        setStatus('Success!');
      } else {
        setStatus('Error: No image generated');
      }
    } catch (error) {
      console.error('Error generating image:', error);
      setStatus('Error: Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-card border-2 border-primary/50 rounded-lg p-4 min-w-[240px] shadow-lg">
      {/* Node Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
        <ImageIcon className="w-4 h-4 text-primary" />
        <div className="font-semibold text-sm">Generate Image</div>
      </div>

      {/* Input Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="prompt-input"
        className="!w-3 !h-3 !bg-primary !border-2 !border-background !top-[30%]"
        style={{ top: '30%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="reference-input"
        className="!w-3 !h-3 !bg-accent !border-2 !border-background !top-[70%]"
        style={{ top: '70%' }}
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
        id="image-output"
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
        style={{ top: '50%' }}
      />
    </div>
  );
}

export default memo(GenerateImageNode);
