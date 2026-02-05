import { createServer } from './index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = createServer();
const port = process.env.PORT || 8080;

// In production, serve the built SPA files
const staticDir = path.resolve(__dirname, '../spa');

// Serve static files
app.use(express.static(staticDir));

// SPA fallback - serve index.html for all non-API routes  
app.use((req, res, next) => {
  // Don't serve index.html for API routes or static files
  if (req.path.startsWith('/api/') || req.path.startsWith('/ping') || req.path.includes('.')) {
    return next();
  }
  res.sendFile(path.resolve(staticDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 Frontend server running on http://localhost:${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully'); 
  process.exit(0);
});
