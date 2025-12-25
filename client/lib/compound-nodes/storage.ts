import { CompoundNodeDefinition } from "./types";

/**
 * LocalStorage key for storing compound node templates
 */
const STORAGE_KEY = "genmedia-compound-templates";

/**
 * Save a compound node template to localStorage
 */
export function saveCompoundTemplate(compound: CompoundNodeDefinition): void {
  try {
    const existing = getCompoundTemplates();
    existing[compound.id] = compound;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    console.log(
      `[CompoundStorage] Saved compound template: ${compound.id} (${compound.name})`,
    );
  } catch (error) {
    console.error("[CompoundStorage] Failed to save compound template:", error);
    // Re-throw to allow caller to handle
    throw new Error("Failed to save compound template. Storage quota may be exceeded.");
  }
}

/**
 * Get all compound node templates from localStorage
 * Returns a record of compound ID -> CompoundNodeDefinition
 */
export function getCompoundTemplates(): Record<string, CompoundNodeDefinition> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return {};
    }
    const parsed = JSON.parse(stored);
    console.log(
      `[CompoundStorage] Loaded ${Object.keys(parsed).length} compound templates`,
    );
    return parsed;
  } catch (error) {
    console.error(
      "[CompoundStorage] Failed to load compound templates:",
      error,
    );
    return {};
  }
}

/**
 * Get a single compound node template by ID
 * Returns null if not found
 */
export function getCompoundTemplate(
  id: string,
): CompoundNodeDefinition | null {
  const templates = getCompoundTemplates();
  return templates[id] || null;
}

/**
 * Delete a compound node template from localStorage
 */
export function deleteCompoundTemplate(id: string): void {
  try {
    const existing = getCompoundTemplates();
    if (existing[id]) {
      delete existing[id];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
      console.log(`[CompoundStorage] Deleted compound template: ${id}`);
    }
  } catch (error) {
    console.error(
      "[CompoundStorage] Failed to delete compound template:",
      error,
    );
    throw new Error("Failed to delete compound template");
  }
}

/**
 * Get all compound node templates as an array (for UI rendering)
 * Sorted by creation date (newest first)
 */
export function getCompoundTemplatesList(): CompoundNodeDefinition[] {
  const templates = getCompoundTemplates();
  return Object.values(templates).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Update an existing compound node template
 */
export function updateCompoundTemplate(
  compound: CompoundNodeDefinition,
): void {
  try {
    const existing = getCompoundTemplates();
    if (!existing[compound.id]) {
      throw new Error(`Compound template not found: ${compound.id}`);
    }
    compound.updatedAt = new Date().toISOString();
    existing[compound.id] = compound;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    console.log(
      `[CompoundStorage] Updated compound template: ${compound.id} (${compound.name})`,
    );
  } catch (error) {
    console.error(
      "[CompoundStorage] Failed to update compound template:",
      error,
    );
    throw new Error("Failed to update compound template");
  }
}

/**
 * Clear all compound node templates from localStorage
 * Use with caution - no undo!
 */
export function clearAllCompoundTemplates(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log("[CompoundStorage] Cleared all compound templates");
  } catch (error) {
    console.error(
      "[CompoundStorage] Failed to clear compound templates:",
      error,
    );
  }
}
