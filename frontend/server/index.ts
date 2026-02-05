import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();

  // Enable CORS for Cloud Run
  app.use(cors({
    origin: [
      'https://genmedia-frontend-otfo2ctxma-uc.a.run.app',
      'http://localhost:3000',
      'http://localhost:8080'
    ],
    credentials: true
  }));

  // Serve static files from the built React app
  const staticDir = path.resolve(__dirname, '../spa');
  app.use(express.static(staticDir));

  // Health check endpoint
  app.get('/ping', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // SPA fallback middleware - serve index.html for all non-API routes
  app.use((req, res, next) => {
    // Skip if it's an API route or static file
    if (req.path.startsWith('/api/') || req.path.startsWith('/ping') || req.path.includes('.')) {
      return next();
    }
    // Serve the SPA
    res.sendFile(path.resolve(staticDir, 'index.html'));
  });

  return app;
}
