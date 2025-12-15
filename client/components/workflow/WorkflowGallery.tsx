import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Copy,
  Trash2,
  Loader2,
  RefreshCw,
  Workflow as WorkflowIcon,
  Globe,
  Lock,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  listMyWorkflows,
  listPublicWorkflows,
  deleteWorkflow,
  cloneWorkflow,
  SavedWorkflow,
  testWorkflowAPI,
  APITestResult,
} from "@/lib/workflow-api";
import { MOCK_WORKFLOW_TEMPLATES } from "@/lib/mock-workflows";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface WorkflowGalleryProps {
  onLoadWorkflow: (workflow: SavedWorkflow) => void;
}

export default function WorkflowGallery({
  onLoadWorkflow,
}: WorkflowGalleryProps) {
  const [myWorkflows, setMyWorkflows] = useState<SavedWorkflow[]>([]);
  const [publicWorkflows, setPublicWorkflows] = useState<SavedWorkflow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<APITestResult | null>(null);
  const [showApiTest, setShowApiTest] = useState(false);
  const { toast } = useToast();

  const fetchWorkflows = useCallback(async () => {
    setIsLoading(true);
    try {
      const [myWf, publicWf] = await Promise.all([
        listMyWorkflows().catch((err) => {
          console.error('[WorkflowGallery] Failed to fetch my workflows:', err);
          return [];
        }),
        listPublicWorkflows().catch((err) => {
          console.error('[WorkflowGallery] Failed to fetch public workflows:', err);
          return [];
        }),
      ]);

      setMyWorkflows(myWf);

      // Use mock templates as fallback when API is not available
      if (publicWf.length === 0) {
        console.log(
          "[WorkflowGallery] Using mock templates (API not available)",
        );
        setPublicWorkflows(MOCK_WORKFLOW_TEMPLATES);
        setShowApiTest(true);
      } else {
        setPublicWorkflows(publicWf);
        setShowApiTest(false);
      }
    } catch (error) {
      console.error("Error fetching workflows:", error);
      // Use mock templates on error
      setPublicWorkflows(MOCK_WORKFLOW_TEMPLATES);
      setShowApiTest(true);
      toast({
        title: "Using example templates",
        description:
          "Backend workflow API is not available. Showing example templates.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Test API connectivity on mount
  useEffect(() => {
    const testAPI = async () => {
      const result = await testWorkflowAPI();
      setApiStatus(result);

      if (!result.available) {
        console.warn('[WorkflowGallery] API Status:', result);
        setShowApiTest(true);
      }
    };

    testAPI();
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const handleDelete = async (id: string) => {
    try {
      await deleteWorkflow(id);
      setMyWorkflows(myWorkflows.filter((wf) => wf.id !== id));
      toast({
        title: "Workflow deleted",
        description: "The workflow has been removed",
      });
    } catch (error) {
      console.error("Error deleting workflow:", error);
      toast({
        title: "Failed to delete workflow",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeleteId(null);
    }
  };

  const handleClone = async (workflow: SavedWorkflow) => {
    try {
      const result = await cloneWorkflow(workflow.id!);
      toast({
        title: "Workflow cloned",
        description: `"${workflow.name}" has been added to your workflows`,
      });
      // Refresh to show the cloned workflow
      fetchWorkflows();
    } catch (error) {
      console.error("Error cloning workflow:", error);
      toast({
        title: "Failed to clone workflow",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const WorkflowCard = ({
    workflow,
    showDelete = false,
    showClone = false,
  }: {
    workflow: SavedWorkflow;
    showDelete?: boolean;
    showClone?: boolean;
  }) => (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              {workflow.name}
              {workflow.is_public ? (
                <Globe
                  className="w-4 h-4 text-primary"
                  title="Public template"
                />
              ) : (
                <Lock
                  className="w-4 h-4 text-muted-foreground"
                  title="Private"
                />
              )}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {workflow.description}
            </p>
          </div>
        </div>
      </CardHeader>

      {workflow.thumbnail && (
        <CardContent className="px-6 py-0">
          <div className="relative aspect-video bg-muted rounded-lg overflow-hidden border border-border">
            <img
              src={workflow.thumbnail}
              alt={workflow.name}
              className="w-full h-full object-cover"
            />
          </div>
        </CardContent>
      )}

      <CardFooter className="flex items-center justify-between pt-4">
        <div className="text-xs text-muted-foreground">
          {workflow.user_email && (
            <span className="block">By {workflow.user_email}</span>
          )}
          {workflow.created_at && (
            <span className="block">
              Created {formatDate(workflow.created_at)}
            </span>
          )}
          <span className="block">
            {workflow.nodes?.length || 0} nodes, {workflow.edges?.length || 0}{" "}
            connections
          </span>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => onLoadWorkflow(workflow)}
            variant="default"
          >
            <WorkflowIcon className="w-4 h-4 mr-1" />
            Open
          </Button>

          {showClone && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleClone(workflow)}
            >
              <Copy className="w-4 h-4" />
            </Button>
          )}

          {showDelete && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDeleteId(workflow.id!)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Workflows</h2>
          <p className="text-muted-foreground">
            Browse templates or manage your saved workflows
          </p>
        </div>
        <Button onClick={fetchWorkflows} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {showApiTest && apiStatus && !apiStatus.available && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Workflow API Unavailable</AlertTitle>
          <AlertDescription>
            Cannot connect to the backend API. You won't be able to save or load your own workflows.
            {apiStatus.details && (
              <span className="block mt-1 text-sm">
                <strong>Details:</strong> {apiStatus.details}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={async () => {
                const result = await testWorkflowAPI();
                setApiStatus(result);
                if (result.available) {
                  setShowApiTest(false);
                  fetchWorkflows();
                  toast({
                    title: "Connection restored",
                    description: "Workflow API is now accessible",
                  });
                } else {
                  toast({
                    title: "Still unavailable",
                    description: result.details || result.error || "Cannot reach API",
                    variant: "destructive",
                  });
                }
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry Connection
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="templates" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="templates">
            Workflow Templates
            {publicWorkflows.length > 0 && (
              <span className="ml-2 text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {publicWorkflows.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="my">
            My Workflows
            {myWorkflows.length > 0 && (
              <span className="ml-2 text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {myWorkflows.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-6">
          {publicWorkflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <WorkflowIcon className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">No workflow templates yet</p>
              <p className="text-sm">
                Check back later for community templates
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {publicWorkflows.map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  showClone={true}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="my" className="mt-6">
          {myWorkflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <WorkflowIcon className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">No workflows yet</p>
              <p className="text-sm">Create your first workflow and save it</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myWorkflows.map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  showDelete={true}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              workflow.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
