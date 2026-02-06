/**
 * React Query hooks for workflow operations
 *
 * Provides caching, background refresh, and optimistic updates for:
 * - Workflow lists (my workflows, public templates)
 * - Individual workflow loading
 * - Save/update/delete mutations with cache invalidation
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
} from "@tanstack/react-query";
import {
  listMyWorkflows,
  listPublicWorkflows,
  loadWorkflow,
  saveWorkflow,
  updateWorkflow,
  deleteWorkflow,
  cloneWorkflow,
  SavedWorkflow,
  WorkflowListItem,
} from "./workflow-api";
import { useAuth } from "./AuthContext";
import { isApiError } from "./api-error";
import { logger } from "./logger";
import { toast } from "sonner";

// Query keys for cache management
export const workflowKeys = {
  all: ["workflows"] as const,
  lists: () => [...workflowKeys.all, "list"] as const,
  myList: () => [...workflowKeys.lists(), "my"] as const,
  publicList: () => [...workflowKeys.lists(), "public"] as const,
  details: () => [...workflowKeys.all, "detail"] as const,
  detail: (id: string) => [...workflowKeys.details(), id] as const,
};

/**
 * Hook to fetch user's workflows with caching
 *
 * - Caches for 5 minutes (staleTime)
 * - Background refresh when window refocuses
 * - Automatically refetches when user changes
 */
export function useMyWorkflows(
  options?: Omit<
    UseQueryOptions<WorkflowListItem[], Error>,
    "queryKey" | "queryFn"
  >
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: workflowKeys.myList(),
    queryFn: listMyWorkflows,
    enabled: !!user, // Only fetch when authenticated
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    refetchOnWindowFocus: true, // Refresh when user returns to tab
    ...options,
  });
}

/**
 * Hook to fetch public workflow templates with caching
 */
export function usePublicWorkflows(
  options?: Omit<
    UseQueryOptions<WorkflowListItem[], Error>,
    "queryKey" | "queryFn"
  >
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: workflowKeys.publicList(),
    queryFn: listPublicWorkflows,
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // Public templates change less often
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
    refetchOnWindowFocus: false, // Don't refetch public templates as often
    ...options,
  });
}

/**
 * Hook to fetch a single workflow by ID with caching
 */
export function useWorkflow(
  workflowId: string | undefined,
  options?: Omit<UseQueryOptions<SavedWorkflow, Error>, "queryKey" | "queryFn">
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: workflowKeys.detail(workflowId || ""),
    queryFn: () => loadWorkflow(workflowId!),
    enabled: !!user && !!workflowId,
    staleTime: 2 * 60 * 1000, // Fresh for 2 minutes
    gcTime: 30 * 60 * 1000,
    ...options,
  });
}

/**
 * Hook for saving a new workflow
 * Invalidates the workflow list cache on success
 */
export function useSaveWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveWorkflow,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.myList() });
      if (result.id) {
        queryClient.invalidateQueries({
          queryKey: workflowKeys.detail(result.id),
        });
      }
    },
    onError: (error: unknown) => {
      const msg = isApiError(error) ? error.message : String(error);
      logger.error("[useSaveWorkflow] Failed:", error);
      toast.error("Failed to save workflow", { description: msg });
    },
  });
}

/**
 * Hook for updating an existing workflow
 * Invalidates both the list and the specific workflow cache
 */
export function useUpdateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workflowId,
      workflow,
    }: {
      workflowId: string;
      workflow: SavedWorkflow;
    }) => updateWorkflow(workflowId, workflow),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(variables.workflowId),
      });
      queryClient.invalidateQueries({ queryKey: workflowKeys.myList() });
    },
    onError: (error: unknown) => {
      const msg = isApiError(error) ? error.message : String(error);
      logger.error("[useUpdateWorkflow] Failed:", error);
      toast.error("Failed to update workflow", { description: msg });
    },
  });
}

/**
 * Hook for deleting a workflow
 * Removes from cache and invalidates the list
 */
export function useDeleteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteWorkflow,
    onMutate: async (workflowId) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: workflowKeys.myList() });

      // Snapshot previous value for rollback
      const previousWorkflows = queryClient.getQueryData<WorkflowListItem[]>(
        workflowKeys.myList(),
      );

      // Optimistically remove from list
      if (previousWorkflows) {
        queryClient.setQueryData<WorkflowListItem[]>(
          workflowKeys.myList(),
          previousWorkflows.filter((w) => w.id !== workflowId),
        );
      }

      return { previousWorkflows };
    },
    onError: (error: unknown, _workflowId, context) => {
      // Rollback on failure
      if (context?.previousWorkflows) {
        queryClient.setQueryData(
          workflowKeys.myList(),
          context.previousWorkflows,
        );
      }
      const msg = isApiError(error) ? error.message : String(error);
      logger.error("[useDeleteWorkflow] Failed:", error);
      toast.error("Failed to delete workflow", { description: msg });
    },
    onSettled: (_, __, workflowId) => {
      // Always refetch for consistency
      queryClient.removeQueries({
        queryKey: workflowKeys.detail(workflowId),
      });
      queryClient.invalidateQueries({ queryKey: workflowKeys.myList() });
    },
  });
}

/**
 * Hook for cloning a workflow
 * Invalidates the list to show the new clone
 */
export function useCloneWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cloneWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.myList() });
    },
    onError: (error: unknown) => {
      const msg = isApiError(error) ? error.message : String(error);
      logger.error("[useCloneWorkflow] Failed:", error);
      toast.error("Failed to clone workflow", { description: msg });
    },
  });
}

/**
 * Hook to prefetch a workflow (useful for hover prefetching)
 */
export function usePrefetchWorkflow() {
  const queryClient = useQueryClient();

  return (workflowId: string) => {
    queryClient.prefetchQuery({
      queryKey: workflowKeys.detail(workflowId),
      queryFn: () => loadWorkflow(workflowId),
      staleTime: 2 * 60 * 1000,
    });
  };
}

/**
 * Hook to manually invalidate workflow caches
 * Useful after external changes
 */
export function useInvalidateWorkflows() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () =>
      queryClient.invalidateQueries({ queryKey: workflowKeys.all }),
    invalidateMyList: () =>
      queryClient.invalidateQueries({ queryKey: workflowKeys.myList() }),
    invalidatePublicList: () =>
      queryClient.invalidateQueries({ queryKey: workflowKeys.publicList() }),
    invalidateWorkflow: (id: string) =>
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(id) }),
  };
}
