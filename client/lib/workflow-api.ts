import { auth } from "./firebase";
import { WorkflowNode, WorkflowEdge } from "@/components/workflow/types";

const API_BASE = "https://veo-api-82187245577.us-central1.run.app";

export interface WorkflowMetadata {
  id?: string;
  name: string;
  description: string;
  is_public: boolean;
  thumbnail?: string;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
  user_email?: string;
}

export interface SavedWorkflow extends WorkflowMetadata {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/**
 * Save a workflow to the backend
 */
export async function saveWorkflow(
  workflow: SavedWorkflow
): Promise<{ id: string }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const token = await user.getIdToken();

  const response = await fetch(`${API_BASE}/workflows/save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(workflow),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[saveWorkflow] Failed:", {
      status: response.status,
      body: errorText,
    });
    throw new Error(`Failed to save workflow: ${response.status}`);
  }

  const result = await response.json();
  console.log("[saveWorkflow] Success:", result);
  return result;
}

/**
 * Update an existing workflow
 */
export async function updateWorkflow(
  workflowId: string,
  workflow: SavedWorkflow
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const token = await user.getIdToken();

  const response = await fetch(`${API_BASE}/workflows/${workflowId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(workflow),
  });

  if (!response.ok) {
    throw new Error(`Failed to update workflow: ${response.status}`);
  }
}

/**
 * Load a specific workflow by ID
 */
export async function loadWorkflow(workflowId: string): Promise<SavedWorkflow> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const token = await user.getIdToken();

  const response = await fetch(`${API_BASE}/workflows/${workflowId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load workflow: ${response.status}`);
  }

  return await response.json();
}

/**
 * List user's workflows
 */
export async function listMyWorkflows(): Promise<SavedWorkflow[]> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const token = await user.getIdToken();

  const response = await fetch(`${API_BASE}/workflows?scope=my`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list workflows: ${response.status}`);
  }

  const data = await response.json();
  return data.workflows || [];
}

/**
 * List public workflow templates
 */
export async function listPublicWorkflows(): Promise<SavedWorkflow[]> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const token = await user.getIdToken();

  const response = await fetch(`${API_BASE}/workflows?scope=public`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list public workflows: ${response.status}`);
  }

  const data = await response.json();
  return data.workflows || [];
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(workflowId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const token = await user.getIdToken();

  const response = await fetch(`${API_BASE}/workflows/${workflowId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete workflow: ${response.status}`);
  }
}

/**
 * Clone a workflow (creates a copy for the current user)
 */
export async function cloneWorkflow(workflowId: string): Promise<{ id: string }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const token = await user.getIdToken();

  const response = await fetch(`${API_BASE}/workflows/${workflowId}/clone`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to clone workflow: ${response.status}`);
  }

  return await response.json();
}
