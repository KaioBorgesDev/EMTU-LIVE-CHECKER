const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');
const Logger = require('../utils/Logger.js');

class WhatsApp {
    #client;
    #isReady;
    #logger;
    #messageHandlers;
    #sessionPath; 

    constructor() {
        this.#client = null;
        this.#isReady = false;
        this.#logger = new Logger();
        this.#messageHandlers = [];
        this.#sessionPath = process.env.WHATSAPP_SESSION_PATH || './sessions/whatsapp-session';
    }

    async initialize(){
        try{
            this.#logger.info('Initializing the wpp');

            await fs.ensureDir(path.dirname(this.#sessionPath));

            this.#client = new Client({
                authStrategy: new LocalAuth({
                    clientId: 'emtu-live-checker',
                    dataPath: this.#sessionPath
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
                    ],
                }
            });

            this.#client.initialize();

            this.#logger.info('Whatsapp client initializeed successfully!');
            
        } catch(ex){
            console.log(ex);
        }
    }
}

module.exports = WhatsApp;