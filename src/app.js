require("dotenv").config(); 
const express = require("express");
const { error } = require("qrcode-terminal");


class EMTULiveChecker {
    #app
    #monitoringIntervals
    constructor() {
        this.#app = express(); 
        this.#monitoringIntervals = new Map();    
    }

    async initialize() {
        try {
            await this.#setupExpressServer();
        } catch (ex){
            console.log("Error on start server, look the error: ", ex);
            process.exit(1);
        }
    }
    
    #setupExpressServer() {
        this.#app.use(express.json());

        this.#app.get("/health", (req, res) => {
            res.send({
                status: "running",
                uptime: process.uptime(),
                whatsappReady: false,
                activeMonitors: this.#monitoringIntervals.size(),
            })
        });

        const port = process.env.PORT

        if(!port) console.warn("Enviroment variable PORT is not defined, using the 3000 port (default)");

        this.#app.listen(port || 3000, ()=> {
            console.log(`We are live in port ${ port || 3000 }`);
        });
    }
}

const live_checker = new EMTULiveChecker();

live_checker.initialize();