import { Express, Request, Response } from "express";

const VEO_API_BASE_URL = "https://veo-api-otfo2ctxma-uc.a.run.app";

/**
 * Proxy routes for the Veo API assets endpoint
 * This bypasses CORS restrictions by making server-side requests
 */
export function setupAssetRoutes(app: Express) {
  // List all assets (GET /api/assets)
  app.get("/api/assets", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "No authorization header" });
      }

      const assetType = req.query.asset_type as string | undefined;
      const url = assetType
        ? `${VEO_API_BASE_URL}/v1/assets?asset_type=${encodeURIComponent(assetType)}`
        : `${VEO_API_BASE_URL}/v1/assets`;

      console.log(`[Assets Proxy] GET ${url}`);

      const response = await fetch(url, {
        headers: {
          Authorization: authHeader,
        },
      });

      const data = await response.json();
      console.log(`[Assets Proxy] Response status: ${response.status}, assets: ${data.assets?.length || 0}`);

      res.status(response.status).json(data);
    } catch (error) {
      console.error("[Assets Proxy] Error:", error);
      res.status(500).json({ error: "Failed to fetch assets" });
    }
  });

  // Get single asset (GET /api/assets/:id)
  app.get("/api/assets/:id", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "No authorization header" });
      }

      const { id } = req.params;
      const url = `${VEO_API_BASE_URL}/v1/assets/${encodeURIComponent(id)}`;

      console.log(`[Assets Proxy] GET ${url}`);

      const response = await fetch(url, {
        headers: {
          Authorization: authHeader,
        },
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      console.error("[Assets Proxy] Error:", error);
      res.status(500).json({ error: "Failed to fetch asset" });
    }
  });

  // Save asset (POST /api/assets)
  app.post("/api/assets", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "No authorization header" });
      }

      const url = `${VEO_API_BASE_URL}/v1/assets`;

      console.log(`[Assets Proxy] POST ${url}`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body),
      });

      const data = await response.json();
      console.log(`[Assets Proxy] POST response status: ${response.status}`);

      res.status(response.status).json(data);
    } catch (error) {
      console.error("[Assets Proxy] Error:", error);
      res.status(500).json({ error: "Failed to save asset" });
    }
  });

  // Delete asset (DELETE /api/assets/:id)
  app.delete("/api/assets/:id", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "No authorization header" });
      }

      const { id } = req.params;
      const url = `${VEO_API_BASE_URL}/v1/assets/${encodeURIComponent(id)}`;

      console.log(`[Assets Proxy] DELETE ${url}`);

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: authHeader,
        },
      });

      if (response.status === 204) {
        return res.status(204).send();
      }

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      console.error("[Assets Proxy] Error:", error);
      res.status(500).json({ error: "Failed to delete asset" });
    }
  });

  console.log("[Assets] Proxy routes registered: /api/assets");
}
