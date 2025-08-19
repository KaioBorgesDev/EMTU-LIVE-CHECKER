const fs = require('fs-extra');
const path = require('path');
const Logger = require('./Logger');

/**
 *Armazenar e gerenciar configurações personalizadas para diferentes chats/usuários
  que monitoram rotas específicas de transporte público (atualmente ônibus da EMTU).
 */

class ConfigManager {
    constructor() {
        this.logger = new Logger();
        this.configPath = process.env.DB_PATH?.replace('.db', '_config.json') || './data/configurations.json';
        this.configurations = new Map();
        this.initialize();
    }

    async initialize() {
        try {
            await fs.ensureDir(path.dirname(this.configPath));
            
            await this.loadConfigurations();
            
            this.logger.info('Configuration Manager initialized');
        } catch (error) {
            this.logger.error('Failed to initialize Configuration Manager:', error);
        }
    }

    async loadConfigurations() {
        try {
            if (await fs.pathExists(this.configPath)) {
                const data = await fs.readJson(this.configPath);
                
                if (data.configurations) {
                    for (const [key, config] of Object.entries(data.configurations)) {
                        this.configurations.set(key, {
                            ...config,
                            createdAt: new Date(config.createdAt),
                            lastUpdated: config.lastUpdated ? new Date(config.lastUpdated) : new Date(config.createdAt)
                        });
                    }
                }

                this.logger.debug(`Loaded ${this.configurations.size} monitoring configurations`);
            }
        } catch (error) {
            this.logger.error('Failed to load configurations from file:', error);
        }
    }

    async saveConfigurations() {
        try {
            const data = {
                configurations: {},
                lastUpdated: new Date().toISOString(),
                version: '1.0.0'
            };

            // Convert configurations Map to object
            for (const [key, config] of this.configurations.entries()) {
                data.configurations[key] = {
                    ...config,
                    createdAt: config.createdAt.toISOString(),
                    lastUpdated: config.lastUpdated ? config.lastUpdated.toISOString() : config.createdAt.toISOString()
                };
            }

            await fs.writeJson(this.configPath, data, { spaces: 2 });
            this.logger.debug('Configurations saved to file');
        } catch (error) {
            this.logger.error('Failed to save configurations to file:', error);
        }
    }

    generateConfigKey(chatId, routeNumber) {
        return `${chatId}_${routeNumber}`;
    }

    async saveConfiguration(chatId, routeNumber, config) {
        try {
            const key = this.generateConfigKey(chatId, routeNumber);
            
            const configToSave = {
                ...config,
                lastUpdated: new Date()
            };

            this.configurations.set(key, configToSave);
            await this.saveConfigurations();
            
            this.logger.info(`Configuration saved: ${chatId} - Route ${routeNumber}`);
            return true;
        } catch (error) {
            this.logger.error('Failed to save configuration:', error);
            return false;
        }
    }

    async getConfiguration(chatId, routeNumber) {
        try {
            const key = this.generateConfigKey(chatId, routeNumber);
            return this.configurations.get(key) || null;
        } catch (error) {
            this.logger.error('Failed to get configuration:', error);
            return null;
        }
    }

    async getActiveConfigurations(chatId) {
        try {
            const configs = [];
            
            for (const [key, config] of this.configurations.entries()) {
                if (key.startsWith(chatId + '_') && config.isActive) {
                    configs.push(config);
                }
            }

            // Sort by creation date (newest first)
            configs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            return configs;
        } catch (error) {
            this.logger.error('Failed to get active configurations:', error);
            return [];
        }
    }

    async getAllConfigurations() {
        try {
            const configs = [];
            
            for (const [key, config] of this.configurations.entries()) {
                configs.push({
                    key,
                    ...config
                });
            }

            return configs;
        } catch (error) {
            this.logger.error('Failed to get all configurations:', error);
            return [];
        }
    }

    async desactivateConfiguration(chatId, routeNumber) {
        try {
            const key = this.generateConfigKey(chatId, routeNumber);
            const config = this.configurations.get(key);
            
            if (config) {
                config.isActive = false;
                config.lastUpdated = new Date();
                this.configurations.set(key, config);
                await this.saveConfigurations();
                
                this.logger.info(`Configuration deactivated: ${chatId} - Route ${routeNumber}`);
                return true;
            }
            
            return false;
        } catch (error) {
            this.logger.error('Failed to deactivate configuration:', error);
            return false;
        }
    }

    async deactivateAllConfigurations(chatId) {
        try {
            let deactivatedCount = 0;
            
            for (const [key, config] of this.configurations.entries()) {
                if (key.startsWith(chatId + '_') && config.isActive) {
                    config.isActive = false;
                    config.lastUpdated = new Date();
                    this.configurations.set(key, config);
                    deactivatedCount++;
                }
            }
            
            if (deactivatedCount > 0) {
                await this.saveConfigurations();
                this.logger.info(`Deactivated ${deactivatedCount} configurations for chat ${chatId}`);
            }
            
            return deactivatedCount;
        } catch (error) {
            this.logger.error('Failed to deactivate all configurations:', error);
            return 0;
        }
    }

    async deleteConfiguration(chatId, routeNumber) {
        try {
            const key = this.generateConfigKey(chatId, routeNumber);
            const deleted = this.configurations.delete(key);
            
            if (deleted) {
                await this.saveConfigurations();
                this.logger.info(`Configuration deleted: ${chatId} - Route ${routeNumber}`);
            }
            
            return deleted;
        } catch (error) {
            this.logger.error('Failed to delete configuration:', error);
            return false;
        }
    }

    async deleteAllConfigurations(chatId) {
        try {
            let deletedCount = 0;
            
            for (const key of this.configurations.keys()) {
                if (key.startsWith(chatId + '_')) {
                    this.configurations.delete(key);
                    deletedCount++;
                }
            }
            
            if (deletedCount > 0) {
                await this.saveConfigurations();
                this.logger.info(`Deleted ${deletedCount} configurations for chat ${chatId}`);
            }
            
            return deletedCount;
        } catch (error) {
            this.logger.error('Failed to delete all configurations:', error);
            return 0;
        }
    }
}

module.exports = ConfigManager;
