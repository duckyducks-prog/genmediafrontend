import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Workflow as WorkflowIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  listMyWorkflows,
  loadWorkflow,
  SavedWorkflow,
  WorkflowListItem,
} from "@/lib/workflow-api";

interface WorkflowLoadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadWorkflow: (workflow: SavedWorkflow) => void;
}

export default function WorkflowLoadDialog({
  open,
  onOpenChange,
  onLoadWorkflow,
}: WorkflowLoadDialogProps) {
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingWorkflowId, setLoadingWorkflowId] = useState<string | null>(
    null,
  );
  const { toast } = useToast();

  // Fetch recent workflows when dialog opens
  useEffect(() => {
    if (open) {
      fetchWorkflows();
    }
  }, [open]);

  const fetchWorkflows = useCallback(async () => {
    setIsLoading(true);
    try {
      const myWorkflows = await listMyWorkflows();
      // Sort by updated date (most recent first) and take top 50
      const sorted = myWorkflows
        .sort((a, b) => {
          const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
          const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
          return dateB - dateA;
        })
        .slice(0, 50);

      setWorkflows(sorted);
    } catch (error) {
      console.error("[WorkflowLoadDialog] Failed to fetch workflows:", error);
      toast({
        title: "Failed to load workflows",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Filter workflows based on search query
  const filteredWorkflows = useMemo(() => {
    if (!searchQuery.trim()) {
      return workflows.slice(0, 4); // Show 4 recent workflows by default
    }

    const query = searchQuery.toLowerCase();
    return workflows.filter(
      (wf) =>
        wf.name.toLowerCase().includes(query) ||
        (wf.description && wf.description.toLowerCase().includes(query)),
    );
  }, [workflows, searchQuery]);

  const handleLoadWorkflow = async (workflowId: string) => {
    try {
      setLoadingWorkflowId(workflowId);
      const fullWorkflow = await loadWorkflow(workflowId);
      onLoadWorkflow(fullWorkflow);
      onOpenChange(false);
      toast({
        title: "Workflow loaded",
        description: `"${fullWorkflow.name}" has been loaded`,
      });
    } catch (error) {
      console.error("[WorkflowLoadDialog] Failed to load workflow:", error);
      toast({
        title: "Failed to load workflow",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoadingWorkflowId(null);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Load Workflow</DialogTitle>
          <DialogDescription>
            Select a workflow to load or search by name
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search workflows by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Workflows List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredWorkflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <WorkflowIcon className="w-12 h-12 opacity-30 mb-3" />
              <p className="text-sm font-medium">
                {searchQuery.trim() ? "No workflows found" : "No workflows yet"}
              </p>
              {searchQuery.trim() && (
                <p className="text-xs mt-1">
                  Try a different search or clear the search box
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-3 max-h-96 overflow-y-auto">
              {filteredWorkflows.map((workflow) => (
                <div
                  key={workflow.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                >
                  {/* Thumbnail */}
                  <div className="h-16 w-24 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                    {workflow.thumbnail ? (
                      <img
                        src={workflow.thumbnail}
                        alt={workflow.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-accent/20">
                        <WorkflowIcon className="w-6 h-6 opacity-40" />
                      </div>
                    )}
                  </div>

                  {/* Workflow Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">
                      {workflow.name}
                    </h3>
                    {workflow.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {workflow.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(workflow.updated_at || workflow.created_at)}
                    </p>
                  </div>

                  {/* Load Button */}
                  <Button
                    onClick={() =>
                      workflow.id && handleLoadWorkflow(workflow.id)
                    }
                    disabled={loadingWorkflowId === workflow.id}
                    size="sm"
                    className="flex-shrink-0"
                  >
                    {loadingWorkflowId === workflow.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "Load"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Info text when showing recent workflows */}
          {!searchQuery.trim() && filteredWorkflows.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Showing {filteredWorkflows.length} most recent workflows. Search
              to see all.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
