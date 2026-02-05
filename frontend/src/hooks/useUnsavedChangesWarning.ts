import { useEffect } from "react";
import { useWorkflow } from "@/contexts/WorkflowContext";

/**
 * Hook to warn users before navigating away with unsaved changes
 * Shows browser confirmation dialog if there are unsaved changes
 */
export function useUnsavedChangesWarning() {
  const { state } = useWorkflow();

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (state.isDirty) {
        e.preventDefault();
        e.returnValue = ""; // Required for Chrome
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [state.isDirty]);
}
