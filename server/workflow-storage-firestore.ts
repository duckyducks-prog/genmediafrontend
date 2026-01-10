/**
 * Firestore-based workflow storage
 *
 * Replaces local file storage with Firebase Firestore for persistence
 * on Cloud Run and other ephemeral environments.
 *
 * Collection structure:
 * - workflows/{workflowId} - Full workflow document
 */

import * as admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";

// Lazy initialization of Firestore
let firestoreInstance: Firestore | null = null;
let initialized = false;

function getFirestore(): Firestore {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  if (!initialized && admin.apps.length === 0) {
    try {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      console.log("[WorkflowStorage] Firebase Admin initialized");
      initialized = true;
    } catch (error) {
      console.error("[WorkflowStorage] Failed to initialize Firebase Admin:", error);
      throw error;
    }
  }

  firestoreInstance = admin.firestore();
  console.log("[WorkflowStorage] Firestore connected");
  return firestoreInstance;
}

// Collection name
const WORKFLOWS_COLLECTION = "workflows";

export interface WorkflowData {
  id: string;
  name: string;
  description: string;
  is_public: boolean;
  nodes: any[];
  edges: any[];
  thumbnail?: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  user_email: string;
}

export type WorkflowMetadata = Omit<WorkflowData, "nodes" | "edges">;

/**
 * Generate a unique ID for workflows
 */
function generateId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Save a new workflow
 */
export async function saveWorkflow(
  workflowData: Omit<WorkflowData, "id" | "created_at" | "updated_at">
): Promise<{ id: string }> {
  const db = getFirestore();
  const id = generateId();
  const now = new Date().toISOString();

  const fullWorkflow: WorkflowData = {
    ...workflowData,
    id,
    created_at: now,
    updated_at: now,
  };

  await db.collection(WORKFLOWS_COLLECTION).doc(id).set(fullWorkflow);

  console.log(`[WorkflowStorage] Saved workflow: ${id} - "${workflowData.name}"`);
  return { id };
}

/**
 * Update an existing workflow
 */
export async function updateWorkflow(
  workflowId: string,
  workflowData: Omit<WorkflowData, "id" | "created_at" | "updated_at" | "user_id" | "user_email">
): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection(WORKFLOWS_COLLECTION).doc(workflowId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const updated: Partial<WorkflowData> = {
    ...workflowData,
    updated_at: new Date().toISOString(),
  };

  await docRef.update(updated);

  console.log(`[WorkflowStorage] Updated workflow: ${workflowId}`);
}

/**
 * Load a specific workflow by ID
 */
export async function loadWorkflow(workflowId: string): Promise<WorkflowData> {
  const db = getFirestore();
  const doc = await db.collection(WORKFLOWS_COLLECTION).doc(workflowId).get();

  if (!doc.exists) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  return doc.data() as WorkflowData;
}

/**
 * List workflows by scope
 */
export async function listWorkflows(
  scope: "my" | "public",
  userId: string
): Promise<WorkflowMetadata[]> {
  const db = getFirestore();
  let query;

  if (scope === "my") {
    query = db
      .collection(WORKFLOWS_COLLECTION)
      .where("user_id", "==", userId)
      .orderBy("updated_at", "desc");
  } else {
    // public
    query = db
      .collection(WORKFLOWS_COLLECTION)
      .where("is_public", "==", true)
      .orderBy("updated_at", "desc");
  }

  const snapshot = await query.get();

  const workflows: WorkflowMetadata[] = snapshot.docs.map((doc) => {
    const data = doc.data() as WorkflowData;
    // Return metadata without nodes/edges for performance
    const { nodes, edges, ...metadata } = data;
    return metadata;
  });

  return workflows;
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(workflowId: string, userId: string): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection(WORKFLOWS_COLLECTION).doc(workflowId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const workflow = doc.data() as WorkflowData;

  if (workflow.user_id !== userId) {
    throw new Error("Unauthorized: You can only delete your own workflows");
  }

  await docRef.delete();

  console.log(`[WorkflowStorage] Deleted workflow: ${workflowId}`);
}

/**
 * Clone a workflow
 */
export async function cloneWorkflow(
  workflowId: string,
  newUserId: string,
  newUserEmail: string
): Promise<{ id: string }> {
  const original = await loadWorkflow(workflowId);

  const clonedData = {
    name: `${original.name} (Copy)`,
    description: original.description,
    is_public: false,
    nodes: original.nodes,
    edges: original.edges,
    thumbnail: original.thumbnail,
    user_id: newUserId,
    user_email: newUserEmail,
  };

  return saveWorkflow(clonedData);
}

/**
 * Verify storage health on startup
 */
export async function verifyStorageHealth(): Promise<void> {
  try {
    const db = getFirestore();
    // Simple health check - try to access the collection
    await db.collection(WORKFLOWS_COLLECTION).limit(1).get();
    console.log("✅ [WorkflowStorage] Firestore health check passed");
  } catch (error) {
    console.error("⛔ [WorkflowStorage] Firestore health check failed:", error);
    throw error;
  }
}

/**
 * Rebuild index - Not needed for Firestore (indexes are automatic)
 * Kept for API compatibility
 */
export async function rebuildIndex(): Promise<{
  success: boolean;
  rebuilt: number;
  failed: number;
  errors: Array<{ file: string; error: string }>;
}> {
  console.log("[WorkflowStorage] Firestore does not require index rebuilding");
  return {
    success: true,
    rebuilt: 0,
    failed: 0,
    errors: [],
  };
}
