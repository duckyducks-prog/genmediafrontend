import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Textarea } from '@/components/ui/textarea';
import { PromptInputNodeData } from '../types';
import { Type } from 'lucide-react';

function PromptInputNode({ data, id }: NodeProps<PromptInputNodeData>) {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Update will be handled by parent
    data.prompt = e.target.value;
  };

  return (
    <div className="bg-card border-2 border-border rounded-lg p-4 min-w-[280px] shadow-lg">
      {/* Node Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
        <Type className="w-4 h-4 text-primary" />
        <div className="font-semibold text-sm">{data.label || 'Prompt Input'}</div>
      </div>

      {/* Node Content */}
      <div>
        <Textarea
          defaultValue={data.prompt}
          onChange={handleChange}
          placeholder="Enter your prompt..."
          className="min-h-[100px] nodrag"
        />
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="prompt-output"
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
        style={{ top: '50%' }}
      />
    </div>
  );
}

export default memo(PromptInputNode);
