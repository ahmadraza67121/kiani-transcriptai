#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "============================================"
echo "   KIANI TRANSCRIPTAI"
echo "   YouTube Transcript Extractor"
echo "============================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js nahi mila!"
    echo ""
    echo "Node.js install karein:"
    echo "https://nodejs.org"
    echo ""
    exit 1
fi

echo "[OK] Node.js: $(node --version)"

# Check .env file
if [ ! -f ".env" ]; then
    echo "[INFO] .env file bana rahe hain..."
    echo "DATABASE_URL=" > .env
    echo "[OK] .env file ban gayi"
fi

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo ""
    echo "[INFO] Dependencies install ho rahi hain..."
    echo "[INFO] Pehli baar 2-3 minute lag sakte hain..."
    echo ""
    npm install
    echo ""
    echo "[OK] Dependencies install ho gayi!"
fi

echo ""
echo "============================================"
echo "   APP START HO RAHI HAI..."
echo ""
echo "   Browser mein kholein:"
echo "   http://localhost:3000"
echo ""
echo "   Band karne ke liye: Ctrl + C"
echo "============================================"
echo ""

npx next dev
