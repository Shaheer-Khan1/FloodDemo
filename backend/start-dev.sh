#!/bin/bash

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "📝 Creating .env from template..."
    cp env.template .env
    echo "✅ .env file created. Please edit it with your Firebase credentials."
    echo ""
    echo "To get your Firebase credentials:"
    echo "1. Go to Firebase Console"
    echo "2. Project Settings > Service Accounts"
    echo "3. Generate New Private Key"
    echo "4. Copy the JSON content to .env"
    echo ""
    exit 1
fi

# Start the server
echo "🚀 Starting FloodWatch Backend API..."
npm run dev

