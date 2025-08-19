const ConfigManager = require('../utils/ConfigManager');

class MessageHandler {
    #whatsapp;
    #emtuService;
    #configManager;

    constructor(wppService, emtuService){
        this.#whatsapp = wppService;
        this.#emtuService = emtuService;
        this.#configManager = new ConfigManager();
    }

    setupMessageHandlers() {
        this.#whatsapp.onMessage(async (message) => {
            try {
                const response = await this.handleUserMessage(message);
                if (response) {
                    await this.#whatsapp.sendMessage(message.from, response);
                }
            } catch (error) {
                this.logger.error('Error handling message:', error);
                await this.#whatsapp.sendMessage(
                    message.from, 
                    'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.'
                );
            }
        });
    }

    async handleUserMessage(message) {
        const text = message.body.toLowerCase().trim();
        const chatId = message.from;

        // Help command
        if (text === '/help' || text === 'ajuda') {
            return this.getHelpMessage();
        }

        // Start monitoring command
        if (text.startsWith('/monitor')) {
            return await this.handleMonitorCommand(text, chatId);
        }

        // Stop monitoring command
        if (text.startsWith('/stop')) {
            return await this.handleStopCommand(text, chatId);
        }

        // List active monitors
        if (text === '/list' || text === 'listar') {
            return await this.handleListCommand(chatId);
        }

        // Search routes
        if (text.startsWith('/search') || text.startsWith('buscar')) {
            return await this.handleSearchCommand(text);
        }

        // Status command
        if (text === '/status') {
            return await this.handleStatusCommand(chatId);
        }

        return 'Comando não reconhecido. Digite "ajuda" para ver os comandos disponíveis.';
    }

    getHelpMessage() {
        return `
        
        🚌 *EMTU Live Checker - Comandos Disponíveis:*
        
        📍 *Monitoramento:*
        • \`/monitor [linha] [parada]\` - Iniciar monitoramento
        • \`/stop [linha]\` - Parar monitoramento
        • \`/list\` - Listar monitoramentos ativos

        🔍 *Consultas:*
        • \`/search [termo]\` - Buscar linhas/paradas
        • \`/status\` - Status dos monitoramentos

        ℹ️ *Ajuda:*
        • \`/help\` ou \`ajuda\` - Mostrar esta mensagem

        *Exemplo de uso:*
        \`/monitor 001 Terminal São Mateus\`

        O bot irá te notificar quando o ônibus estiver próximo da parada configurada! 🔔`;
    }

    async handleMonitorCommand(text, chatId) {
        const parts = text.split(' ').slice(1); // Remove '/monitor'
        
        if (parts.length < 4) {
            // eslint-disable-next-line max-len
            return 'Uso correto: `/monitor [linha] [numero ponto] [sentido] [hora]`\nExemplo: `/monitor 709 01 volta 09:00`';
        }

        const routeNumber = parts[0];
        const stopName = parts[1];
        const way = (parts[2]).toLowerCase();
        const timeTrigger = parts[3];

        try {
            // Validate route and stop
            const route = await this.#emtuService.findRoute(routeNumber);

            if (!route) {
                return `❌ Linha "${routeNumber}" não encontrada. 
                Use \`/search ${routeNumber}\` para buscar linhas similares.`;
            }

            if (!way.includes(['ida', 'volta'])){
                return `❌ Sentido "${way}". 
                Use ida ou volta para buscar linhas similares.`;
            }
            const testTime = timeTrigger.split(':');
            if(testTime.length < 1){
                return `❌ Tempo "${timeTrigger}". 
                Use este formato HH:MM. exemplo: 10:30 (Dez horas e trinta minutos)`;
            }
            const stop = await this.#emtuService.findStop(stopName, route.id);
            if (!stop) {
                return `❌ Parada "${stopName}" não encontrada na linha ${routeNumber}.
                Use \`/search ${stopName}\` para buscar paradas.`;
            }

            // Create monitoring configuration
            const config = {
                chatId,
                routeId: route.id,
                routeNumber: route.number,
                stopId: stop.id,
                stopName: stop.name,
                triggerTime: timeTrigger,
                way: way,
                proximityThreshold: parseInt(process.env.PROXIMITY_THRESHOLD_METERS) || 500,
                maxAlerts: parseInt(process.env.MAX_ALERTS_PER_ROUTE) || 5,
                createdAt: new Date(),
                isActive: true
            };

            await this.#configManager.saveConfiguration(chatId, routeNumber, config);

            await this.startMonitoring(config);

            return `✅ Monitoramento iniciado!
            🚌 Linha: ${route.number} - ${route.name}
            📍 Parada: ${stop.name}
            📏 Distância de alerta: ${config.proximityThreshold}m

            Você será notificado quando um ônibus estiver se aproximando da parada.
            
            `;

        } catch (error) {
            this.logger.error('Error in monitor command:', error);
            return '❌ Erro ao configurar monitoramento. Tente novamente.';
        }
    }

    async handleStopCommand(text, chatId) {
        const parts = text.split(' ').slice(1); // Remove '/stop'
        
        if (parts.length === 0) {
            // Stop all monitoring for this chat
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
        const configs = await this.#configManager.getActiveConfigurations(chatId);
        
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
        const searchTerm = text.split(' ').slice(1).join(' '); // Remove '/search' or 'buscar'
        
        if (!searchTerm) {
            return 'Uso correto: `/search [termo]`\nExemplo: `/search terminal`';
        }

        try {
            const [routes, stops] = await Promise.all([
                this.#emtuService.searchRoutes(searchTerm),
                this.#emtuService.searchStops(searchTerm)
            ]);

            let response = `🔍 *Resultados da busca por "${searchTerm}":*\n\n`;

            if (routes.length > 0) {
                response += '🚌 *Linhas encontradas:*\n';
                routes.slice(0, 5).forEach(route => {
                    response += `• ${route.number} - ${route.name}\n`;
                });
                if (routes.length > 5) {
                    response += `... e mais ${routes.length - 5} linhas\n`;
                }
                response += '\n';
            }

            if (stops.length > 0) {
                response += '📍 *Paradas encontradas:*\n';
                stops.slice(0, 5).forEach(stop => {
                    response += `• ${stop.name}\n`;
                });
                if (stops.length > 5) {
                    response += `... e mais ${stops.length - 5} paradas\n`;
                }
            }

            if (routes.length === 0 && stops.length === 0) {
                response += '❌ Nenhum resultado encontrado.';
            }

            return response;
        } catch (error) {
            this.logger.error('Error in search command:', error);
            return '❌ Erro ao realizar busca. Tente novamente.';
        }
    }

    async handleStatusCommand(chatId) {
        const configs = await this.#configManager.getActiveConfigurations(chatId);
        const alertStats = await this.alertManager.getAlertStatistics(chatId);

        return `
                📊 *Status do Sistema:*
        👤 *Seus monitoramentos:* ${configs.length}
        🔔 *Alertas enviados hoje:* ${alertStats.today}
        📈 *Total de alertas:* ${alertStats.total}
        ⏱️ *Sistema ativo há:* ${this.formatUptime(process.uptime())}
        ✅ *Status:* Online

        Use \`/list\` para ver detalhes dos monitoramentos ativos.`;
    }
}

module.exports = MessageHandler;