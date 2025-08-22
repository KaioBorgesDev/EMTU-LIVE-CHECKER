const fs = require('fs-extra');
const path = require('path');
const Logger = require('./logger');

class ConfigManager {
    constructor() {
        this.logger = new Logger();
        this.configPath = process.env.DB_PATH?.replace('.db', '_config.json') || './data/configurations.json';
        this.configurations = new Map();
        this.initialize();
    }

    async initialize() {
        try {
            // Ensure data directory exists
            await fs.ensureDir(path.dirname(this.configPath));
            
            // Load existing configurations
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

    async deactivateConfiguration(chatId, routeNumber) {
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

    async updateConfiguration(chatId, routeNumber, updates) {
        try {
            const key = this.generateConfigKey(chatId, routeNumber);
            const config = this.configurations.get(key);
            
            if (config) {
                const updatedConfig = {
                    ...config,
                    ...updates,
                    lastUpdated: new Date()
                };
                
                this.configurations.set(key, updatedConfig);
                await this.saveConfigurations();
                
                this.logger.info(`Configuration updated: ${chatId} - Route ${routeNumber}`);
                return updatedConfig;
            }
            
            return null;
        } catch (error) {
            this.logger.error('Failed to update configuration:', error);
            return null;
        }
    }

    async getConfigurationsByRoute(routeId) {
        try {
            const configs = [];
            
            for (const [key, config] of this.configurations.entries()) {
                if (config.routeId === routeId && config.isActive) {
                    configs.push({
                        key,
                        ...config
                    });
                }
            }
            
            return configs;
        } catch (error) {
            this.logger.error('Failed to get configurations by route:', error);
            return [];
        }
    }

    async getStatistics() {
        try {
            const stats = {
                totalConfigurations: this.configurations.size,
                activeConfigurations: 0,
                uniqueChats: new Set(),
                uniqueRoutes: new Set(),
                configurationsToday: 0
            };

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (const [key, config] of this.configurations.entries()) {
                if (config.isActive) {
                    stats.activeConfigurations++;
                }
                
                const [chatId] = key.split('_');
                stats.uniqueChats.add(chatId);
                stats.uniqueRoutes.add(config.routeId);
                
                if (new Date(config.createdAt) >= today) {
                    stats.configurationsToday++;
                }
            }

            return {
                total: stats.totalConfigurations,
                active: stats.activeConfigurations,
                uniqueChats: stats.uniqueChats.size,
                uniqueRoutes: stats.uniqueRoutes.size,
                createdToday: stats.configurationsToday
            };
        } catch (error) {
            this.logger.error('Failed to get configuration statistics:', error);
            return {
                total: 0,
                active: 0,
                uniqueChats: 0,
                uniqueRoutes: 0,
                createdToday: 0
            };
        }
    }

    async cleanupOldConfigurations(daysOld = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);
            
            let cleanedCount = 0;
            
            for (const [key, config] of this.configurations.entries()) {
                // Clean up inactive configurations older than specified days
                if (!config.isActive && new Date(config.lastUpdated) < cutoffDate) {
                    this.configurations.delete(key);
                    cleanedCount++;
                }
            }
            
            if (cleanedCount > 0) {
                await this.saveConfigurations();
                this.logger.info(`Cleaned up ${cleanedCount} old configurations`);
            }
            
            return cleanedCount;
        } catch (error) {
            this.logger.error('Failed to cleanup old configurations:', error);
            return 0;
        }
    }

    async exportConfigurations(chatId = null) {
        try {
            const configs = [];
            
            for (const [key, config] of this.configurations.entries()) {
                if (!chatId || key.startsWith(chatId + '_')) {
                    configs.push({
                        key,
                        ...config,
                        createdAt: config.createdAt.toISOString(),
                        lastUpdated: config.lastUpdated ? config.lastUpdated.toISOString() : config.createdAt.toISOString()
                    });
                }
            }
            
            return {
                configurations: configs,
                exportedAt: new Date().toISOString(),
                totalCount: configs.length
            };
        } catch (error) {
            this.logger.error('Failed to export configurations:', error);
            return {
                configurations: [],
                exportedAt: new Date().toISOString(),
                totalCount: 0
            };
        }
    }

    async importConfigurations(data, overwrite = false) {
        try {
            let importedCount = 0;
            let skippedCount = 0;
            
            if (data.configurations && Array.isArray(data.configurations)) {
                for (const config of data.configurations) {
                    const key = config.key;
                    
                    if (!key) continue;
                    
                    // Check if configuration already exists
                    if (this.configurations.has(key) && !overwrite) {
                        skippedCount++;
                        continue;
                    }
                    
                    // Prepare configuration for import
                    const configToImport = {
                        ...config,
                        createdAt: new Date(config.createdAt),
                        lastUpdated: config.lastUpdated ? new Date(config.lastUpdated) : new Date(config.createdAt)
                    };
                    
                    delete configToImport.key;
                    
                    this.configurations.set(key, configToImport);
                    importedCount++;
                }
                
                if (importedCount > 0) {
                    await this.saveConfigurations();
                }
            }
            
            this.logger.info(`Imported ${importedCount} configurations, skipped ${skippedCount}`);
            
            return {
                imported: importedCount,
                skipped: skippedCount,
                total: importedCount + skippedCount
            };
        } catch (error) {
            this.logger.error('Failed to import configurations:', error);
            return {
                imported: 0,
                skipped: 0,
                total: 0
            };
        }
    }
}

module.exports = ConfigManager;
