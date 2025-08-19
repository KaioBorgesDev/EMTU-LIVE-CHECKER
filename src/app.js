require('dotenv').config(); 
const express = require('express');
const Logger = require('./utils/Logger.js');
const WhatsApp = require('./services/Whatsapp.js');
const ConfigManager = require('./utils/ConfigManager.js');
const MessageHandler = require('./services/MessageHandler.js');
const EMTUService = require('./services/EmtuService.js');


class EMTULiveChecker {
    #app;
    #loggs;
    #whatszap;
    #configManager;
    #messageHandler;
    #monitoringIntervals;
    #emtuService;

    constructor() {
        this.#app = express(); 
        this.#monitoringIntervals = new Map();
        this.#whatszap = new WhatsApp(); 
        this.#configManager = new ConfigManager();
        this.#loggs = new Logger();  
        this.#emtuService = new EMTUService();
        this.#messageHandler = new MessageHandler(this.#whatszap, this.#emtuService);
    }

    async initialize() {
        
        await this.#setupExpressServer();

        await this.#whatszap.initialize();

        await this.#configManager.loadConfigurations();

        await this.#messageHandler.setupMessageHandlers();

        await this.#loggs.info('EMTU-LIVE-CHECKER INITIALIZED SUCCESFULLY');

        
    }
    
    #setupExpressServer() {
        this.#app.use(express.json());
        this.#loggs.info('Initializing the server');

        this.#app.get('/health', (req, res) => {
            res.send({
                status: 'running',
                uptime: process.uptime(),
                whatsappReady: false,
                activeMonitors: this.#monitoringIntervals.size(),
            });
        });

        const port = process.env.PORT;

        if(!port) this.#loggs.warn('Enviroment variable PORT is not defined, using the 3000 port (default)');

        this.#app.listen(port || 3000, ()=> {
            this.#loggs.info(`We are live in port ${ port || 3000 }`);
        });
    }
}

const live_checker = new EMTULiveChecker();

live_checker.initialize();