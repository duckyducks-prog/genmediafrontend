import { logger } from "@/lib/logger";
import { WorkflowNode, WorkflowEdge } from "@/components/workflow/types";

/**
 * Check if a string is a base64 data URI
 */
function isBase64DataUri(str: string | null | undefined): boolean {
  if (!str || typeof str !== 'string') return false;
  return str.startsWith('data:image/') || str.startsWith('data:video/');
}

/**
 * Get the size of a base64 data URI in bytes
 */
function getBase64Size(dataUri: string): number {
  if (!dataUri.includes(',')) return dataUri.length;
  const base64 = dataUri.split(',')[1];
  return Math.ceil((base64.length * 3) / 4);
}

/**
 * Strip large base64 data from a single value
 * Returns a placeholder string if the value is a large base64 data URI
 */
function sanitizeValue(value: any, fieldName: string): any {
  if (typeof value === 'string' && isBase64DataUri(value)) {
    const size = getBase64Size(value);
    const sizeKB = Math.round(size / 1024);
    logger.debug(`[Sanitizer] Stripping ${sizeKB}KB base64 data from field: ${fieldName}`);
    
    // Keep just the mime type as a reference
    const mimeMatch = value.match(/^data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'unknown';
    return `[REMOVED_FOR_SAVE:${mimeType}:${sizeKB}KB]`;
  }
  return value;
}

/**
 * Recursively sanitize an object by removing large base64 data
 * This is now MORE AGGRESSIVE - strips ALL base64 data URIs from any field
 */
function sanitizeObject(obj: any, path: string = ''): any {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item, index) => {
      const itemPath = `${path}[${index}]`;
      // IMPORTANT: Check if array item is a string and sanitize it
      if (typeof item === 'string') {
        return sanitizeValue(item, itemPath);
      }
      // Otherwise recursively sanitize the item
      return sanitizeObject(item, itemPath);
    });
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = path ? `${path}.${key}` : key;

      // Remove File objects entirely (can't be serialized anyway)
      if (key === 'file') {
        sanitized[key] = null;
      }
      // Recursively sanitize objects
      else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObject(value, fieldPath);
      }
      // Strip ALL base64 data URIs from any string field
      else if (typeof value === 'string') {
        sanitized[key] = sanitizeValue(value, fieldPath);
      }
      // Keep other primitives as-is
      else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  // For primitive values (strings, numbers, booleans), sanitize strings
  if (typeof obj === 'string') {
    return sanitizeValue(obj, path);
  }

  return obj;
}

/**
 * Calculate the JSON payload size in bytes
 */
export function calculatePayloadSize(data: any): number {
  try {
    const json = JSON.stringify(data);
    return new Blob([json]).size;
  } catch (error) {
    console.error('[Sanitizer] Failed to calculate payload size:', error);
    return 0;
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Sanitize workflow data before saving
 * Removes large base64 image/video data to reduce payload size
 *
 * @param nodes - Array of workflow nodes
 * @param edges - Array of workflow edges
 * @returns Sanitized copies of nodes and edges safe for API transmission
 */
export function sanitizeWorkflowForSave(nodes: WorkflowNode[], edges: WorkflowEdge[]): {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  originalSize: number;
  sanitizedSize: number;
  removed: number;
} {
  logger.debug('[Sanitizer] Starting workflow sanitization...');
  logger.debug(`[Sanitizer] Input: ${nodes.length} nodes, ${edges.length} edges`);

  // Calculate original size
  const originalSize = calculatePayloadSize({ nodes, edges });
  logger.debug(`[Sanitizer] Original payload size: ${formatBytes(originalSize)}`);

  // Log sample of original data to debug
  logger.debug('[Sanitizer] Sample node data before sanitization:', {
    nodeCount: nodes.length,
    sampleNode: nodes[0] ? {
      id: nodes[0].id,
      type: nodes[0].type,
      dataKeys: Object.keys(nodes[0].data),
      dataPreview: JSON.stringify(nodes[0].data).substring(0, 200) + '...',
    } : null,
  });

  // Deep clone and sanitize nodes
  const sanitizedNodes = nodes.map((node) => ({
    ...node,
    data: sanitizeObject(node.data, `node[${node.id}].data`),
  }));

  // Edges typically don't have large data, but sanitize just in case
  const sanitizedEdges = edges.map((edge) => ({
    ...edge,
  }));

  // Calculate sanitized size
  const sanitizedSize = calculatePayloadSize({ nodes: sanitizedNodes, edges: sanitizedEdges });
  const removed = originalSize - sanitizedSize;

  logger.debug(`[Sanitizer] Sanitized payload size: ${formatBytes(sanitizedSize)}`);
  logger.debug(`[Sanitizer] Removed: ${formatBytes(removed)} (${((removed / originalSize) * 100).toFixed(1)}%)`);

  // Log sample of sanitized data
  logger.debug('[Sanitizer] Sample node data after sanitization:', {
    sampleNode: sanitizedNodes[0] ? {
      id: sanitizedNodes[0].id,
      type: sanitizedNodes[0].type,
      dataKeys: Object.keys(sanitizedNodes[0].data),
      dataPreview: JSON.stringify(sanitizedNodes[0].data).substring(0, 200) + '...',
    } : null,
  });

  if (sanitizedSize > 1024 * 1024) {
    console.warn(`[Sanitizer] WARNING: Payload still large (${formatBytes(sanitizedSize)}). May fail to send.`);

    // Additional debugging - find the largest nodes
    const nodeSizes = sanitizedNodes.map((node, idx) => ({
      index: idx,
      id: node.id,
      type: node.type,
      size: calculatePayloadSize(node),
    })).sort((a, b) => b.size - a.size);

    console.warn('[Sanitizer] Top 5 largest nodes:', nodeSizes.slice(0, 5).map(n => ({
      id: n.id,
      type: n.type,
      size: formatBytes(n.size),
    })));
  }

  return {
    nodes: sanitizedNodes,
    edges: sanitizedEdges,
    originalSize,
    sanitizedSize,
    removed,
  };
}

/**
 * Validate payload size is within acceptable limits
 */
export function validatePayloadSize(size: number): {
  valid: boolean;
  error?: string;
  warning?: string;
} {
  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB hard limit
  const WARN_SIZE = 5 * 1024 * 1024; // 5 MB warning threshold
  
  if (size > MAX_SIZE) {
    return {
      valid: false,
      error: `Payload too large (${formatBytes(size)}). Maximum is ${formatBytes(MAX_SIZE)}. Please reduce workflow complexity or contact support.`,
    };
  }
  
  if (size > WARN_SIZE) {
    return {
      valid: true,
      warning: `Large payload (${formatBytes(size)}). Save may be slow.`,
    };
  }
  
  return { valid: true };
}
