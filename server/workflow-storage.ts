import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage directory for workflows
const STORAGE_DIR = path.join(__dirname, "..", "data", "workflows");

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

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
 * Get the file path for a workflow
 */
function getWorkflowPath(workflowId: string): string {
  return path.join(STORAGE_DIR, `${workflowId}.json`);
}

/**
 * Get the index file path (stores metadata for all workflows)
 */
function getIndexPath(): string {
  return path.join(STORAGE_DIR, "index.json");
}

/**
 * Create a timestamped backup of a corrupted file for forensic analysis
 */
function createCorruptionBackup(corruptedPath: string): string {
  const timestamp = Date.now();
  const backupPath = `${corruptedPath}.corrupted.${timestamp}`;

  try {
    fs.copyFileSync(corruptedPath, backupPath);
    console.error(`📦 [WorkflowStorage] Backed up corrupted file to: ${backupPath}`);
    return backupPath;
  } catch (backupError) {
    console.error(`[WorkflowStorage] Failed to backup corrupted file:`, backupError);
    throw backupError;
  }
}

/**
 * Load the workflow index
 *
 * Automatically recovers from backup if primary is corrupted.
 * Throws error if both primary and backup are corrupted.
 */
function loadIndex(): Record<string, WorkflowMetadata> {
  const indexPath = getIndexPath();
  const backupPath = `${indexPath}.backup`;

  // Try primary index file
  if (fs.existsSync(indexPath)) {
    try {
      const data = fs.readFileSync(indexPath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      console.error("⛔ [WorkflowStorage] CRITICAL: Primary index file corrupted!", error);

      // Create forensic backup of corrupted file
      createCorruptionBackup(indexPath);

      // Try backup file
      console.log("🔄 [WorkflowStorage] Attempting recovery from backup file...");

      if (fs.existsSync(backupPath)) {
        try {
          const backupData = fs.readFileSync(backupPath, "utf-8");
          const recoveredIndex = JSON.parse(backupData);

          console.log("✅ [WorkflowStorage] Successfully recovered index from backup!");

          // Restore backup to primary
          fs.writeFileSync(indexPath, backupData);

          return recoveredIndex;
        } catch (backupError) {
          console.error("⛔ [WorkflowStorage] Backup file also corrupted!", backupError);
          createCorruptionBackup(backupPath);
        }
      }

      // Both files corrupted or missing
      throw new Error(
        "Index file corrupted and backup unavailable or also corrupted. " +
        "Use POST /api/workflows/admin/rebuild-index to recover."
      );
    }
  }

  // No index file exists yet - this is normal for first run
  return {};
}

/**
 * Save the workflow index
 *
 * Uses atomic write pattern:
 * 1. Create backup of current index
 * 2. Write to temporary file
 * 3. Atomic rename (OS-guaranteed)
 */
function saveIndex(index: Record<string, WorkflowMetadata>): void {
  const indexPath = getIndexPath();
  const backupPath = `${indexPath}.backup`;
  const tempPath = `${indexPath}.tmp`;

  try {
    // Step 1: Create backup of current index (if exists)
    if (fs.existsSync(indexPath)) {
      try {
        fs.copyFileSync(indexPath, backupPath);
        console.log(`[WorkflowStorage] Created backup: ${backupPath}`);
      } catch (backupError) {
        // Log but don't fail - we can still proceed
        console.warn("[WorkflowStorage] Failed to create backup:", backupError);
      }
    }

    // Step 2: Write to temporary file
    const jsonData = JSON.stringify(index, null, 2);
    fs.writeFileSync(tempPath, jsonData, "utf-8");

    // Step 3: Atomic rename (OS guarantees atomicity)
    fs.renameSync(tempPath, indexPath);

    console.log(`[WorkflowStorage] Index saved successfully (${Object.keys(index).length} workflows)`);

  } catch (error) {
    // Cleanup temp file if it exists
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (cleanupError) {
        console.error("[WorkflowStorage] Failed to cleanup temp file:", cleanupError);
      }
    }

    // Re-throw original error
    console.error("[WorkflowStorage] Failed to save index:", error);
    throw error;
  }
}

/**
 * Save a workflow
 */
export function saveWorkflow(
  workflowData: Omit<WorkflowData, "id" | "created_at" | "updated_at">,
): { id: string } {
  const id = generateId();
  const now = new Date().toISOString();

  const fullWorkflow: WorkflowData = {
    ...workflowData,
    id,
    created_at: now,
    updated_at: now,
  };

  // Save full workflow to file
  const workflowPath = getWorkflowPath(id);
  fs.writeFileSync(workflowPath, JSON.stringify(fullWorkflow, null, 2));

  // Update index with metadata (without nodes/edges for performance)
  const index = loadIndex();
  const { nodes, edges, ...metadata } = fullWorkflow;
  index[id] = metadata;
  saveIndex(index);

  console.log(`[WorkflowStorage] Saved workflow: ${id} - "${workflowData.name}"`);
  return { id };
}

/**
 * Update an existing workflow
 */
export function updateWorkflow(
  workflowId: string,
  workflowData: Omit<WorkflowData, "id" | "created_at" | "updated_at" | "user_id" | "user_email">,
): void {
  const workflowPath = getWorkflowPath(workflowId);
  
  if (!fs.existsSync(workflowPath)) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  // Load existing workflow to preserve created_at and user info
  const existing = JSON.parse(fs.readFileSync(workflowPath, "utf-8"));

  const updated: WorkflowData = {
    ...existing,
    ...workflowData,
    id: workflowId,
    updated_at: new Date().toISOString(),
  };

  // Save updated workflow
  fs.writeFileSync(workflowPath, JSON.stringify(updated, null, 2));

  // Update index
  const index = loadIndex();
  const { nodes, edges, ...metadata } = updated;
  index[workflowId] = metadata;
  saveIndex(index);

  console.log(`[WorkflowStorage] Updated workflow: ${workflowId}`);
}

/**
 * Load a specific workflow by ID
 */
export function loadWorkflow(workflowId: string): WorkflowData {
  const workflowPath = getWorkflowPath(workflowId);

  if (!fs.existsSync(workflowPath)) {
    // The workflow exists in the index but the file is missing.
    // This can happen if:
    // 1. Workflows are stored in cloud storage (Firestore, S3, etc.) in production
    // 2. Local files weren't synced to this environment
    // 3. The workflow was deleted but index wasn't updated
    console.error(`[WorkflowStorage] Workflow file not found: ${workflowPath}`);
    throw new Error(
      `Workflow data file not found. This workflow may be stored in a cloud database that isn't accessible in this environment. Workflow ID: ${workflowId}`,
    );
  }

  const data = fs.readFileSync(workflowPath, "utf-8");
  return JSON.parse(data);
}

/**
 * List workflows by scope
 */
export function listWorkflows(
  scope: "my" | "public",
  userId: string,
): WorkflowMetadata[] {
  const index = loadIndex();

  const workflows = Object.values(index).filter((workflow) => {
    if (scope === "my") {
      return workflow.user_id === userId;
    }

    if (scope === "public") {
      return workflow.is_public === true;
    }

    return false;
  });

  // Sort by updated_at descending
  workflows.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  // Return metadata from index. The actual workflow files may be stored elsewhere
  // (cloud storage, database, etc.), so we show all workflows that exist in the index.
  // If a workflow file is missing when someone tries to LOAD it, loadWorkflow() will throw an error.
  return workflows;
}

/**
 * Delete a workflow
 */
export function deleteWorkflow(workflowId: string, userId: string): void {
  const workflowPath = getWorkflowPath(workflowId);

  if (!fs.existsSync(workflowPath)) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  // Load workflow to check ownership
  const workflow = loadWorkflow(workflowId);
  if (workflow.user_id !== userId) {
    throw new Error("Unauthorized: You can only delete your own workflows");
  }

  // Delete file
  fs.unlinkSync(workflowPath);

  // Remove from index
  const index = loadIndex();
  delete index[workflowId];
  saveIndex(index);

  console.log(`[WorkflowStorage] Deleted workflow: ${workflowId}`);
}

/**
 * Clone a workflow
 */
export function cloneWorkflow(
  workflowId: string,
  newUserId: string,
  newUserEmail: string,
): { id: string } {
  const original = loadWorkflow(workflowId);

  // Create a copy with new user info
  const clonedData = {
    name: `${original.name} (Copy)`,
    description: original.description,
    is_public: false, // Clones are private by default
    nodes: original.nodes,
    edges: original.edges,
    thumbnail: original.thumbnail,
    user_id: newUserId,
    user_email: newUserEmail,
  };

  return saveWorkflow(clonedData);
}

/**
 * Rebuild index from existing workflow files
 *
 * Use this to recover from index corruption or sync issues.
 * Scans all wf_*.json files and reconstructs the index.
 *
 * @returns Object with rebuilt index and statistics
 */
export function rebuildIndex(): {
  success: boolean;
  rebuilt: number;
  failed: number;
  errors: Array<{ file: string; error: string }>;
} {
  console.log("[WorkflowStorage] Starting index rebuild...");

  const newIndex: Record<string, WorkflowMetadata> = {};
  const errors: Array<{ file: string; error: string }> = [];
  let rebuilt = 0;
  let failed = 0;

  try {
    // Get all files in storage directory
    const files = fs.readdirSync(STORAGE_DIR);

    // Filter for workflow files (wf_*.json, excluding special files)
    const workflowFiles = files.filter(
      f => f.startsWith('wf_') && f.endsWith('.json')
    );

    console.log(`[WorkflowStorage] Found ${workflowFiles.length} workflow files to process`);

    // Process each workflow file
    for (const file of workflowFiles) {
      try {
        const filePath = path.join(STORAGE_DIR, file);
        const data = fs.readFileSync(filePath, 'utf-8');
        const workflow: WorkflowData = JSON.parse(data);

        // Extract metadata (strip nodes/edges)
        const { nodes, edges, ...metadata } = workflow;

        // Add to index
        newIndex[workflow.id] = metadata;
        rebuilt++;

      } catch (fileError) {
        failed++;
        const errorMsg = fileError instanceof Error ? fileError.message : "Unknown error";
        errors.push({ file, error: errorMsg });
        console.error(`[WorkflowStorage] Failed to process ${file}:`, fileError);
      }
    }

    // Save the rebuilt index
    console.log(`[WorkflowStorage] Saving rebuilt index (${rebuilt} workflows)...`);
    saveIndex(newIndex);

    console.log(`[WorkflowStorage] Index rebuild complete: ${rebuilt} succeeded, ${failed} failed`);

    return {
      success: true,
      rebuilt,
      failed,
      errors
    };

  } catch (error) {
    console.error("[WorkflowStorage] Index rebuild failed:", error);
    throw error;
  }
}

/**
 * Verify storage health on startup
 *
 * Checks that index can be loaded without errors.
 * Could auto-trigger rebuild if needed.
 */
export function verifyStorageHealth(): void {
  try {
    loadIndex(); // Will throw if corrupted without backup
    console.log("✅ [WorkflowStorage] Storage health check passed");
  } catch (error) {
    console.error("⛔ [WorkflowStorage] Storage health check failed:", error);
    console.error("⚠️  [WorkflowStorage] Use POST /api/workflows/admin/rebuild-index to recover");
    // Could auto-trigger rebuild here if desired
  }
}
