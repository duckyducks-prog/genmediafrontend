import { Type, Image, Sparkles, Settings, Combine, Brain, Upload, Video, Download, Eye, Sun, Blend, Focus, Palette, Radio, Circle, Crop } from "lucide-react";
import { NodeType, NODE_CONFIGURATIONS } from "./types";

interface PaletteNode {
  type: NodeType;
  label: string;
  icon: React.ReactNode;
  category: "input" | "modifier" | "action" | "output";
  description: string;
}

const paletteNodes: PaletteNode[] = [
  // INPUT NODES
  {
    type: NodeType.ImageInput,
    label: "Image Input",
    icon: <Upload className="w-4 h-4" />,
    category: "input",
    description: "Upload or load an image",
  },
  {
    type: NodeType.Prompt,
    label: "Prompt",
    icon: <Type className="w-4 h-4" />,
    category: "input",
    description: "Text input for AI generation",
  },

  // MODIFIER NODES
  {
    type: NodeType.PromptConcatenator,
    label: "Prompt Concatenator",
    icon: <Combine className="w-4 h-4" />,
    category: "modifier",
    description: "Combine multiple prompts",
  },
  {
    type: NodeType.BrightnessContrast,
    label: "Brightness/Contrast",
    icon: <Sun className="w-4 h-4" />,
    category: "modifier",
    description: "Adjust brightness and contrast",
  },
  {
    type: NodeType.Blur,
    label: "Blur",
    icon: <Blend className="w-4 h-4" />,
    category: "modifier",
    description: "Add blur effect to images",
  },
  {
    type: NodeType.Sharpen,
    label: "Sharpen",
    icon: <Focus className="w-4 h-4" />,
    category: "modifier",
    description: "Sharpen image details",
  },
  {
    type: NodeType.HueSaturation,
    label: "Hue/Saturation",
    icon: <Palette className="w-4 h-4" />,
    category: "modifier",
    description: "Adjust hue and saturation",
  },
  {
    type: NodeType.Noise,
    label: "Noise",
    icon: <Radio className="w-4 h-4" />,
    category: "modifier",
    description: "Add noise texture",
  },
  {
    type: NodeType.Vignette,
    label: "Vignette",
    icon: <Circle className="w-4 h-4" />,
    category: "modifier",
    description: "Add vignette effect",
  },
  {
    type: NodeType.Crop,
    label: "Crop",
    icon: <Crop className="w-4 h-4" />,
    category: "modifier",
    description: "Crop image to aspect ratio",
  },

  // ACTION NODES
  {
    type: NodeType.GenerateImage,
    label: "Generate Image",
    icon: <Image className="w-4 h-4" />,
    category: "action",
    description: "Create AI image with Gemini 3",
  },
  {
    type: NodeType.GenerateVideo,
    label: "Generate Video",
    icon: <Video className="w-4 h-4" />,
    category: "action",
    description: "Create AI video with Veo 3.1",
  },
  {
    type: NodeType.LLM,
    label: "LLM",
    icon: <Brain className="w-4 h-4" />,
    category: "action",
    description: "Text generation and enhancement",
  },
  {
    type: NodeType.Preview,
    label: "Preview",
    icon: <Eye className="w-4 h-4" />,
    category: "action",
    description: "Preview images, videos, or text",
  },
  {
    type: NodeType.Download,
    label: "Download",
    icon: <Download className="w-4 h-4" />,
    category: "action",
    description: "Download media result",
  },
];

interface NodePaletteProps {
  onAddNode: (type: NodeType) => void;
}

export default function NodePalette({ onAddNode }: NodePaletteProps) {
  const categories = {
    input: paletteNodes.filter((n) => n.category === "input"),
    modifier: paletteNodes.filter((n) => n.category === "modifier"),
    action: paletteNodes.filter((n) => n.category === "action"),
  };

  const handleDragStart = (event: React.DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-64 bg-card border-r border-border p-4 space-y-6 overflow-y-auto h-full">
      <div>
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Node Library
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Drag nodes onto the canvas to build your AI workflow
        </p>
      </div>

      {/* Input Nodes */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2 tracking-wide">
          Inputs
        </h4>
        <p className="text-xs text-muted-foreground/70 mb-3">Source nodes with only outputs</p>
        <div className="space-y-2">
          {categories.input.map((node) => (
            <button
              key={node.type}
              draggable
              onDragStart={(e) => handleDragStart(e, node.type)}
              onClick={() => onAddNode(node.type)}
              className="w-full flex items-start gap-2 p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border transition-colors cursor-grab active:cursor-grabbing group"
            >
              <div className="text-primary mt-0.5 group-hover:scale-110 transition-transform">{node.icon}</div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium">{node.label}</div>
                <div className="text-xs text-muted-foreground">
                  {node.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Modifier Nodes */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2 tracking-wide">
          Modifiers
        </h4>
        <p className="text-xs text-muted-foreground/70 mb-3">Transform and configure data</p>
        <div className="space-y-2">
          {categories.modifier.map((node) => (
            <button
              key={node.type}
              draggable
              onDragStart={(e) => handleDragStart(e, node.type)}
              onClick={() => onAddNode(node.type)}
              className="w-full flex items-start gap-2 p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border transition-colors cursor-grab active:cursor-grabbing group"
            >
              <div className="text-primary mt-0.5 group-hover:scale-110 transition-transform">{node.icon}</div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium">{node.label}</div>
                <div className="text-xs text-muted-foreground">
                  {node.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Action Nodes */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2 tracking-wide">
          Actions
        </h4>
        <p className="text-xs text-muted-foreground/70 mb-3">Execute AI operations</p>
        <div className="space-y-2">
          {categories.action.map((node) => (
            <button
              key={node.type}
              draggable
              onDragStart={(e) => handleDragStart(e, node.type)}
              onClick={() => onAddNode(node.type)}
              className="w-full flex items-start gap-2 p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border transition-colors cursor-grab active:cursor-grabbing group"
            >
              <div className="text-primary mt-0.5 group-hover:scale-110 transition-transform">{node.icon}</div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium">{node.label}</div>
                <div className="text-xs text-muted-foreground">
                  {node.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
