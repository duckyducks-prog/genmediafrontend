import { auth } from "./firebase";
import { WorkflowNode, WorkflowEdge } from "@/components/workflow/types";

const API_BASE = "https://veo-api-82187245577.us-central1.run.app";

export interface APITestResult {
  available: boolean;
  endpoints: {
    save?: boolean;
    list?: boolean;
    get?: boolean;
  };
  error?: string;
  details?: string;
}

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
 * Test if workflow API is accessible and which endpoints are working
 */
export async function testWorkflowAPI(): Promise<APITestResult> {
  const user = auth.currentUser;

  if (!user) {
    return {
      available: false,
      endpoints: {},
      error: 'Not authenticated',
      details: 'User must be signed in to test API',
    };
  }

  const token = await user.getIdToken();
  const results: APITestResult = {
    available: false,
    endpoints: {},
  };

  console.log('[testWorkflowAPI] Starting API connectivity test...');

  // Test 1: List public workflows (GET /workflows?scope=public)
  try {
    const url = `${API_BASE}/workflows?scope=public`;
    console.log('[testWorkflowAPI] Testing:', url);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    console.log('[testWorkflowAPI] List endpoint response:', {
      status: response.status,
      ok: response.ok,
    });

    results.endpoints.list = response.ok;

    if (!response.ok) {
      const body = await response.text();
      console.log('[testWorkflowAPI] List endpoint error body:', body);

      if (response.status === 404) {
        results.details = '404 Not Found - Endpoint may not be deployed or router not mounted at /workflows';
      } else if (response.status === 401) {
        results.details = '401 Unauthorized - Firebase token may be invalid';
      } else if (response.status === 403) {
        results.details = '403 Forbidden - User may not have access';
      } else if (response.status >= 500) {
        results.details = `${response.status} Server Error - Backend may be experiencing issues`;
      } else {
        results.details = `${response.status} ${response.statusText}`;
      }
    }
  } catch (error) {
    results.endpoints.list = false;

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        results.error = 'Request timeout - Backend not responding';
        results.details = 'The API did not respond within 10 seconds';
      } else if (error.message.includes('Failed to fetch')) {
        results.error = 'Network error - Cannot reach backend';
        results.details = 'CORS error, network failure, or backend is down';
      } else {
        results.error = error.message;
      }
    }
    console.error('[testWorkflowAPI] List endpoint test failed:', error);
  }

  // Test 2: Try to list my workflows (GET /workflows?scope=my)
  try {
    const url = `${API_BASE}/workflows?scope=my`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      results.endpoints.list = true;
    }
  } catch (error) {
    // Already logged above
  }

  // Determine overall availability
  results.available = Object.values(results.endpoints).some(v => v === true);

  console.log('[testWorkflowAPI] Test complete:', results);
  return results;
}

/**
 * Validate workflow data before sending to API
 */
function validateWorkflowData(workflow: SavedWorkflow): { valid: boolean; error?: string } {
  // Validate name
  if (!workflow.name || typeof workflow.name !== 'string') {
    return { valid: false, error: 'Workflow name is required and must be a string' };
  }

  const trimmedName = workflow.name.trim();
  if (trimmedName.length === 0) {
    return { valid: false, error: 'Workflow name cannot be empty' };
  }

  if (trimmedName.length > 100) {
    return { valid: false, error: 'Workflow name cannot exceed 100 characters' };
  }

  // Validate description
  if (workflow.description !== undefined && typeof workflow.description !== 'string') {
    return { valid: false, error: 'Workflow description must be a string' };
  }

  // Validate is_public
  if (typeof workflow.is_public !== 'boolean') {
    return { valid: false, error: 'is_public must be a boolean' };
  }

  // Validate nodes
  if (!Array.isArray(workflow.nodes)) {
    return { valid: false, error: 'Nodes must be an array' };
  }

  if (workflow.nodes.length === 0) {
    return { valid: false, error: 'Workflow must have at least one node' };
  }

  if (workflow.nodes.length > 100) {
    return { valid: false, error: 'Workflow cannot exceed 100 nodes' };
  }

  // Validate each node has required properties
  for (let i = 0; i < workflow.nodes.length; i++) {
    const node = workflow.nodes[i];
    if (!node.id || !node.type || !node.position || !node.data) {
      return { valid: false, error: `Node at index ${i} is missing required properties (id, type, position, data)` };
    }
  }

  // Validate edges
  if (!Array.isArray(workflow.edges)) {
    return { valid: false, error: 'Edges must be an array' };
  }

  // Validate each edge has required properties
  for (let i = 0; i < workflow.edges.length; i++) {
    const edge = workflow.edges[i];
    if (!edge.source || !edge.target) {
      return { valid: false, error: `Edge at index ${i} is missing required properties (source, target)` };
    }
  }

  return { valid: true };
}

/**
 * Save a workflow to the backend
 */
export async function saveWorkflow(
  workflow: SavedWorkflow,
): Promise<{ id: string }> {
  // Validate workflow data before sending
  const validation = validateWorkflowData(workflow);
  if (!validation.valid) {
    console.error('[saveWorkflow] Validation failed:', validation.error);
    throw new Error(`Invalid workflow data: ${validation.error}`);
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const token = await user.getIdToken();
  const url = `${API_BASE}/workflows/save`;

  console.log('[saveWorkflow] Request:', {
    method: 'POST',
    url,
    hasAuth: !!token,
    tokenPreview: token.substring(0, 20) + '...',
    workflowName: workflow.name,
    nodeCount: workflow.nodes.length,
    edgeCount: workflow.edges.length,
    isPublic: workflow.is_public,
  });

  try {
    const payload = JSON.stringify(workflow);
    const payloadSize = new Blob([payload]).size;
    const payloadSizeMB = (payloadSize / (1024 * 1024)).toFixed(2);

    console.log('[saveWorkflow] Payload size:', `${payloadSizeMB} MB (${payloadSize} bytes)`);

    // Warn if payload is suspiciously large (after sanitization, should be small)
    if (payloadSize > 5 * 1024 * 1024) {
      console.warn('[saveWorkflow] WARNING: Large payload detected. This may fail or timeout.');
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: payload,
    });

    console.log('[saveWorkflow] Response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[saveWorkflow] Error Response:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        headers: Object.fromEntries(response.headers.entries()),
      });

      // Try to parse backend error message
      try {
        const errorJson = JSON.parse(errorText);
        const message = errorJson.detail || errorJson.message || `Server error: ${response.status}`;
        throw new Error(message);
      } catch (parseError) {
        // If not JSON, use raw text
        if (response.status === 404) {
          throw new Error('Workflow API endpoint not found (404). The backend may not be properly deployed or the router is not mounted at /workflows.');
        } else if (response.status === 401) {
          throw new Error('Authentication failed (401). Please sign out and sign in again.');
        } else if (response.status === 403) {
          throw new Error('Access denied (403). You may not have permission to save workflows.');
        } else if (response.status === 413) {
          throw new Error(`Payload too large (413). The workflow data exceeds server limits. Payload size: ${payloadSizeMB} MB`);
        } else if (response.status >= 500) {
          throw new Error(`Backend server error (${response.status}): ${errorText.substring(0, 200)}`);
        } else {
          throw new Error(`Failed to save workflow (${response.status}): ${errorText.substring(0, 200)}`);
        }
      }
    }

    const result = await response.json();
    console.log("[saveWorkflow] Success:", result);

    // Validate response
    if (!result.id) {
      console.error('[saveWorkflow] Invalid response - missing id:', result);
      throw new Error('Backend returned invalid response: missing workflow ID');
    }

    return result;
  } catch (error) {
    // Network errors or fetch failures
    if (error instanceof TypeError) {
      if (error.message.includes('Failed to fetch')) {
        console.error('[saveWorkflow] Network error:', error);
        throw new Error('Cannot connect to backend API. Please check your internet connection or the API may be down.');
      } else if (error.message.includes('NetworkError') || error.message.includes('network')) {
        console.error('[saveWorkflow] Network error:', error);
        throw new Error('Network error occurred while saving workflow. Please try again.');
      }
    }

    // Re-throw other errors as-is
    throw error;
  }
}

/**
 * Update an existing workflow
 */
export async function updateWorkflow(
  workflowId: string,
  workflow: SavedWorkflow,
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
  const url = `${API_BASE}/workflows?scope=my`;

  console.log('[listMyWorkflows] Request:', { url });

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log('[listMyWorkflows] Response:', {
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[listMyWorkflows] Error:', {
        status: response.status,
        body: errorText,
      });
      throw new Error(`Failed to list workflows: ${response.status}`);
    }

    const data = await response.json();
    console.log('[listMyWorkflows] Success:', { count: data.workflows?.length || 0 });
    return data.workflows || [];
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      console.error('[listMyWorkflows] Network error');
      throw new Error('Cannot connect to backend API');
    }
    throw error;
  }
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
  const url = `${API_BASE}/workflows?scope=public`;

  console.log('[listPublicWorkflows] Request:', { url });

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log('[listPublicWorkflows] Response:', {
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[listPublicWorkflows] Error:', {
        status: response.status,
        body: errorText,
      });
      throw new Error(`Failed to list public workflows: ${response.status}`);
    }

    const data = await response.json();
    console.log('[listPublicWorkflows] Success:', { count: data.workflows?.length || 0 });
    return data.workflows || [];
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      console.error('[listPublicWorkflows] Network error');
      throw new Error('Cannot connect to backend API');
    }
    throw error;
  }
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
export async function cloneWorkflow(
  workflowId: string,
): Promise<{ id: string }> {
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
