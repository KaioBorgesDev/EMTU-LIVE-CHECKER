#!/bin/bash

# EMTU Live Checker Startup Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}$1${NC}"
}

# Print banner
print_header "
╔═══════════════════════════════════════╗
║           EMTU Live Checker           ║
║      🚌 Bus Tracking WhatsApp Bot     ║
╚═══════════════════════════════════════╝
"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js não está instalado. Por favor, instale Node.js 16 ou superior."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version)
print_status "Node.js version: $NODE_VERSION"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm não está instalado."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    print_warning "Arquivo .env não encontrado. Copiando de .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        print_status "Arquivo .env criado. Por favor, configure suas variáveis de ambiente."
    else
        print_error "Arquivo .env.example não encontrado."
        exit 1
    fi
fi

# Create necessary directories
print_status "Criando diretórios necessários..."
mkdir -p logs data sessions

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    print_status "Instalando dependências..."
    npm install
else
    print_status "Dependências já instaladas."
fi

# Check for updates
print_status "Verificando atualizações..."
npm outdated --depth=0 || true

# Environment check
print_status "Verificando configuração do ambiente..."

# Check if required environment variables are set
if [ ! -s .env ]; then
    print_warning "Arquivo .env está vazio. Configure as variáveis necessárias."
fi

# Port check
PORT=${PORT:-3000}
if lsof -i :$PORT > /dev/null 2>&1; then
    print_warning "Porta $PORT já está em uso. O aplicativo pode não iniciar corretamente."
fi

# Memory check
AVAILABLE_MEMORY=$(free -m | awk 'NR==2{printf "%.1f", $7*100/$2 }')
print_status "Memória disponível: ${AVAILABLE_MEMORY}%"

# Check if git is available and show version info
if command -v git &> /dev/null; then
    if [ -d .git ]; then
        BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
        COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        print_status "Git branch: $BRANCH"
        print_status "Git commit: $COMMIT"
    fi
fi

print_header "🚀 Iniciando EMTU Live Checker..."

# Function to handle cleanup
cleanup() {
    print_status "Finalizando aplicação..."
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start the application
if [ "$1" = "--dev" ]; then
    print_status "Iniciando em modo de desenvolvimento..."
    npm run dev
elif [ "$1" = "--pm2" ]; then
    print_status "Iniciando com PM2..."
    if ! command -v pm2 &> /dev/null; then
        print_error "PM2 não está instalado. Instale com: npm install -g pm2"
        exit 1
    fi
    pm2 start ecosystem.config.json
elif [ "$1" = "--docker" ]; then
    print_status "Iniciando com Docker..."
    if ! command -v docker &> /dev/null; then
        print_error "Docker não está instalado."
        exit 1
    fi
    docker-compose up -d
else
    print_status "Iniciando em modo de produção..."
    npm start
fi
