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

            this.#setupEventHandle();
            this.#client.initialize();

            this.#logger.info('Whatsapp client initializeed successfully!');
            
        } catch(ex){
            console.log(ex);
        }
    }
    #setupEventHandle(){
        this.#client.on('qr', (qr) => {
            console.log('\nPreparando QrCode...');
            qrcode.generate(qr, {small: true});
            console.log('\nScanneie o QrCode !');
            this.#logger.info('QrCode generated sucessfully');
        });

        this.#client.on('ready', ()=>{
            this.#isReady = true;
            this.#logger.info('WhatsApp connected successfully!');

        });

        this.#client.on('authenticated', ()=>{
            console.log('WhatsApp Autenticado');
            this.#logger.info('WhatsApp authenticated!');
        });

        this.#client.on('auth_failure', (msg) => {
            this.logger.error('WhatsApp authentication failed:', msg);
            console.error('WhatsApp authentication failed:', msg);
        });

        this.#client.on('disconnected', (reason) => {
            this.isReady = false;
            this.logger.warn('WhatsApp client disconnected:', reason);
            console.log('WhatsApp disconnected:', reason);
        });


        this.#client.on('message', async (message) => {
            try {
                // status mensagens/mensagens de grupo
                if (message.isStatus || message.from.includes('@g.us')) {
                    return;
                }

                this.logger.debug(`Received message from ${message.from}: ${message.body}`);

                for (const handler of this.#messageHandlers){
                    try {
                        await handler(message);
                    } catch (ex) {
                        this.logger.error('Error in message handler:', ex);

                    }
                }
            } catch (ex) {
                this.logger.error('Error processing incoming message:', ex);
            }
        });

        this.#client.on('message_create', (message) => {
            this.logger.debug(`Sent message to ${message.to}: ${message.body}`);
        });
    }


}

module.exports = WhatsApp;