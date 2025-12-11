import { Type, Image, Video, Sparkles, Download, Upload } from 'lucide-react';
import { NodeType } from './types';

interface PaletteNode {
  type: NodeType;
  label: string;
  icon: React.ReactNode;
  category: 'input' | 'action' | 'output';
  description: string;
}

const paletteNodes: PaletteNode[] = [
  {
    type: NodeType.PromptInput,
    label: 'Prompt Input',
    icon: <Type className="w-4 h-4" />,
    category: 'input',
    description: 'Text prompt for generation',
  },
  {
    type: NodeType.ImageUpload,
    label: 'Image Upload',
    icon: <Upload className="w-4 h-4" />,
    category: 'input',
    description: 'Upload reference image',
  },
  {
    type: NodeType.GenerateImage,
    label: 'Generate Image',
    icon: <Image className="w-4 h-4" />,
    category: 'action',
    description: 'Create AI image',
  },
  {
    type: NodeType.GenerateVideo,
    label: 'Generate Video',
    icon: <Video className="w-4 h-4" />,
    category: 'action',
    description: 'Create AI video',
  },
  {
    type: NodeType.ImageOutput,
    label: 'Image Output',
    icon: <Image className="w-4 h-4" />,
    category: 'output',
    description: 'Display generated image',
  },
  {
    type: NodeType.VideoOutput,
    label: 'Video Output',
    icon: <Video className="w-4 h-4" />,
    category: 'output',
    description: 'Display generated video',
  },
  {
    type: NodeType.Download,
    label: 'Download',
    icon: <Download className="w-4 h-4" />,
    category: 'output',
    description: 'Download result',
  },
];

interface NodePaletteProps {
  onAddNode: (type: NodeType) => void;
}

export default function NodePalette({ onAddNode }: NodePaletteProps) {
  const categories = {
    input: paletteNodes.filter((n) => n.category === 'input'),
    action: paletteNodes.filter((n) => n.category === 'action'),
    output: paletteNodes.filter((n) => n.category === 'output'),
  };

  const handleDragStart = (event: React.DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-64 bg-card border-r border-border p-4 space-y-6 overflow-y-auto">
      <div>
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Node Library
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Drag nodes onto the canvas to build your workflow
        </p>
      </div>

      {/* Input Nodes */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">
          Inputs
        </h4>
        <div className="space-y-2">
          {categories.input.map((node) => (
            <button
              key={node.type}
              draggable
              onDragStart={(e) => handleDragStart(e, node.type)}
              onClick={() => onAddNode(node.type)}
              className="w-full flex items-start gap-2 p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border transition-colors cursor-grab active:cursor-grabbing"
            >
              <div className="text-primary mt-0.5">{node.icon}</div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium">{node.label}</div>
                <div className="text-xs text-muted-foreground">{node.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Action Nodes */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">
          Actions
        </h4>
        <div className="space-y-2">
          {categories.action.map((node) => (
            <button
              key={node.type}
              draggable
              onDragStart={(e) => handleDragStart(e, node.type)}
              onClick={() => onAddNode(node.type)}
              className="w-full flex items-start gap-2 p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border transition-colors cursor-grab active:cursor-grabbing"
            >
              <div className="text-primary mt-0.5">{node.icon}</div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium">{node.label}</div>
                <div className="text-xs text-muted-foreground">{node.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Output Nodes */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">
          Outputs
        </h4>
        <div className="space-y-2">
          {categories.output.map((node) => (
            <button
              key={node.type}
              draggable
              onDragStart={(e) => handleDragStart(e, node.type)}
              onClick={() => onAddNode(node.type)}
              className="w-full flex items-start gap-2 p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border transition-colors cursor-grab active:cursor-grabbing"
            >
              <div className="text-primary mt-0.5">{node.icon}</div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium">{node.label}</div>
                <div className="text-xs text-muted-foreground">{node.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
