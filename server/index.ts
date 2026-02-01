import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { setupAssetRoutes } from "./routes/assets";

// CORS configuration - restrict to allowed origins
// Set ALLOWED_ORIGINS env var to comma-separated list of origins
// Set to '*' to allow all origins (not recommended for production)
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [
  'http://localhost:3000',
  'http://localhost:5173',
];

// Security headers middleware
const securityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  // HSTS: Force HTTPS connections (1 year)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // XSS protection (legacy but still useful)
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Permissions policy (restrict browser features)
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
};

export function createServer() {
  const app = express();

  // Middleware
  app.use(securityHeaders);
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      // Allow all if explicitly set to '*'
      if (allowedOrigins.includes('*')) return callback(null, true);
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: Origin ${origin} not allowed`), false);
    },
    credentials: true
  }));
  app.use(express.json({ limit: "50mb" })); // Increase limit for workflow data with images
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Asset proxy routes (bypasses CORS to Veo API)
  setupAssetRoutes(app);

  return app;
}
