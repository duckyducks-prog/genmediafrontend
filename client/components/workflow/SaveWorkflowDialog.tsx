import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  saveWorkflow,
  updateWorkflow,
  WorkflowMetadata,
} from "@/lib/workflow-api";
import { WorkflowNode, WorkflowEdge } from "./types";

interface SaveWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  existingWorkflow?: WorkflowMetadata & { id: string };
  onSaveSuccess?: (workflowId: string) => void;
}

export default function SaveWorkflowDialog({
  open,
  onOpenChange,
  nodes,
  edges,
  existingWorkflow,
  onSaveSuccess,
}: SaveWorkflowDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const { toast } = useToast();

  // Populate form when editing existing workflow
  useEffect(() => {
    if (existingWorkflow) {
      setName(existingWorkflow.name);
      setDescription(existingWorkflow.description);
      setIsPublic(existingWorkflow.is_public);
    } else {
      setName("");
      setDescription("");
      setIsPublic(false);
    }
  }, [existingWorkflow, open]);

  const handleSave = async () => {
    let hasError = false;

    // Validate name
    if (!name.trim()) {
      setNameError("Workflow name is required");
      hasError = true;
    } else {
      setNameError("");
    }

    // Validate workflow not empty
    if (nodes.length === 0) {
      setWorkflowError("Please add at least one node before saving");
      hasError = true;
    } else {
      setWorkflowError("");
    }

    if (hasError) {
      return;
    }

    setIsSaving(true);
    try {
      const workflowData = {
        name: name.trim(),
        description: description.trim(),
        is_public: isPublic,
        nodes,
        edges,
      };

      if (existingWorkflow?.id) {
        // Update existing workflow
        await updateWorkflow(existingWorkflow.id, workflowData);
        toast({
          title: "Workflow updated",
          description: `"${name}" has been updated successfully`,
        });
        onSaveSuccess?.(existingWorkflow.id);
      } else {
        // Save new workflow
        const result = await saveWorkflow(workflowData);
        toast({
          title: "Workflow saved",
          description: `"${name}" has been saved successfully`,
        });
        onSaveSuccess?.(result.id);
      }

      onOpenChange(false);
    } catch (error) {
      console.error("Error saving workflow:", error);
      toast({
        title: "Failed to save workflow",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {existingWorkflow ? "Update Workflow" : "Save Workflow"}
          </DialogTitle>
          <DialogDescription>
            {existingWorkflow
              ? "Update the details of your workflow"
              : "Give your workflow a name and description"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="workflow-name">Name *</Label>
            <Input
              id="workflow-name"
              placeholder="My awesome workflow"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim() !== "") {
                  setNameError("");
                }
              }}
              disabled={isSaving}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "name-error" : undefined}
              className={nameError ? "border-red-500 focus-visible:ring-red-500" : ""}
            />
            {nameError && (
              <p id="name-error" className="text-sm text-red-500">
                {nameError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="workflow-description">Description</Label>
            <Textarea
              id="workflow-description"
              placeholder="Describe what this workflow does..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSaving}
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="workflow-public">Share as template</Label>
              <p className="text-sm text-muted-foreground">
                Make this workflow available to all users
              </p>
            </div>
            <Switch
              id="workflow-public"
              checked={isPublic}
              onCheckedChange={setIsPublic}
              disabled={isSaving}
            />
          </div>

          <div className={`rounded-lg p-3 text-sm ${workflowError ? "bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-800/50 dark:text-red-400" : "bg-muted/50 text-muted-foreground"}`}>
            <p>
              <strong>Workflow info:</strong>
            </p>
            <p>• {nodes.length} nodes</p>
            <p>• {edges.length} connections</p>
            {workflowError && (
              <p className="mt-2 text-sm font-medium">{workflowError}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !!nameError || nodes.length === 0}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {existingWorkflow ? "Update" : "Save"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
