require("dotenv").config(); 
const express = require("express");
const Logger = require("./utils/Logger.js");
const WhatsApp = require("./services/Whatsapp.js")
const ConfigManager = require("./utils/ConfigManager.js");

class EMTULiveChecker {
    #app
    #monitoringIntervals
    #loggs
    #whatszap
    #configManager
    constructor() {
        this.#app = express(); 
        this.#monitoringIntervals = new Map();
        this.#whatszap = new WhatsApp(); 
        this.#configManager = new ConfigManager();
        this.#loggs = new Logger();   
    }

    async initialize() {
        try {
            this.#loggs.error(`Initializing the server`);

            await this.#setupExpressServer();

            await this.#whatszap.initialize();

            await this.config

        } catch (ex){
            this.#loggs.error(`Not initialize the server ${error}`);
            process.exit(1);
        }
    }
    
    #setupExpressServer() {
        this.#app.use(express.json());
        this.#loggs.info("Initializing the server");

        this.#app.get("/health", (req, res) => {
            res.send({
                status: "running",
                uptime: process.uptime(),
                whatsappReady: false,
                activeMonitors: this.#monitoringIntervals.size(),
            })
        });

        const port = process.env.PORT;

        if(!port) this.#loggs.warn("Enviroment variable PORT is not defined, using the 3000 port (default)");

        this.#app.listen(port || 3000, ()=> {
            this.#loggs.info(`We are live in port ${ port || 3000 }`);
        });
    }
}

const live_checker = new EMTULiveChecker();

live_checker.initialize();