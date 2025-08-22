const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');
const Logger = require('../utils/logger');

class WhatsAppService {
    constructor() {
        this.client = null;
        this.isReady = false;
        this.logger = new Logger();
        this.messageHandlers = [];
        this.sessionPath = process.env.WHATSAPP_SESSION_PATH || './sessions/whatsapp-session';
    }

    async initialize() {
        try {
            this.logger.info('Initializing WhatsApp client...');
            
            // Ensure session directory exists
            await fs.ensureDir(path.dirname(this.sessionPath));

            this.client = new Client({
                authStrategy: new LocalAuth({
                    clientId: "emtu-live-checker",
                    dataPath: this.sessionPath
                }),
                puppeteer: {
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--single-process',
                        '--disable-gpu'
                    ]
                }
            });

            this.setupEventHandlers();
            
            await this.client.initialize();
            this.logger.info('WhatsApp client initialized successfully');
            
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize WhatsApp client:', error);
            throw error;
        }
    }

    setupEventHandlers() {
        this.client.on('qr', (qr) => {
            console.log('\n🔗 WhatsApp QR Code:');
            qrcode.generate(qr, { small: true });
            console.log('\nScan the QR code above with your WhatsApp mobile app to connect.');
            this.logger.info('QR code generated for WhatsApp authentication');
        });

        this.client.on('ready', () => {
            this.isReady = true;
            this.logger.info('WhatsApp client is ready!');
            console.log('✅ WhatsApp connected successfully!');
        });

        this.client.on('authenticated', () => {
            this.logger.info('WhatsApp client authenticated');
            console.log('🔐 WhatsApp authenticated');
        });

        this.client.on('auth_failure', (msg) => {
            this.logger.error('WhatsApp authentication failed:', msg);
            console.error('❌ WhatsApp authentication failed:', msg);
        });

        this.client.on('disconnected', (reason) => {
            this.isReady = false;
            this.logger.warn('WhatsApp client disconnected:', reason);
            console.log('⚠️ WhatsApp disconnected:', reason);
        });

        this.client.on('message', async (message) => {
            try {
                // Skip status messages and group messages for now
                if (message.isStatus || message.from.includes('@g.us')) {
                    return;
                }

                this.logger.debug(`Received message from ${message.from}: ${message.body}`);
                
                // Call all registered message handlers
                for (const handler of this.messageHandlers) {
                    try {
                        await handler(message);
                    } catch (error) {
                        this.logger.error('Error in message handler:', error);
                    }
                }
            } catch (error) {
                this.logger.error('Error processing incoming message:', error);
            }
        });

        this.client.on('message_create', (message) => {
            // Log sent messages for debugging
            if (message.fromMe) {
                this.logger.debug(`Sent message to ${message.to}: ${message.body}`);
            }
        });
    }

    onMessage(handler) {
        if (typeof handler === 'function') {
            this.messageHandlers.push(handler);
        } else {
            throw new Error('Message handler must be a function');
        }
    }

    async sendMessage(chatId, message) {
        try {
            if (!this.isReady) {
                throw new Error('WhatsApp client is not ready');
            }

            const chat = await this.client.getChatById(chatId);
            await chat.sendMessage(message);
            
            this.logger.debug(`Message sent to ${chatId}: ${message.substring(0, 50)}...`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to send message to ${chatId}:`, error);
            throw error;
        }
    }

    async sendLocation(chatId, latitude, longitude, description = '') {
        try {
            if (!this.isReady) {
                throw new Error('WhatsApp client is not ready');
            }

            const location = new Location(latitude, longitude, description);
            await this.client.sendMessage(chatId, location);
            
            this.logger.debug(`Location sent to ${chatId}: ${latitude}, ${longitude}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to send location to ${chatId}:`, error);
            throw error;
        }
    }

    async getChatInfo(chatId) {
        try {
            if (!this.isReady) {
                throw new Error('WhatsApp client is not ready');
            }

            const chat = await this.client.getChatById(chatId);
            return {
                id: chat.id._serialized,
                name: chat.name || 'Unknown',
                isGroup: chat.isGroup,
                timestamp: chat.timestamp
            };
        } catch (error) {
            this.logger.error(`Failed to get chat info for ${chatId}:`, error);
            return null;
        }
    }

    async isValidChatId(chatId) {
        try {
            const chat = await this.getChatInfo(chatId);
            return chat !== null;
        } catch (error) {
            return false;
        }
    }

    async getChats() {
        try {
            if (!this.isReady) {
                throw new Error('WhatsApp client is not ready');
            }

            const chats = await this.client.getChats();
            return chats.map(chat => ({
                id: chat.id._serialized,
                name: chat.name || 'Unknown',
                isGroup: chat.isGroup,
                timestamp: chat.timestamp,
                unreadCount: chat.unreadCount
            }));
        } catch (error) {
            this.logger.error('Failed to get chats:', error);
            return [];
        }
    }

    async markAsRead(chatId) {
        try {
            if (!this.isReady) {
                throw new Error('WhatsApp client is not ready');
            }

            const chat = await this.client.getChatById(chatId);
            await chat.sendSeen();
            
            this.logger.debug(`Marked chat ${chatId} as read`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to mark chat ${chatId} as read:`, error);
            return false;
        }
    }

    async getClientInfo() {
        try {
            if (!this.isReady) {
                return null;
            }

            const info = this.client.info;
            return {
                wid: info.wid._serialized,
                pushname: info.pushname,
                phone: info.wid.user
            };
        } catch (error) {
            this.logger.error('Failed to get client info:', error);
            return null;
        }
    }

    isReady() {
        return this.isReady;
    }

    async restart() {
        try {
            this.logger.info('Restarting WhatsApp client...');
            
            if (this.client) {
                await this.client.destroy();
            }
            
            this.isReady = false;
            await this.initialize();
            
            this.logger.info('WhatsApp client restarted successfully');
            return true;
        } catch (error) {
            this.logger.error('Failed to restart WhatsApp client:', error);
            throw error;
        }
    }

    async destroy() {
        try {
            if (this.client) {
                this.isReady = false;
                await this.client.destroy();
                this.logger.info('WhatsApp client destroyed');
            }
        } catch (error) {
            this.logger.error('Error destroying WhatsApp client:', error);
        }
    }

    // Utility methods for message formatting
    formatBoldText(text) {
        return `*${text}*`;
    }

    formatItalicText(text) {
        return `_${text}_`;
    }

    formatCodeText(text) {
        return `\`${text}\``;
    }

    formatCodeBlock(text) {
        return `\`\`\`${text}\`\`\``;
    }

    createBulletList(items) {
        return items.map(item => `• ${item}`).join('\n');
    }

    createNumberedList(items) {
        return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
    }
}

module.exports = WhatsAppService;
