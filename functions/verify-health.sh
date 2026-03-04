#!/bin/bash
# Health Check Verification Script for Firebase Cloud Functions

set -e

echo "🔍 Driiva Firebase Functions Health Check"
echo "=========================================="
echo ""

# Step 1: Build functions
echo "📦 Building functions..."
cd "$(dirname "$0")"
npm run build

# Step 2: Check exports
echo ""
echo "✅ Checking exports in lib/index.js..."
if grep -q "health" lib/index.js; then
  echo "   ✓ health function found in exports"
else
  echo "   ✗ health function NOT found in exports"
  exit 1
fi

# Step 3: Start emulator (optional - uncomment to test locally)
# echo ""
# echo "🚀 Starting Firebase emulator..."
# firebase emulators:start --only functions &
# EMULATOR_PID=$!
# sleep 5
# 
# echo ""
# echo "🧪 Testing health endpoint locally..."
# curl -s http://localhost:5001/driiva/europe-west2/health | jq
# 
# kill $EMULATOR_PID

# Step 4: Instructions for deployment
echo ""
echo "📋 Deployment Instructions:"
echo "   1. Deploy health function only:"
echo "      firebase deploy --only functions:health"
echo ""
echo "   2. Test deployed endpoint:"
echo "      curl https://europe-west2-driiva.cloudfunctions.net/health"
echo ""
echo "   3. Check function logs:"
echo "      firebase functions:log --only health"
echo ""
echo "✅ Health check function is ready for deployment!"
