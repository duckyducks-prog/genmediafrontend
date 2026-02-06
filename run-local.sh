#!/bin/bash
# Run GenMedia locally

echo "🚀 Starting GenMedia locally..."
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.11+"
    exit 1
fi

if ! command -v uv &> /dev/null; then
    echo "❌ uv not found. Install with: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm not found. Install with: npm install -g pnpm"
    exit 1
fi

echo "✅ All prerequisites installed"
echo ""

# Backend setup
echo "📦 Setting up backend..."
cd backend

if [ ! -f "serviceAccountKey.json" ]; then
    echo "⚠️  serviceAccountKey.json not found!"
    echo "Please download it from Firebase Console → Project Settings → Service Accounts"
    echo "and save it as backend/serviceAccountKey.json"
    exit 1
fi

if [ ! -d ".venv" ]; then
    echo "Installing backend dependencies..."
    uv sync
fi

echo "✅ Backend ready"
echo ""

# Frontend setup
cd ../frontend
echo "📦 Setting up frontend..."

if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    pnpm install
fi

echo "✅ Frontend ready"
echo ""

# Start services
echo "🚀 Starting services..."
echo ""
echo "Backend will run on: http://localhost:8000"
echo "Frontend will run on: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both services"
echo ""

# Start backend in background
cd ../backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Give backend time to start
sleep 3

# Start frontend
cd ../frontend
pnpm dev

# Cleanup on exit
kill $BACKEND_PID 2>/dev/null
