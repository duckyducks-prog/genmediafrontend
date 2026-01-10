import { Request, Response, NextFunction } from "express";
import * as workflowStorage from "../workflow-storage-firestore";

// =============================================================================
// AUTHENTICATION CONFIGURATION
// =============================================================================
// Set REQUIRE_AUTH=true in production to enforce Firebase authentication
// Set REQUIRE_AUTH=false (default) for development without auth
//
// To revert to no-auth mode: set REQUIRE_AUTH=false or unset the env var
// =============================================================================
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === "true";

// Lazy-load Firebase Admin to avoid initialization errors when not needed
type FirebaseAdminType = typeof import("firebase-admin");
let firebaseAdminInstance: FirebaseAdminType | null = null;

function getFirebaseAdmin(): FirebaseAdminType {
  if (firebaseAdminInstance) {
    return firebaseAdminInstance;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const admin: FirebaseAdminType = require("firebase-admin");

  if (admin.apps.length === 0) {
    try {
      // Initialize with application default credentials or service account
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      console.log("[Auth] Firebase Admin initialized successfully");
    } catch (error) {
      console.error("[Auth] Failed to initialize Firebase Admin:", error);
      throw error;
    }
  }

  firebaseAdminInstance = admin;
  return admin;
}

/**
 * Middleware to verify Firebase authentication
 *
 * Behavior controlled by REQUIRE_AUTH environment variable:
 * - REQUIRE_AUTH=true: Requires valid Firebase token, returns 401 if missing/invalid
 * - REQUIRE_AUTH=false (default): Allows anonymous access for development
 */
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  // Development mode - allow anonymous access
  if (!REQUIRE_AUTH) {
    if (authHeader?.startsWith("Bearer ")) {
      // Try to extract user info from token even in dev mode (best effort)
      try {
        const token = authHeader.split("Bearer ")[1];
        const firebaseApp = getFirebaseAdmin();
        const decodedToken = await firebaseApp.auth().verifyIdToken(token);
        (req as any).userId = decodedToken.uid;
        (req as any).userEmail = decodedToken.email || "unknown@example.com";
        console.log(`[Auth] Dev mode: Authenticated user ${decodedToken.uid}`);
      } catch {
        // Token verification failed in dev mode - use anonymous
        (req as any).userId = "anonymous";
        (req as any).userEmail = "anonymous@example.com";
        console.log("[Auth] Dev mode: Using anonymous user (token invalid)");
      }
    } else {
      (req as any).userId = "anonymous";
      (req as any).userEmail = "anonymous@example.com";
      console.log("[Auth] Dev mode: Using anonymous user (no token)");
    }
    return next();
  }

  // Production mode - require valid token
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn("[Auth] Production mode: Missing or invalid Authorization header");
    return res.status(401).json({
      error: "Authentication required",
      detail: "Please sign in to access this resource",
    });
  }

  try {
    const token = authHeader.split("Bearer ")[1];
    const firebaseApp = getFirebaseAdmin();
    const decodedToken = await firebaseApp.auth().verifyIdToken(token);

    (req as any).userId = decodedToken.uid;
    (req as any).userEmail = decodedToken.email || "unknown@example.com";

    console.log(`[Auth] Authenticated user: ${decodedToken.uid} (${decodedToken.email})`);
    next();
  } catch (error) {
    console.error("[Auth] Token verification failed:", error);
    return res.status(401).json({
      error: "Invalid or expired token",
      detail: "Please sign out and sign in again",
    });
  }
}

// Log auth mode on module load
console.log(`[Auth] Authentication mode: ${REQUIRE_AUTH ? "REQUIRED (production)" : "OPTIONAL (development)"}`);


/**
 * GET /workflows?scope=my|public
 * List workflows by scope
 */
export async function listWorkflows(req: Request, res: Response) {
  try {
    const scope = (req.query.scope as "my" | "public") || "my";
    const userId = (req as any).userId || "anonymous";

    console.log(
      `[Workflows API] Listing workflows: scope=${scope}, userId=${userId}`,
    );

    const workflows = await workflowStorage.listWorkflows(scope, userId);
    res.json({ workflows });
  } catch (error) {
    console.error("[Workflows API] Error listing workflows:", error);
    res.status(500).json({
      error: "Failed to list workflows",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * POST /workflows/save
 * Save a new workflow
 */
export async function saveWorkflow(req: Request, res: Response) {
  try {
    const userId = (req as any).userId || "anonymous";
    const userEmail = (req as any).userEmail || "anonymous@example.com";

    console.log(`[Workflows API] Saving workflow for user: ${userId}`);

    const { name, description, is_public, nodes, edges, thumbnail } = req.body;

    // Validate required fields
    if (!name || !nodes || !edges) {
      return res.status(400).json({
        error: "Missing required fields",
        detail: "name, nodes, and edges are required",
      });
    }

    const result = await workflowStorage.saveWorkflow({
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
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * GET /workflows/:id
 * Get a specific workflow by ID
 */
export async function getWorkflow(req: Request, res: Response) {
  try {
    const { id } = req.params;

    console.log(`[Workflows API] Getting workflow: ${id}`);

    const workflow = await workflowStorage.loadWorkflow(id);
    res.json(workflow);
  } catch (error) {
    console.error("[Workflows API] Error getting workflow:", error);

    if (error instanceof Error && error.message.includes("not found")) {
      res.status(404).json({
        error: "Workflow not found",
        detail: error.message,
      });
    } else {
      res.status(500).json({
        error: "Failed to load workflow",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}

/**
 * PUT /workflows/:id
 * Update an existing workflow
 */
export async function updateWorkflow(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, description, is_public, nodes, edges, thumbnail } = req.body;

    console.log(`[Workflows API] Updating workflow: ${id}`);

    await workflowStorage.updateWorkflow(id, {
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
        detail: error.message,
      });
    } else {
      res.status(500).json({
        error: "Failed to update workflow",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}

/**
 * DELETE /workflows/:id
 * Delete a workflow
 */
export async function deleteWorkflow(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const userId = (req as any).userId || "anonymous";

    console.log(`[Workflows API] Deleting workflow: ${id}`);

    await workflowStorage.deleteWorkflow(id, userId);
    res.json({ success: true });
  } catch (error) {
    console.error("[Workflows API] Error deleting workflow:", error);

    if (error instanceof Error && error.message.includes("not found")) {
      res.status(404).json({
        error: "Workflow not found",
        detail: error.message,
      });
    } else if (
      error instanceof Error &&
      error.message.includes("Unauthorized")
    ) {
      res.status(403).json({
        error: "Unauthorized",
        detail: error.message,
      });
    } else {
      res.status(500).json({
        error: "Failed to delete workflow",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}

/**
 * POST /workflows/:id/clone
 * Clone a workflow
 */
export async function cloneWorkflow(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const userId = (req as any).userId || "anonymous";
    const userEmail = (req as any).userEmail || "anonymous@example.com";

    console.log(`[Workflows API] Cloning workflow: ${id} for user: ${userId}`);

    const result = await workflowStorage.cloneWorkflow(id, userId, userEmail);
    res.json(result);
  } catch (error) {
    console.error("[Workflows API] Error cloning workflow:", error);

    if (error instanceof Error && error.message.includes("not found")) {
      res.status(404).json({
        error: "Workflow not found",
        detail: error.message,
      });
    } else {
      res.status(500).json({
        error: "Failed to clone workflow",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}

/**
 * POST /workflows/admin/rebuild-index
 *
 * Admin endpoint - not needed for Firestore but kept for API compatibility
 */
export async function rebuildIndexEndpoint(_req: Request, res: Response) {
  try {
    console.log("[Workflows API] Rebuild index requested (no-op for Firestore)");

    const result = await workflowStorage.rebuildIndex();

    res.json({
      message: "Firestore does not require index rebuilding",
      ...result,
      success: true,
    });
  } catch (error) {
    console.error("[Workflows API] Error:", error);
    res.status(500).json({
      success: false,
      error: "Operation failed",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
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

  // Admin endpoints
  app.post("/api/workflows/admin/rebuild-index", rebuildIndexEndpoint);
}
