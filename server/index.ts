import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { setupWorkflowRoutes } from "./routes/workflows";
import { setupAssetRoutes } from "./routes/assets";
import { verifyStorageHealth } from "./workflow-storage-firestore";

export function createServer() {
  const app = express();

  // Verify workflow storage health on startup (async, non-blocking)
  verifyStorageHealth().catch((error) => {
    console.error("[Server] Firestore health check failed:", error);
  });

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: "50mb" })); // Increase limit for workflow data with images
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Workflow API routes
  setupWorkflowRoutes(app);

  // Asset proxy routes (bypasses CORS to Veo API)
  setupAssetRoutes(app);

  return app;
}
