#!/bin/bash

# RSA Store Startup Script
# This script will start both the main server and QRIS service

echo "========================================"
echo "🚀 Starting RSA Store"
echo "========================================"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found!${NC}"
    echo "Please copy .env.example to .env and configure it first:"
    echo "  cp .env.example .env"
    echo "  nano .env"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}📦 Installing Node.js dependencies...${NC}"
    npm install
fi

# Check if Python dependencies are installed
echo -e "${BLUE}🐍 Checking Python dependencies...${NC}"
python3 -c "import flask, flask_cors" 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${BLUE}📦 Installing Python dependencies...${NC}"
    pip3 install -r requirements.txt
fi

# Start QRIS Service in background
echo -e "${GREEN}🔧 Starting QRIS Calculation Service (Port 33416)...${NC}"
python3 qris-service.py &
QRIS_PID=$!

# Wait a bit for QRIS service to start
sleep 2

# Start Main Server
echo -e "${GREEN}📡 Starting Main Server (Port 33415)...${NC}"
node server.js &
MAIN_PID=$!

# Wait a bit for main server to start
sleep 3

echo ""
echo "========================================"
echo -e "${GREEN}✅ RSA Store Started Successfully!${NC}"
echo "========================================"
echo ""
echo "📡 Main Server: http://localhost:33415"
echo "🔧 QRIS Service: http://localhost:33416"
echo "🔐 Admin Panel: http://localhost:33415/admin/setup"
echo ""
echo "Process IDs:"
echo "  - Main Server: $MAIN_PID"
echo "  - QRIS Service: $QRIS_PID"
echo ""
echo "To stop the services, run:"
echo "  kill $MAIN_PID $QRIS_PID"
echo ""
echo "Or use PM2 for production:"
echo "  pm2 start ecosystem.config.js"
echo ""
echo "========================================"

# Keep script running
wait
