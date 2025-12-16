import { Button } from "@/components/ui/button";
import {
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Play,
  RotateCcw,
  Save,
  FolderOpen,
} from "lucide-react";
import { useReactFlow } from "reactflow";

interface WorkflowToolbarProps {
  onClearCanvas: () => void;
  onExecuteWorkflow: () => void;
  onResetWorkflow: () => void;
  onSaveWorkflow: () => void;
  onLoadWorkflow: () => void;
  isExecuting: boolean;
  executionProgress?: Map<string, string>;
  totalNodes?: number;
  isReadOnly?: boolean;
}

export default function WorkflowToolbar({
  onClearCanvas,
  onExecuteWorkflow,
  onResetWorkflow,
  onSaveWorkflow,
  onLoadWorkflow,
  isExecuting,
  executionProgress,
  totalNodes,
  isReadOnly = false,
}: WorkflowToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  // Calculate execution progress percentage
  const calculateProgress = () => {
    if (!executionProgress || !totalNodes || totalNodes === 0) {
      return 0;
    }

    const completed = Array.from(executionProgress.values()).filter(
      (status) => status === "completed" || status === "error"
    ).length;

    return Math.round((completed / totalNodes) * 100);
  };

  const progressPercentage = calculateProgress();

  return (
    <div className="absolute top-4 right-4 flex items-center gap-2 bg-card border border-border rounded-lg p-2 shadow-lg z-10">
      <Button
        onClick={onSaveWorkflow}
        variant="default"
        size="sm"
        title={isReadOnly ? "Read-Only Template" : "Save Workflow"}
        disabled={isReadOnly}
      >
        <Save className="w-4 h-4 mr-1" />
        Save
      </Button>

      <Button
        onClick={onLoadWorkflow}
        variant="outline"
        size="sm"
        title="Load Workflow"
        aria-label="Load Workflow"
      >
        <FolderOpen className="w-4 h-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <Button
        onClick={onExecuteWorkflow}
        disabled={isExecuting}
        variant="default"
        size="sm"
        title="Run All Nodes"
        className="bg-[#F3C5DB] hover:bg-[#D6C2D9] text-[#46062B]"
      >
        <Play className="w-4 h-4 mr-1" />
        {isExecuting ? `Running... ${progressPercentage}%` : "Run All"}
      </Button>

      <Button
        onClick={onResetWorkflow}
        disabled={isExecuting || isReadOnly}
        variant="ghost"
        size="sm"
        title={isReadOnly ? "Read-Only Template" : "Reset Workflow"}
        aria-label="Reset Workflow"
      >
        <RotateCcw className="w-4 h-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <Button
        onClick={() => zoomIn()}
        variant="ghost"
        size="sm"
        title="Zoom In"
        aria-label="Zoom In"
      >
        <ZoomIn className="w-4 h-4" />
      </Button>

      <Button
        onClick={() => zoomOut()}
        variant="ghost"
        size="sm"
        title="Zoom Out"
        aria-label="Zoom Out"
      >
        <ZoomOut className="w-4 h-4" />
      </Button>

      <Button
        onClick={() => fitView()}
        variant="ghost"
        size="sm"
        title="Fit View"
        aria-label="Fit View"
      >
        <Maximize2 className="w-4 h-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <Button
        onClick={onClearCanvas}
        variant="ghost"
        size="sm"
        title={isReadOnly ? "Read-Only Template" : "Clear Canvas"}
        aria-label="Clear Canvas"
        disabled={isReadOnly}
      >
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );
}
