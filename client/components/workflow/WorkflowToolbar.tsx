import { Button } from '@/components/ui/button';
import { Trash2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useReactFlow } from 'reactflow';

interface WorkflowToolbarProps {
  onClearCanvas: () => void;
}

export default function WorkflowToolbar({ onClearCanvas }: WorkflowToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="absolute top-4 right-4 flex items-center gap-2 bg-card border border-border rounded-lg p-2 shadow-lg z-10">
      <Button
        onClick={() => zoomIn()}
        variant="ghost"
        size="sm"
        title="Zoom In"
      >
        <ZoomIn className="w-4 h-4" />
      </Button>

      <Button
        onClick={() => zoomOut()}
        variant="ghost"
        size="sm"
        title="Zoom Out"
      >
        <ZoomOut className="w-4 h-4" />
      </Button>

      <Button
        onClick={() => fitView()}
        variant="ghost"
        size="sm"
        title="Fit View"
      >
        <Maximize2 className="w-4 h-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <Button
        onClick={onClearCanvas}
        variant="ghost"
        size="sm"
        title="Clear Canvas"
      >
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );
}
