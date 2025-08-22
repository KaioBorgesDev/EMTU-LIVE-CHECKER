# EMTU Live Checker 🚌

Bot integrado com a API da EMTU para rastrear a localização de ônibus em tempo real via WhatsApp, enviando alertas personalizados quando o veículo se aproxima de uma parada predefinida.

## 🚀 Funcionalidades

- **📍 Rastreamento em Tempo Real**: Monitora a posição dos ônibus usando a API da EMTU
- **💬 Integração WhatsApp**: Interface completa via WhatsApp Web
- **🔔 Alertas Inteligentes**: Notificações quando o ônibus se aproxima da parada desejada
- **⚙️ Configuração Flexível**: Personalize distância de alerta, número máximo de alertas, etc.
- **📊 Estatísticas**: Acompanhe o histórico de alertas e monitoramentos
- **🛡️ Sistema Anti-Spam**: Cooldown entre alertas para evitar notificações excessivas
- **🔄 Monitoramento Contínuo**: Funciona 24/7 com múltiplas configurações simultâneas

## 📋 Pré-requisitos

- Node.js 16+ 
- NPM ou Yarn
- Chave da API EMTU (se disponível)
- WhatsApp instalado no celular

## 🛠️ Instalação

1. **Clone o repositório**
```bash
git clone https://github.com/KaioBorgesDev/EMTU-LIVE-CHECKER.git
cd EMTU-LIVE-CHECKER
```

2. **Instale as dependências**
```bash
npm install
```

3. **Configure as variáveis de ambiente**
```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:
```env
# EMTU API URLs and Keys
EMTU_API_BASE_URL=https://api.emtu.sp.gov.br (opcional)

# WhatsApp Configuration
WHATSAPP_SESSION_PATH=./sessions/whatsapp-session

# Server Configuration
PORT=3000
NODE_ENV=development

# Monitoring Configuration
CHECK_INTERVAL_MINUTES=1
PROXIMITY_THRESHOLD_METERS=500
MAX_ALERTS_PER_ROUTE=5

# Database Configuration
DB_PATH=./data/emtu-checker.db

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

4. **Inicie o bot**
```bash
npm start
```

5. **Conecte o WhatsApp**
   - Um QR Code será exibido no terminal
   - Escaneie o código com seu WhatsApp
   - Aguarde a confirmação de conexão

## 📱 Como Usar

### Comandos Disponíveis

#### 🔧 Configuração
- `/monitor [linha] [parada]` - Iniciar monitoramento de uma linha
- `/stop [linha]` - Parar monitoramento específico
- `/stop` - Parar todos os monitoramentos

#### 📋 Consultas
- `/list` - Listar monitoramentos ativos
- `/search [termo]` - Buscar linhas e paradas
- `/status` - Status dos monitoramentos
- `/where [linha] [sentido] ex: /where 708 volta` - Status dos monitoramentos

#### ℹ️ Ajuda
- `/help` ou `ajuda` - Mostrar comandos disponíveis

### Exemplos de Uso

**Iniciar monitoramento:**
```
/monitor 001 708 1
```

**Buscar linhas:**
```
/search terminal
```

**Parar monitoramento:**
```
/stop 001
```

## 🏗️ Arquitetura

```
src/
├── index.js                 # Aplicação principal
├── services/
│   ├── whatsapp.js          # Serviço WhatsApp Web
│   ├── emtu.js              # Integração API EMTU
│   └── alertManager.js      # Gerenciamento de alertas
└── utils/
    ├── configManager.js     # Gerenciamento de configurações
    └── logger.js            # Sistema de logs
```

## 🔧 Configurações Avançadas

### Intervalo de Verificação
```env
CHECK_INTERVAL_MINUTES=1  # Verifica a cada 1 minuto
```

### Distância de Alerta
```env
PROXIMITY_THRESHOLD_METERS=500  # Alerta quando ônibus está a 500m
```

### Limite de Alertas
```env
MAX_ALERTS_PER_ROUTE=5  # Máximo 5 alertas por linha por dia
```

## 🧪 Modo de Desenvolvimento

O sistema inclui dados mock para desenvolvimento quando a API da EMTU não está disponível.

```bash
npm run dev  # Inicia com nodemon para desenvolvimento
```

## 📊 Monitoramento

### Health Check
```bash
curl http://localhost:3000/health
```

### Status da Aplicação
```bash
curl http://localhost:3000/status
```

## 🗂️ Estrutura de Dados

### Configurações de Monitoramento
```json
{
  "chatId": "5511999999999@c.us",
  "routeId": "001",
  "routeNumber": "001",
  "stopId": "stop_001",
  "stopName": "Terminal São Mateus",
  "proximityThreshold": 500,
  "maxAlerts": 5,
  "createdAt": "2025-01-01T00:00:00.000Z",
  "isActive": true
}
```

### Alertas
```json
{
  "vehicleId": "vehicle_001",
  "distance": 300,
  "stopName": "Terminal São Mateus",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

## 🐛 Resolução de Problemas

### WhatsApp não conecta
1. Verifique se o QR Code foi escaneado corretamente
2. Certifique-se de que o WhatsApp Web está funcionando
3. Limpe o diretório de sessões: `rm -rf ./sessions/`

### API EMTU não responde
1. Verifique sua chave de API
2. O sistema usa dados mock automaticamente se a API falhar
3. Verifique os logs em `./logs/app.log`

### Bot não responde
1. Verifique se o WhatsApp está conectado: `/health`
2. Verifique os logs para erros
3. Reinicie o serviço

## 📝 Logs

Os logs são salvos em `./logs/app.log` com rotação automática:

```bash
tail -f ./logs/app.log  # Acompanhar logs em tempo real
```

## 🔒 Segurança

- Sessões WhatsApp são armazenadas localmente
- Dados pessoais não são compartilhados
- Use HTTPS em produção

## 🚀 Deploy em Produção

### Docker (Recomendado)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### PM2
```bash
npm install -g pm2
pm2 start src/index.js --name emtu-live-checker
pm2 save
pm2 startup
```

### Systemd
```ini
[Unit]
Description=EMTU Live Checker
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/path/to/emtu-live-checker
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🙏 Agradecimentos

- EMTU pela disponibilização da API
- Comunidade WhatsApp Web.js
- Todos os contribuidores do projeto

## 📞 Suporte

- Abra uma [issue](https://github.com/KaioBorgesDev/EMTU-LIVE-CHECKER/issues) para bugs
- Discussões no [GitHub Discussions](https://github.com/KaioBorgesDev/EMTU-LIVE-CHECKER/discussions)
- Documentação da [API EMTU](https://developer.emtu.sp.gov.br)

---

**Desenvolvido com ❤️ por [KaioBorgesDev](https://github.com/KaioBorgesDev)**
