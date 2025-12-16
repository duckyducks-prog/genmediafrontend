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
import { Badge } from "@/components/ui/badge";
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
  }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
      <div
        className="group relative cursor-pointer rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => onLoadWorkflow(workflow)}
      >
        {/* Thumbnail Image */}
        <div className="relative aspect-video bg-muted">
          {workflow.thumbnail ? (
            <img
              src={workflow.thumbnail}
              alt={workflow.name}
              className="w-full h-full object-cover"
            />
          ) : (workflow as any).background_image && workflow.is_public ? (
            // Use custom background image for templates
            <img
              src={(workflow as any).background_image}
              alt={workflow.name}
              className="w-full h-full object-cover"
            />
          ) : (
            // Placeholder when no thumbnail or background
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted via-muted to-accent/20">
              {workflow.is_public ? (
                <img
                  src="https://cdn.builder.io/api/v1/image/assets%2Fb1d3bf7cc0eb4f0daca65fdc5a7d5179%2F3ea4f6b35eec42ab9cd2e7b29661cc88?format=webp&width=800"
                  alt="Template icon"
                  className="w-24 h-24 object-contain"
                />
              ) : (
                <WorkflowIcon className="w-16 h-16 opacity-30" />
              )}
            </div>
          )}

          {/* Dark gradient overlay at bottom for title */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Template badge (top-right) */}
          {workflow.is_public && (
            <div className="absolute top-2 right-2 z-10">
              <Badge variant="secondary" className="flex items-center gap-1 shadow-lg">
                <Lock className="w-3 h-3" />
                Template
              </Badge>
            </div>
          )}

          {/* Action buttons overlay - always visible for templates */}
          {workflow.is_public ? (
            <div
              className="absolute inset-0 flex items-center justify-center gap-2"
              style={{ zIndex: 5 }}
            >
              <Button
                size="lg"
                onClick={(e) => {
                  e.stopPropagation();
                  onLoadWorkflow(workflow);
                }}
                className="shadow-lg"
              >
                <WorkflowIcon className="w-4 h-4 mr-2" />
                Open
              </Button>

              {showClone && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClone(workflow);
                  }}
                  className="shadow-lg bg-background"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Clone
                </Button>
              )}
            </div>
          ) : (
            <div
              className={`absolute inset-0 bg-black/60 flex items-center justify-center gap-2 transition-opacity ${
                isHovered ? "opacity-100" : "opacity-0"
              }`}
              style={{ zIndex: 5 }}
            >
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onLoadWorkflow(workflow);
                }}
                className="shadow-lg"
              >
                <WorkflowIcon className="w-4 h-4 mr-1" />
                Open
              </Button>

              {showDelete && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteId(workflow.id!);
                  }}
                  className="shadow-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}

          {/* Title at bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
            <h3 className="font-semibold text-white text-lg drop-shadow-lg line-clamp-2">
              {workflow.name}
            </h3>
            <p className="text-xs text-white/80 mt-1">
              {workflow.nodes?.length || 0} nodes
            </p>
          </div>
        </div>
      </div>
    );
  };

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
