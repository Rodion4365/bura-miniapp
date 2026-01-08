#!/bin/bash
set -e

echo "🚀 Deploying Bura MiniApp..."

# Проверка что мы в правильной директории
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: docker-compose.yml not found. Please run this script from the project root."
    exit 1
fi

# Проверка наличия .env файлов
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating from example..."
    cp .env.example .env
    echo "✏️  Please edit .env file with your domains and password:"
    echo "   nano .env"
    exit 1
fi

if [ ! -f "backend/.env" ]; then
    echo "⚠️  backend/.env file not found. Creating from example..."
    cp backend/.env.example backend/.env
    echo "✏️  Please edit backend/.env file with your BOT_TOKEN and password:"
    echo "   nano backend/.env"
    exit 1
fi

# Проверка сети web
if ! docker network ls | grep -q "web"; then
    echo "📡 Creating Docker network 'web'..."
    docker network create web
fi

# Сборка и запуск
echo "🔨 Building containers..."
docker-compose build

echo "🚀 Starting containers..."
docker-compose up -d

echo ""
echo "✅ Deployment completed!"
echo ""
echo "📊 Container status:"
docker-compose ps

echo ""
echo "📝 View logs:"
echo "   docker-compose logs -f"
echo ""
echo "🌐 Your application should be available at:"
echo "   Frontend: https://$(grep FRONTEND_HOST .env | cut -d '=' -f2)"
echo "   Backend:  https://$(grep BACKEND_HOST .env | cut -d '=' -f2)"
echo ""
echo "💾 To initialize database with existing data, run:"
echo "   docker exec -i bura-postgres psql -U postgres -d bura < init_data.sql"
