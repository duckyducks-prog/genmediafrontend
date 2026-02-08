import { Button } from "@/components/ui/button";
import { Play, Loader2 } from "lucide-react";

interface RunNodeButtonProps {
  nodeId: string;
  isExecuting?: boolean;
  disabled?: boolean;
  label?: string;
  loadingLabel?: string;
}

export function RunNodeButton({
  nodeId,
  isExecuting = false,
  disabled = false,
  label = "Run Node",
  loadingLabel = "Running...",
}: RunNodeButtonProps) {
  const handleClick = () => {
    const event = new CustomEvent("node-execute", {
      detail: { nodeId },
    });
    window.dispatchEvent(event);
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isExecuting || disabled}
      variant="ghost"
      size="sm"
      className="w-full text-xs mt-2"
    >
      {isExecuting ? (
        <>
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          {loadingLabel}
        </>
      ) : (
        <>
          <Play className="w-3 h-3 mr-1" />
          {label}
        </>
      )}
    </Button>
  );
}
