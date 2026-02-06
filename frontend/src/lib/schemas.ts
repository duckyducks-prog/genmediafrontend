import { z } from "zod";

/**
 * Zod schemas for API responses and form validation.
 * Provides runtime safety for data crossing the network boundary.
 */

// --- API Response Schemas ---

export const WorkflowMetadataSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string(),
  is_public: z.boolean(),
  thumbnail_ref: z.string().optional(),
  thumbnail: z.string().optional(),
  background_image: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  user_id: z.string().optional(),
  user_email: z.string().optional(),
  node_count: z.number().optional(),
  edge_count: z.number().optional(),
});

export const WorkflowListResponseSchema = z.object({
  workflows: z.array(WorkflowMetadataSchema),
});

export const SaveWorkflowResponseSchema = z.object({
  id: z.string(),
});

// --- Form Validation Schemas ---

export const WorkflowFormSchema = z.object({
  name: z
    .string()
    .min(1, "Workflow name is required")
    .max(100, "Name must be under 100 characters"),
  description: z
    .string()
    .max(500, "Description must be under 500 characters")
    .default(""),
  is_public: z.boolean().default(false),
});

export type WorkflowFormData = z.infer<typeof WorkflowFormSchema>;
