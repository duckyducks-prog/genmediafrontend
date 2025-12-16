import { Request, Response } from "express";
import * as workflowStorage from "../workflow-storage";

/**
 * Middleware to verify Firebase authentication
 * For now, we'll allow all requests - proper auth should be added later
 */
function requireAuth(req: Request, res: Response, next: Function) {
  // TODO: Add proper Firebase admin auth verification
  // For now, extract user info from Authorization header if present
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // For development, allow requests without auth
    // But set a default user ID
    (req as any).userId = "anonymous";
    (req as any).userEmail = "anonymous@example.com";
    return next();
  }

  // TODO: Verify Firebase token and extract user info
  // For now, just pass through
  (req as any).userId = "anonymous";
  (req as any).userEmail = "anonymous@example.com";
  next();
}

/**
 * GET /workflows?scope=my|public
 * List workflows by scope
 */
export function listWorkflows(req: Request, res: Response) {
  try {
    const scope = (req.query.scope as "my" | "public") || "my";
    const userId = (req as any).userId || "anonymous";

    console.log(`[Workflows API] Listing workflows: scope=${scope}, userId=${userId}`);

    const workflows = workflowStorage.listWorkflows(scope, userId);
    res.json({ workflows });
  } catch (error) {
    console.error("[Workflows API] Error listing workflows:", error);
    res.status(500).json({ 
      error: "Failed to list workflows",
      detail: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

/**
 * POST /workflows/save
 * Save a new workflow
 */
export function saveWorkflow(req: Request, res: Response) {
  try {
    const userId = (req as any).userId || "anonymous";
    const userEmail = (req as any).userEmail || "anonymous@example.com";

    console.log(`[Workflows API] Saving workflow for user: ${userId}`);

    const { name, description, is_public, nodes, edges, thumbnail } = req.body;

    // Validate required fields
    if (!name || !nodes || !edges) {
      return res.status(400).json({ 
        error: "Missing required fields",
        detail: "name, nodes, and edges are required"
      });
    }

    const result = workflowStorage.saveWorkflow({
      name,
      description: description || "",
      is_public: is_public || false,
      nodes,
      edges,
      thumbnail,
      user_id: userId,
      user_email: userEmail,
    });

    res.json(result);
  } catch (error) {
    console.error("[Workflows API] Error saving workflow:", error);
    res.status(500).json({ 
      error: "Failed to save workflow",
      detail: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

/**
 * GET /workflows/:id
 * Get a specific workflow by ID
 */
export function getWorkflow(req: Request, res: Response) {
  try {
    const { id } = req.params;

    console.log(`[Workflows API] Getting workflow: ${id}`);

    const workflow = workflowStorage.loadWorkflow(id);
    res.json(workflow);
  } catch (error) {
    console.error("[Workflows API] Error getting workflow:", error);
    
    if (error instanceof Error && error.message.includes("not found")) {
      res.status(404).json({ 
        error: "Workflow not found",
        detail: error.message
      });
    } else {
      res.status(500).json({ 
        error: "Failed to load workflow",
        detail: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
}

/**
 * PUT /workflows/:id
 * Update an existing workflow
 */
export function updateWorkflow(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, description, is_public, nodes, edges, thumbnail } = req.body;

    console.log(`[Workflows API] Updating workflow: ${id}`);

    workflowStorage.updateWorkflow(id, {
      name,
      description,
      is_public,
      nodes,
      edges,
      thumbnail,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("[Workflows API] Error updating workflow:", error);
    
    if (error instanceof Error && error.message.includes("not found")) {
      res.status(404).json({ 
        error: "Workflow not found",
        detail: error.message
      });
    } else {
      res.status(500).json({ 
        error: "Failed to update workflow",
        detail: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
}

/**
 * DELETE /workflows/:id
 * Delete a workflow
 */
export function deleteWorkflow(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const userId = (req as any).userId || "anonymous";

    console.log(`[Workflows API] Deleting workflow: ${id}`);

    workflowStorage.deleteWorkflow(id, userId);
    res.json({ success: true });
  } catch (error) {
    console.error("[Workflows API] Error deleting workflow:", error);
    
    if (error instanceof Error && error.message.includes("not found")) {
      res.status(404).json({ 
        error: "Workflow not found",
        detail: error.message
      });
    } else if (error instanceof Error && error.message.includes("Unauthorized")) {
      res.status(403).json({ 
        error: "Unauthorized",
        detail: error.message
      });
    } else {
      res.status(500).json({ 
        error: "Failed to delete workflow",
        detail: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
}

/**
 * POST /workflows/:id/clone
 * Clone a workflow
 */
export function cloneWorkflow(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const userId = (req as any).userId || "anonymous";
    const userEmail = (req as any).userEmail || "anonymous@example.com";

    console.log(`[Workflows API] Cloning workflow: ${id} for user: ${userId}`);

    const result = workflowStorage.cloneWorkflow(id, userId, userEmail);
    res.json(result);
  } catch (error) {
    console.error("[Workflows API] Error cloning workflow:", error);
    
    if (error instanceof Error && error.message.includes("not found")) {
      res.status(404).json({ 
        error: "Workflow not found",
        detail: error.message
      });
    } else {
      res.status(500).json({ 
        error: "Failed to clone workflow",
        detail: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
}

// Apply auth middleware to all routes
export function setupWorkflowRoutes(app: any) {
  app.use(requireAuth);
  
  app.get("/api/workflows", listWorkflows);
  app.post("/api/workflows/save", saveWorkflow);
  app.get("/api/workflows/:id", getWorkflow);
  app.put("/api/workflows/:id", updateWorkflow);
  app.delete("/api/workflows/:id", deleteWorkflow);
  app.post("/api/workflows/:id/clone", cloneWorkflow);
}
