const fs = require('fs-extra');
const path = require('path');
const Logger = require('../utils/logger');

class AlertManager {
    constructor() {
        this.logger = new Logger();
        this.alertsPath = process.env.DB_PATH || './data/alerts.json';
        this.cooldownPeriod = 10 * 60 * 1000; 
        this.alerts = new Map();
        this.sentAlerts = new Map(); 
        this.initialize();
    }

    async initialize() {
        try {
            await fs.ensureDir(path.dirname(this.alertsPath));
            
            await this.loadAlerts();
            
            setInterval(() => this.cleanupOldAlerts(), 60 * 60 * 1000); 
            
            this.logger.info('Alert Manager initialized');
        } catch (error) {
            this.logger.error('Failed to initialize Alert Manager:', error);
        }
    }

    async loadAlerts() {
        try {
            if (await fs.pathExists(this.alertsPath)) {
                const data = await fs.readJson(this.alertsPath);
                
                
                if (data.alerts) {
                    for (const [key, alertList] of Object.entries(data.alerts)) {
                        this.alerts.set(key, alertList.map(alert => ({
                            ...alert,
                            timestamp: new Date(alert.timestamp)
                        })));
                    }
                }

               
                if (data.sentAlerts) {
                    for (const [key, alertData] of Object.entries(data.sentAlerts)) {
                        this.sentAlerts.set(key, {
                            ...alertData,
                            lastSent: new Date(alertData.lastSent)
                        });
                    }
                }

                this.logger.debug(`Loaded ${this.alerts.size} alert configurations and ${this.sentAlerts.size} sent alert records`);
            }
        } catch (error) {
            this.logger.error('Failed to load alerts from file:', error);
        }
    }

    async saveAlerts() {
        try {
            const data = {
                alerts: {},
                sentAlerts: {},
                lastUpdated: new Date().toISOString()
            };

            
            for (const [key, alertList] of this.alerts.entries()) {
                data.alerts[key] = alertList;
            }

            // Convert sentAlerts Map to object
            for (const [key, alertData] of this.sentAlerts.entries()) {
                data.sentAlerts[key] = alertData;
            }

            await fs.writeJson(this.alertsPath, data, { spaces: 2 });
            this.logger.debug('Alerts saved to file');
        } catch (error) {
            this.logger.error('Failed to save alerts to file:', error);
        }
    }

    generateAlertKey(chatId, routeId, vehicleId) {
        return `${chatId}_${routeId}_${vehicleId}`;
    }

    generateChatRouteKey(chatId, routeId) {
        return `${chatId}_${routeId}`;
    }

    async shouldSendAlert(chatId, routeId, vehicleId, maxAlerts = 5) {
        try {
            const alertKey = this.generateAlertKey(chatId, routeId, vehicleId);
            const chatRouteKey = this.generateChatRouteKey(chatId, routeId);
            
            const lastAlert = this.sentAlerts.get(alertKey);
            if (lastAlert) {
                const timeSinceLastAlert = Date.now() - lastAlert.lastSent.getTime();
                if (timeSinceLastAlert < this.cooldownPeriod) {
                    this.logger.debug(`Alert cooldown active for ${alertKey} (${Math.round(timeSinceLastAlert / 1000)}s ago)`);
                    return false;
                }
            }

            const todayAlerts = this.getTodayAlerts(chatId, routeId);
            if (todayAlerts.length >= maxAlerts) {
                this.logger.debug(`Maximum daily alerts reached for ${chatRouteKey} (${todayAlerts.length}/${maxAlerts})`);
                return false;
            }

            return true;
        } catch (error) {
            this.logger.error('Error checking if should send alert:', error);
            return false;
        }
    }

    async recordAlert(chatId, routeId, vehicleId, distance, stopName = '') {
        try {
            const now = new Date();
            const alertKey = this.generateAlertKey(chatId, routeId, vehicleId);
            const chatRouteKey = this.generateChatRouteKey(chatId, routeId);

            this.sentAlerts.set(alertKey, {
                chatId,
                routeId,
                vehicleId,
                lastSent: now,
                distance,
                stopName
            });

            // Add to alerts history
            if (!this.alerts.has(chatRouteKey)) {
                this.alerts.set(chatRouteKey, []);
            }

            const alertRecord = {
                vehicleId,
                distance,
                stopName,
                timestamp: now,
                alertKey
            };

            this.alerts.get(chatRouteKey).push(alertRecord);

            // Keep only last 100 alerts per chat/route combination
            const alertList = this.alerts.get(chatRouteKey);
            if (alertList.length > 100) {
                alertList.splice(0, alertList.length - 100);
            }

            // Save to file
            await this.saveAlerts();

            this.logger.info(`Alert recorded: ${chatId} - Route ${routeId} - Vehicle ${vehicleId} - Distance ${Math.round(distance)}m`);
        } catch (error) {
            this.logger.error('Error recording alert:', error);
        }
    }

    getTodayAlerts(chatId, routeId) {
        const chatRouteKey = this.generateChatRouteKey(chatId, routeId);
        const alerts = this.alerts.get(chatRouteKey) || [];
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return alerts.filter(alert => {
            const alertDate = new Date(alert.timestamp);
            return alertDate >= today;
        });
    }

    async getAlertStatistics(chatId, routeId = null) {
        try {
            let totalAlerts = 0;
            let todayAlerts = 0;
            let thisWeekAlerts = 0;
            let routeStats = {};

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            weekAgo.setHours(0, 0, 0, 0);

            // If specific route requested
            if (routeId) {
                const chatRouteKey = this.generateChatRouteKey(chatId, routeId);
                const alerts = this.alerts.get(chatRouteKey) || [];

                totalAlerts = alerts.length;
                todayAlerts = alerts.filter(alert => new Date(alert.timestamp) >= today).length;
                thisWeekAlerts = alerts.filter(alert => new Date(alert.timestamp) >= weekAgo).length;

                return {
                    total: totalAlerts,
                    today: todayAlerts,
                    thisWeek: thisWeekAlerts,
                    routeId
                };
            }

            // Get stats for all routes for this chat
            for (const [key, alerts] of this.alerts.entries()) {
                if (key.startsWith(chatId + '_')) {
                    const routeIdFromKey = key.split('_')[1];
                    
                    const routeTotal = alerts.length;
                    const routeToday = alerts.filter(alert => new Date(alert.timestamp) >= today).length;
                    const routeWeek = alerts.filter(alert => new Date(alert.timestamp) >= weekAgo).length;

                    totalAlerts += routeTotal;
                    todayAlerts += routeToday;
                    thisWeekAlerts += routeWeek;

                    routeStats[routeIdFromKey] = {
                        total: routeTotal,
                        today: routeToday,
                        thisWeek: routeWeek
                    };
                }
            }

            return {
                total: totalAlerts,
                today: todayAlerts,
                thisWeek: thisWeekAlerts,
                byRoute: routeStats
            };
        } catch (error) {
            this.logger.error('Error getting alert statistics:', error);
            return {
                total: 0,
                today: 0,
                thisWeek: 0,
                byRoute: {}
            };
        }
    }

    async getAlertHistory(chatId, routeId = null, limit = 50) {
        try {
            let allAlerts = [];

            if (routeId) {
                const chatRouteKey = this.generateChatRouteKey(chatId, routeId);
                const alerts = this.alerts.get(chatRouteKey) || [];
                allAlerts = [...alerts];
            } else {
                // Get alerts from all routes for this chat
                for (const [key, alerts] of this.alerts.entries()) {
                    if (key.startsWith(chatId + '_')) {
                        allAlerts.push(...alerts.map(alert => ({
                            ...alert,
                            routeId: key.split('_')[1]
                        })));
                    }
                }
            }

            // Sort by timestamp (newest first) and limit
            allAlerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            return allAlerts.slice(0, limit);
        } catch (error) {
            this.logger.error('Error getting alert history:', error);
            return [];
        }
    }

    cleanupOldAlerts() {
        try {
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

            let cleaned = 0;

            // Clean up old alerts
            for (const [key, alerts] of this.alerts.entries()) {
                const filteredAlerts = alerts.filter(alert => 
                    new Date(alert.timestamp) > oneMonthAgo
                );
                
                if (filteredAlerts.length !== alerts.length) {
                    this.alerts.set(key, filteredAlerts);
                    cleaned += alerts.length - filteredAlerts.length;
                }

                // Remove empty alert lists
                if (filteredAlerts.length === 0) {
                    this.alerts.delete(key);
                }
            }

            // Clean up old sent alerts tracking
            for (const [key, alertData] of this.sentAlerts.entries()) {
                if (alertData.lastSent < oneMonthAgo) {
                    this.sentAlerts.delete(key);
                    cleaned++;
                }
            }

            if (cleaned > 0) {
                this.logger.info(`Cleaned up ${cleaned} old alert records`);
                this.saveAlerts();
            }
        } catch (error) {
            this.logger.error('Error during alert cleanup:', error);
        }
    }

    async clearAlertsForChat(chatId) {
        try {
            let cleared = 0;

            // Clear alerts
            for (const key of this.alerts.keys()) {
                if (key.startsWith(chatId + '_')) {
                    this.alerts.delete(key);
                    cleared++;
                }
            }

            // Clear sent alerts tracking
            for (const key of this.sentAlerts.keys()) {
                if (key.startsWith(chatId + '_')) {
                    this.sentAlerts.delete(key);
                }
            }

            if (cleared > 0) {
                await this.saveAlerts();
                this.logger.info(`Cleared ${cleared} alert configurations for chat ${chatId}`);
            }

            return cleared;
        } catch (error) {
            this.logger.error('Error clearing alerts for chat:', error);
            return 0;
        }
    }

    async clearAlertsForRoute(chatId, routeId) {
        try {
            const chatRouteKey = this.generateChatRouteKey(chatId, routeId);
            
            // Clear alerts for specific route
            const deleted = this.alerts.delete(chatRouteKey);

            // Clear related sent alerts tracking
            for (const key of this.sentAlerts.keys()) {
                if (key.startsWith(chatRouteKey + '_')) {
                    this.sentAlerts.delete(key);
                }
            }

            if (deleted) {
                await this.saveAlerts();
                this.logger.info(`Cleared alerts for chat ${chatId} route ${routeId}`);
                return true;
            }

            return false;
        } catch (error) {
            this.logger.error('Error clearing alerts for route:', error);
            return false;
        }
    }

    // Get system-wide statistics
    async getSystemStatistics() {
        try {
            const stats = {
                totalChats: new Set(),
                totalRoutes: new Set(),
                totalAlerts: 0,
                todayAlerts: 0,
                activeAlerts: this.sentAlerts.size
            };

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (const [key, alerts] of this.alerts.entries()) {
                const [chatId, routeId] = key.split('_');
                stats.totalChats.add(chatId);
                stats.totalRoutes.add(routeId);
                stats.totalAlerts += alerts.length;
                
                const todayAlertsForRoute = alerts.filter(alert => 
                    new Date(alert.timestamp) >= today
                ).length;
                stats.todayAlerts += todayAlertsForRoute;
            }

            return {
                totalChats: stats.totalChats.size,
                totalRoutes: stats.totalRoutes.size,
                totalAlerts: stats.totalAlerts,
                todayAlerts: stats.todayAlerts,
                activeAlerts: stats.activeAlerts
            };
        } catch (error) {
            this.logger.error('Error getting system statistics:', error);
            return {
                totalChats: 0,
                totalRoutes: 0,
                totalAlerts: 0,
                todayAlerts: 0,
                activeAlerts: 0
            };
        }
    }
}

module.exports = AlertManager;
