const WhatsApp = require('./services/whatsapp');
const EMTUService = require('./services/emtu');
const AlertManager = require('./services/alertManager');
const ConfigManager = require('./utils/configManager');
const Logger = require('./utils/logger');
const express = require('express');
require('dotenv').config();

class EMTULiveChecker {
    constructor() {
        this.whatsapp = new WhatsApp();
        this.emtuService = new EMTUService();
        this.alertManager = new AlertManager();
        this.configManager = new ConfigManager();
        this.logger = new Logger();
        this.app = express();
        this.isRunning = false;
        this.monitoringIntervals = new Map();
    }

    async initialize() {
        try {
            this.logger.info('Initializing EMTU Live Checker...');
            
            await this.whatsapp.initialize();
            
            this.setupExpressServer();
            
            this.setupMessageHandlers();
            
            await this.configManager.loadConfigurations();
            
            this.logger.info('EMTU Live Checker initialized successfully');
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize EMTU Live Checker:', error);
            return false;
        }
    }

    setupExpressServer() {
        this.app.use(express.json());
        
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'running',
                uptime: process.uptime(),
                whatsappReady: this.whatsapp.isReady(),
                activeMonitors: this.monitoringIntervals.size
            });
        });

        this.app.get('/status', (req, res) => {
            res.json({
                monitoredRoutes: Array.from(this.monitoringIntervals.keys()),
                configurations: this.configManager.getAllConfigurations()
            });
        });

        const port = process.env.PORT || 3000;
        this.app.listen(port, () => {
            this.logger.info(`Server running on port ${port}`);
        });
    }

    setupMessageHandlers() {
        this.whatsapp.onMessage(async (message) => {
            try {
                const response = await this.handleUserMessage(message);
                if (response) {
                    await this.whatsapp.sendMessage(message.from, response);
                }   
            } catch (error) {
                this.logger.error('Error handling message:', error);
                await this.whatsapp.sendMessage(
                    message.from, 
                    'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.'
                );
            }
        });
    }

    async handleUserMessage(message) {
        const text = message.body.toLowerCase().trim();
        const chatId = message.from;

        if (text === '/help' || text === 'ajuda') {
            return this.getHelpMessage();
        }

        if (text.startsWith('/monitor')) {
            return await this.handleMonitorCommand(text, chatId);
        }

        
        if (text.startsWith('/stop')) {
            return await this.handleStopCommand(text, chatId);
        }

        
        if (text === '/list' || text === 'listar') {
            return await this.handleListCommand(chatId);
        }

        
        if (text.startsWith('/search') || text.startsWith('buscar')) {
            return await this.handleSearchCommand(text);
        }

        if (text === '/status') {
            return await this.handleStatusCommand(chatId);
        }

        if (text.startsWith('/where')) {
            return await this.handleWhereCommand(text, chatId);
        }

        return 'Comando não reconhecido. Digite "ajuda" para ver os comandos disponíveis.';
    }

    getHelpMessage() {
        return `🚌 *EMTU Live Checker - Comandos Disponíveis:*

        📍 *Monitoramento:*
        • \`/monitor [linha] [parada]\` - Iniciar monitoramento
        • \`/stop [linha]\` - Parar monitoramento
        • \`/list\` - Listar monitoramentos ativos
        • \`/where [ida/volta] [linha]\` - Listar localizações dos ônibus.


        🔍 *Consultas:*
        • \`/search [termo]\` - Buscar linhas/paradas
        • \`/status\` - Status dos monitoramentos

        ℹ️ *Ajuda:*
        • \`/help\` ou \`ajuda\` - Mostrar esta mensagem

        *Exemplo de uso:*
        \`/monitor 001 Terminal São Mateus\`

        O bot irá te notificar quando o ônibus estiver próximo da parada configurada! 🔔`;
    }

    async handleWhereCommand(text, chatId) {
        const parts = text.split(' ').slice(1);
        
        if (parts.length < 1) {
            return 'Uso correto: `/where [linha] [ida/volta]`\nExemplo: `/where 708BI2 ida`';
        }

        const routeNumber = parts[0];
        const direction = parts[1]; 
        try {
            const vehicles = await this.emtuService.getVehiclePositions(routeNumber);
            
            if (!vehicles || vehicles.length === 0) {
                return `❌ Nenhum veículo encontrado para a linha "${routeNumber}" ou linha não existe.`;
            }

            let filteredVehicles = vehicles;
            if (direction && (direction === 'ida' || direction === 'volta')) {
                filteredVehicles = vehicles.filter(vehicle => 
                    vehicle.sentidoLinha && vehicle.sentidoLinha.toLowerCase() === direction.toLowerCase()
                );
                
                if (filteredVehicles.length === 0) {
                    return `❌ Nenhum veículo encontrado no sentido "${direction}" para a linha "${routeNumber}".`;
                }
            }

            let response = `📍 *Localizações dos ônibus da linha ${routeNumber}`;
            if (direction) {
                response += ` - Sentido ${direction}`;
            }
            response += ':*\n\n';
            
            // Enviar localização primeiro, depois a mensagem de texto
            for (let i = 0; i < filteredVehicles.length; i++) {
                const vehicle = filteredVehicles[i];
                
                await this.whatsapp.sendLocation(
                    chatId,
                    vehicle.latitude,
                    vehicle.longitude,
                    `🚌 ${vehicle.prefixo} - Linha ${routeNumber} - ${vehicle.empresa}`
                );
                
                response += `🚌 *Veículo ${i + 1}:*\n`;
                response += `🆔 ID: ${vehicle.idVeiculo || vehicle.prefixo}\n`;
                response += `🚗 Prefixo: ${vehicle.prefixo}\n`;
                response += `🏷️ Placa: ${vehicle.placa}\n`;
                response += `🏢 Empresa: ${vehicle.empresa}\n`;
                response += `➡️ Sentido: ${vehicle.sentidoLinha}\n`;
                const dataTransmissao = new Date(vehicle.dataUltimaTransmissao);
                response += `📡 Última transmissão: ${dataTransmissao.toLocaleString('pt-BR')}\n\n`;
            }

            response += `📊 Total de veículos em operação: ${filteredVehicles.length}`;
            return response;

        } catch (error) {
            this.logger.error('Error in where command:', error);
            return '❌ Erro ao buscar localizações dos veículos. Tente novamente.';
        }
    }

    async handleMonitorCommand(text, chatId) {
        const parts = text.split(' ').slice(1);
        
        if (parts.length < 2) {
            return 'Uso correto: `/monitor [linha] [parada]`\nExemplo: `/monitor 001 Terminal São Mateus`';
        }

        const routeNumber = parts[0];
        const stopName = parts.slice(1).join(' ');

        try {
            const route = await this.emtuService.findRoute(routeNumber);
            if (!route) {
                return `❌ Linha "${routeNumber}" não encontrada.
                Use \`/search ${routeNumber}\` para buscar linhas similares.`;
            }

            const stop = await this.emtuService.findStop(stopName, route.id);
            if (!stop) {
                return `❌ Parada "${stopName}" não encontrada na linha ${routeNumber}. 
                Use \`/search ${stopName}\` para buscar paradas.`;
            }

            const config = {
                chatId,
                routeId: route.id,
                routeNumber: route.number,
                stopId: stop.id,
                stopName: stop.name,
                proximityThreshold: parseInt(process.env.PROXIMITY_THRESHOLD_METERS) || 500,
                maxAlerts: parseInt(process.env.MAX_ALERTS_PER_ROUTE) || 5,
                createdAt: new Date(),
                isActive: true
            };

            await this.configManager.saveConfiguration(chatId, routeNumber, config);

            await this.startMonitoring(config);

            return `✅ Monitoramento iniciado!
                🚌 Linha: ${route.number} - ${route.name}
                📍 Parada: ${stop.name}
                📏 Distância de alerta: ${config.proximityThreshold}m

            Você será notificado quando um ônibus estiver se aproximando da parada.`;

        } catch (error) {
            this.logger.error('Error in monitor command:', error);
            return '❌ Erro ao configurar monitoramento. Tente novamente.';
        }
    }

    async handleStopCommand(text, chatId) {
        const parts = text.split(' ').slice(1); 
        
        if (parts.length === 0) {
            
            const stopped = await this.stopAllMonitoring(chatId);
            return stopped > 0 
                ? `✅ ${stopped} monitoramento(s) interrompido(s).`
                : '❌ Nenhum monitoramento ativo encontrado.';
        }

        const routeNumber = parts[0];
        const stopped = await this.stopMonitoring(chatId, routeNumber);
        
        return stopped 
            ? `✅ Monitoramento da linha ${routeNumber} interrompido.`
            : `❌ Nenhum monitoramento ativo encontrado para a linha ${routeNumber}.`;
    }

    async handleListCommand(chatId) {
        const configs = await this.configManager.getActiveConfigurations(chatId);
        
        if (configs.length === 0) {
            return '📋 Nenhum monitoramento ativo.\n\nUse `/monitor [linha] [parada]` para iniciar um monitoramento.';
        }

        let response = '📋 *Monitoramentos Ativos:*\n\n';
        configs.forEach((config, index) => {
            response += `${index + 1}. 🚌 Linha ${config.routeNumber}\n`;
            response += `   📍 Parada: ${config.stopName}\n`;
            response += `   📏 Distância: ${config.proximityThreshold}m\n`;
            response += `   ⏰ Desde: ${config.createdAt.toLocaleString('pt-BR')}\n\n`;
        });

        response += 'Use `/stop [linha]` para parar um monitoramento específico.';
        return response;
    }

    async handleSearchCommand(text) {
        const searchTerm = text.split(' ').slice(1).join(' ');

        if (!searchTerm) {
            return 'Uso correto: `/search [termo]`\nExemplo: `/search 708`';
        }

        try {
            const result = await this.emtuService.findRoute(searchTerm);

            if (!result || !result.linhas || result.linhas.length === 0) {
                return `❌ Nenhuma linha encontrada para "${searchTerm}".`;
            }

            let response = `🔍 *Resultados da busca por "${searchTerm}":*\n\n`;

            result.linhas.forEach(linha => {
                response += `🚌 *Linha:* ${linha.codigo} - ${linha.consorcio}\n`;
                response += `  Tarifa: R$${linha.tarifa}\n`;
                response += `  Status: ${linha.status}\n`;
                if (linha.veiculos && linha.veiculos.length > 0) {
                    response += 'Veículos em operação:\n';
                    linha.veiculos.forEach(veic => {
                        response += `    • Prefixo: ${veic.prefixo}, Placa: ${veic.placa},
                        Empresa: ${veic.empresa}, Sentido: ${veic.sentidoLinha}\n`;
                    });
                }
                if (linha.rotas && linha.rotas.length > 0) {
                    linha.rotas.forEach(rota => {
                        response += `  Sentido: ${rota.sentido}\n`;
                        response += `  Destino: ${rota.destino}\n`;
                        response += 'Pontos de parada:\n';
                        rota.pontos.slice(0, 5).forEach(ponto => {
                            response += `    • ${ponto.endereco}\n`;
                        });
                        if (rota.pontos.length > 5) {
                            response += `    ... e mais ${rota.pontos.length - 5} pontos\n`;
                        }
                        response += `  Horários: ${rota.horarios}\n`;
                    });
                }
                response += '\n';
            });
            return response;
        } catch (error) {
            console.log(error);
            return '❌ Erro ao realizar busca. Tente novamente.';
        }
    }

    async handleStatusCommand(chatId) {
        const configs = await this.configManager.getActiveConfigurations(chatId);
        const alertStats = await this.alertManager.getAlertStatistics(chatId);

        return `📊 *Status do Sistema:*
            👤 *Seus monitoramentos:* ${configs.length}
            🔔 *Alertas enviados hoje:* ${alertStats.today}
            📈 *Total de alertas:* ${alertStats.total}
            ⏱️ *Sistema ativo há:* ${this.formatUptime(process.uptime())}
            ✅ *Status:* Online

        Use \`/list\` para ver detalhes dos monitoramentos ativos.`;
    }

    async startMonitoring(config) {
        const key = `${config.chatId}_${config.routeNumber}`;
        
        
        if (this.monitoringIntervals.has(key)) {
            clearInterval(this.monitoringIntervals.get(key));
        }

        
        const interval = setInterval(async () => {
            try {
                await this.checkBusProximity(config);
            } catch (error) {
                this.logger.error(`Monitoring error for ${key}:`, error);
            }
        }, (parseInt(process.env.CHECK_INTERVAL_MINUTES) || 1) * 60 * 1000);

        this.monitoringIntervals.set(key, interval);
        this.logger.info(`Started monitoring for route ${config.routeNumber} (chat: ${config.chatId})`);
    }

    async stopMonitoring(chatId, routeNumber) {
        const key = `${chatId}_${routeNumber}`;
        
        if (this.monitoringIntervals.has(key)) {
            clearInterval(this.monitoringIntervals.get(key));
            this.monitoringIntervals.delete(key);
            await this.configManager.deactivateConfiguration(chatId, routeNumber);
            this.logger.info(`Stopped monitoring for route ${routeNumber} (chat: ${chatId})`);
            return true;
        }
        
        return false;
    }

    async stopAllMonitoring(chatId) {
        let stoppedCount = 0;
        
        for (const [key, interval] of this.monitoringIntervals.entries()) {
            if (key.startsWith(chatId + '_')) {
                clearInterval(interval);
                this.monitoringIntervals.delete(key);
                stoppedCount++;
            }
        }
        
        if (stoppedCount > 0) {
            await this.configManager.deactivateAllConfigurations(chatId);
        }
        
        return stoppedCount;
    }

    async checkBusProximity(config) {
        try {
            const vehicles = await this.emtuService.getVehiclePositions(config.routeId);
            const stopLocation = await this.emtuService.getStopLocation(config.stopId);

            for (const vehicle of vehicles) {
                const distance = this.calculateDistance(
                    vehicle.latitude,
                    vehicle.longitude,
                    stopLocation.latitude,
                    stopLocation.longitude
                );

                if (distance <= config.proximityThreshold) {
                    const shouldSendAlert = await this.alertManager.shouldSendAlert(
                        config.chatId,
                        config.routeId,
                        vehicle.id,
                        config.maxAlerts
                    );

                    if (shouldSendAlert) {
                        await this.sendProximityAlert(config, vehicle, distance);
                        await this.alertManager.recordAlert(
                            config.chatId,
                            config.routeId,
                            vehicle.id,
                            distance
                        );
                    }
                }
            }
        } catch (error) {
            this.logger.error('Error checking bus proximity:', error);
        }
    }

    async sendProximityAlert(config, vehicle, distance) {
        const message = `🔔 *Alerta de Proximidade!*

🚌 Linha: ${config.routeNumber}
📍 Parada: ${config.stopName}
📏 Distância: ${Math.round(distance)}m
🚗 Veículo: ${vehicle.id}
⏰ ${new Date().toLocaleTimeString('pt-BR')}

O ônibus está se aproximando da sua parada!`;

        await this.whatsapp.sendMessage(config.chatId, message);
        this.logger.info(`Proximity alert sent to ${config.chatId} for route ${config.routeNumber}`);
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; 
    }

    formatUptime(uptime) {
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }

    async shutdown() {
        this.logger.info('Shutting down EMTU Live Checker...');
        
        
        for (const interval of this.monitoringIntervals.values()) {
            clearInterval(interval);
        }
        this.monitoringIntervals.clear();

        
        if (this.whatsapp) {
            await this.whatsapp.destroy();
        }

        this.logger.info('EMTU Live Checker shut down successfully');
    }
}


async function main() {
    const checker = new EMTULiveChecker();
    
    
    process.on('SIGINT', async () => {
        console.log('\nReceived SIGINT, shutting down gracefully...');
        await checker.shutdown();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('\nReceived SIGTERM, shutting down gracefully...');
        await checker.shutdown();
        process.exit(0);
    });

    
    const initialized = await checker.initialize();
    if (!initialized) {
        console.error('Failed to initialize application');
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('Application startup error:', error);
        process.exit(1);
    });
}

module.exports = EMTULiveChecker;
