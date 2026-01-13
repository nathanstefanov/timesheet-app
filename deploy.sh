#!/bin/bash
# Quick deployment script for Vercel

echo "🚀 Deploying timesheet app to Vercel..."
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

echo "📦 Building locally first to check for errors..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo ""
    echo "🌐 Deploying to production..."
    vercel --prod
else
    echo "❌ Build failed! Fix errors before deploying."
    exit 1
fi
