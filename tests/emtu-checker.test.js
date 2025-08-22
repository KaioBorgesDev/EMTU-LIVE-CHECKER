const EMTUService = require('../src/services/emtu');
const AlertManager = require('../src/services/alertManager');
const ConfigManager = require('../src/utils/configManager');
const Logger = require('../src/utils/logger');

describe('EMTU Live Checker Tests', () => {
    let emtuService;
    let alertManager;
    let configManager;
    let logger;

    beforeAll(() => {
        emtuService = new EMTUService();
        alertManager = new AlertManager();
        configManager = new ConfigManager();
        logger = new Logger();
    });

    describe('EMTU Service', () => {
        test('should get mock routes when API is not available', async () => {
            const routes = await emtuService.getAllRoutes();
            expect(routes).toBeDefined();
            expect(Array.isArray(routes)).toBe(true);
            expect(routes.length).toBeGreaterThan(0);
        });

        test('should find a route by number', async () => {
            const route = await emtuService.findRoute('001');
            expect(route).toBeDefined();
            expect(route.number).toBe('001');
        });

        test('should search routes', async () => {
            const results = await emtuService.searchRoutes('terminal');
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });

        test('should get mock vehicle positions', async () => {
            const vehicles = await emtuService.getVehiclePositions('001');
            expect(vehicles).toBeDefined();
            expect(Array.isArray(vehicles)).toBe(true);
        });

        test('should get stop location', async () => {
            const location = await emtuService.getStopLocation('stop_001');
            expect(location).toBeDefined();
            expect(location.latitude).toBeDefined();
            expect(location.longitude).toBeDefined();
        });
    });

    describe('Alert Manager', () => {
        const testChatId = 'test_chat_001';
        const testRouteId = '001';
        const testVehicleId = 'vehicle_001';

        test('should allow sending first alert', async () => {
            const shouldSend = await alertManager.shouldSendAlert(
                testChatId,
                testRouteId,
                testVehicleId,
                5
            );
            expect(shouldSend).toBe(true);
        });

        test('should record an alert', async () => {
            await alertManager.recordAlert(
                testChatId,
                testRouteId,
                testVehicleId,
                300,
                'Test Stop'
            );

            const stats = await alertManager.getAlertStatistics(testChatId, testRouteId);
            expect(stats.total).toBeGreaterThan(0);
        });

        test('should respect cooldown period', async () => {
            // First alert should be allowed
            let shouldSend = await alertManager.shouldSendAlert(
                testChatId,
                testRouteId,
                testVehicleId,
                5
            );
            expect(shouldSend).toBe(true);

            // Record the alert
            await alertManager.recordAlert(
                testChatId,
                testRouteId,
                testVehicleId,
                300,
                'Test Stop'
            );

            // Immediate second alert should be blocked by cooldown
            shouldSend = await alertManager.shouldSendAlert(
                testChatId,
                testRouteId,
                testVehicleId,
                5
            );
            expect(shouldSend).toBe(false);
        });

        test('should get alert history', async () => {
            const history = await alertManager.getAlertHistory(testChatId);
            expect(history).toBeDefined();
            expect(Array.isArray(history)).toBe(true);
        });
    });

    describe('Config Manager', () => {
        const testChatId = 'test_chat_config';
        const testRouteNumber = '002';
        const testConfig = {
            chatId: testChatId,
            routeId: '002',
            routeNumber: testRouteNumber,
            stopId: 'stop_002',
            stopName: 'Test Stop',
            proximityThreshold: 500,
            maxAlerts: 5,
            createdAt: new Date(),
            isActive: true
        };

        test('should save configuration', async () => {
            const result = await configManager.saveConfiguration(
                testChatId,
                testRouteNumber,
                testConfig
            );
            expect(result).toBe(true);
        });

        test('should get saved configuration', async () => {
            const config = await configManager.getConfiguration(testChatId, testRouteNumber);
            expect(config).toBeDefined();
            expect(config.chatId).toBe(testChatId);
            expect(config.routeNumber).toBe(testRouteNumber);
        });

        test('should get active configurations', async () => {
            const configs = await configManager.getActiveConfigurations(testChatId);
            expect(configs).toBeDefined();
            expect(Array.isArray(configs)).toBe(true);
        });

        test('should deactivate configuration', async () => {
            const result = await configManager.deactivateConfiguration(testChatId, testRouteNumber);
            expect(result).toBe(true);

            const config = await configManager.getConfiguration(testChatId, testRouteNumber);
            expect(config.isActive).toBe(false);
        });
    });

    describe('Logger', () => {
        test('should format messages correctly', () => {
            const message = logger.formatMessage('info', 'Test message', 'arg1', 'arg2');
            expect(message).toContain('[INFO]');
            expect(message).toContain('Test message');
            expect(message).toContain('arg1');
            expect(message).toContain('arg2');
        });

        test('should respect log levels', () => {
            logger.currentLevel = logger.levels.warn;
            expect(logger.shouldLog('error')).toBe(true);
            expect(logger.shouldLog('warn')).toBe(true);
            expect(logger.shouldLog('info')).toBe(false);
            expect(logger.shouldLog('debug')).toBe(false);
        });
    });

    describe('Distance Calculation', () => {
        test('should calculate distance between coordinates', () => {
            const EMTULiveChecker = require('../src/index');
            const checker = new EMTULiveChecker();
            
            // Distance between São Paulo city center and Santos
            const distance = checker.calculateDistance(
                -23.5505, -46.6333, // São Paulo
                -23.9608, -46.3331  // Santos
            );
            
            // Should be approximately 65km
            expect(distance).toBeGreaterThan(60000);
            expect(distance).toBeLessThan(70000);
        });
    });

    afterAll(async () => {
        // Cleanup test data
        if (alertManager) {
            await alertManager.clearAlertsForChat('test_chat_001');
            await alertManager.clearAlertsForChat('test_chat_config');
        }
        
        if (configManager) {
            await configManager.deleteAllConfigurations('test_chat_001');
            await configManager.deleteAllConfigurations('test_chat_config');
        }
    });
});
