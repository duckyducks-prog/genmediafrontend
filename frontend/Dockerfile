# =============================================================================
# Multi-stage Dockerfile for GCP Cloud Run
# =============================================================================
# Build: docker build -t genmedia-frontend .
# Run:   docker run -p 8080:8080 -e PORT=8080 genmedia-frontend
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files first (better layer caching)
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build arguments for client-side Firebase config (baked into the bundle)
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MEASUREMENT_ID
ARG VITE_ALLOWED_EMAILS
ARG VITE_API_BASE_URL

# Build the application
RUN pnpm run build

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling and enable pnpm
RUN apk add --no-cache dumb-init && \
    corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files for production install
COPY package.json pnpm-lock.yaml ./

# Install only production dependencies using pnpm (respects lockfile versions)
RUN pnpm install --prod --frozen-lockfile && pnpm store prune

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Switch to non-root user
USER nodejs

# Cloud Run uses PORT environment variable
ENV PORT=8080
ENV NODE_ENV=production

# Expose the port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/ping || exit 1

# Use dumb-init for proper PID 1 handling
ENTRYPOINT ["dumb-init", "--"]

# Start the Express server
CMD ["node", "dist/server/node-build.mjs"]
