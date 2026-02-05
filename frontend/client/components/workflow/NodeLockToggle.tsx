import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NodeLockToggleProps {
  locked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function NodeLockToggle({ locked, onToggle, disabled }: NodeLockToggleProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 opacity-60 hover:opacity-100 transition-opacity"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onMouseDown={(e) => {
        // Prevent drag from starting when clicking the lock button
        e.stopPropagation();
      }}
      title={locked ? "Unlock node (allow dragging)" : "Lock node (prevent dragging)"}
      disabled={disabled}
    >
      {locked ? (
        <Lock className="w-3.5 h-3.5 text-orange-500" />
      ) : (
        <LockOpen className="w-3.5 h-3.5" />
      )}
    </Button>
  );
}
