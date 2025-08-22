#!/bin/bash



set -e


RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' 


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


print_header "
╔═══════════════════════════════════════╗
║           EMTU Live Checker           ║
║      🚌 Bus Tracking WhatsApp Bot     ║
╚═══════════════════════════════════════╝
"


if ! command -v node &> /dev/null; then
    print_error "Node.js não está instalado. Por favor, instale Node.js 16 ou superior."
    exit 1
fi


NODE_VERSION=$(node --version)
print_status "Node.js version: $NODE_VERSION"


if ! command -v npm &> /dev/null; then
    print_error "npm não está instalado."
    exit 1
fi


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


print_status "Criando diretórios necessários..."
mkdir -p logs data sessions


if [ ! -d "node_modules" ]; then
    print_status "Instalando dependências..."
    npm install
else
    print_status "Dependências já instaladas."
fi


print_status "Verificando atualizações..."
npm outdated --depth=0 || true


print_status "Verificando configuração do ambiente..."


if [ ! -s .env ]; then
    print_warning "Arquivo .env está vazio. Configure as variáveis necessárias."
fi


PORT=${PORT:-3000}
if lsof -i :$PORT > /dev/null 2>&1; then
    print_warning "Porta $PORT já está em uso. O aplicativo pode não iniciar corretamente."
fi


AVAILABLE_MEMORY=$(free -m | awk 'NR==2{printf "%.1f", $7*100/$2 }')
print_status "Memória disponível: ${AVAILABLE_MEMORY}%"


if command -v git &> /dev/null; then
    if [ -d .git ]; then
        BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
        COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        print_status "Git branch: $BRANCH"
        print_status "Git commit: $COMMIT"
    fi
fi

print_header "🚀 Iniciando EMTU Live Checker..."


cleanup() {
    print_status "Finalizando aplicação..."
    exit 0
}


trap cleanup SIGINT SIGTERM


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
