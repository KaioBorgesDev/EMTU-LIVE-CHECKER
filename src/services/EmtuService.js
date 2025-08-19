const axios = require('axios');
const Logger = require('../utils/Logger');

class EMTUService {
    constructor() {
        this.baseURL = 'https://bustime.noxxonsat.com.br/portal';
        this.logger = new Logger();
    }

    

    async findRoute(routeNumber) {
        try {
            const response = await axios.get(`${this.baseURL}?linha=${routeNumber}`);
            const linha = response.data.linhas[0];
            
            if (!linha) {
                this.logger.error(`Route ${routeNumber} not found`);
                return null;
            }

            return {
                id: linha.id,
                number: linha.codigo,
                name: linha.destino,
                fare: linha.tarifa,
                status: linha.status,
                consortium: linha.consorcio,
                averageSpeed: linha.velocidadeMedia
            };
        } catch (error) {
            this.logger.error('Failed to find route:', error);
            return null;
        }
    }

    async getVehiclePositions(routeNumber) {
        try {
            const response = await axios.get(`${this.baseURL}?linha=${routeNumber}`);
            const linha = response.data.linhas[0];
            
            if (!linha || !linha.veiculos) {
                return [];
            }

            return linha.veiculos.map(veiculo => ({
                id: veiculo.idVeiculo,
                latitude: veiculo.latitude,
                longitude: veiculo.longitude,
                lastUpdate: veiculo.dataUltimaTransmissao,
                line: veiculo.codigoLinha,
                direction: veiculo.sentidoLinha,
                prefix: veiculo.prefixo,
                plate: veiculo.placa,
                company: veiculo.empresa,
                isInRoute: veiculo.dentroRota,
                accessibility: veiculo.acessibilidade === 'sim'
            }));
        } catch (error) {
            this.logger.error('Failed to fetch vehicle positions:', error);
            return [];
        }
    }

    async findStop(stopName, routeId) {
        try {
            const response = await axios.get(`${this.baseURL}?linha=708BI2`);
            const linha = response.data.linhas[0];

            if (!linha || !linha.rotas) {
                return null;
            }

            const rota = linha.rotas.find(r => r.id === routeId);
            if (!rota) {
                return null;
            }

            const stop = rota.pontos.find(p => 
                p.endereco.toLowerCase().includes(stopName.toLowerCase())
            );

            if (!stop) {
                return null;
            }

            return {
                id: stop.id,
                name: stop.endereco,
                latitude: stop.latitude,
                longitude: stop.longitude,
                sequence: stop.sequencia,
                radius: stop.raio
            };
        } catch (error) {
            this.logger.error('Failed to find stop:', error);
            return null;
        }
    }

    async getStopLocation(stopId) {
        try {
            const response = await axios.get(`${this.baseURL}?linha=708BI2`);
            const linha = response.data.linhas[0];

            if (!linha || !linha.rotas) {
                throw new Error('No routes found');
            }

            for (const rota of linha.rotas) {
                const stop = rota.pontos.find(p => p.id === stopId);
                if (stop) {
                    return {
                        id: stop.id,
                        latitude: stop.latitude,
                        longitude: stop.longitude,
                        address: stop.endereco,
                        radius: stop.raio
                    };
                }
            }

            throw new Error(`Stop with ID ${stopId} not found`);
        } catch (error) {
            this.logger.error('Failed to get stop location:', error);
            throw error;
        }
    }

    async searchRoutes(searchTerm) {
        try {
            const response = await axios.get(`${this.baseURL}?linha=708BI2`);
            const term = searchTerm.toLowerCase();
            
            const routes = response.data.linhas.filter(linha => 
                linha.codigo.toLowerCase().includes(term) ||
                linha.destino.toLowerCase().includes(term)
            );

            return routes.map(linha => ({
                id: linha.id,
                number: linha.codigo,
                name: linha.destino,
                fare: linha.tarifa,
                status: linha.status
            }));
        } catch (error) {
            this.logger.error('Failed to search routes:', error);
            return [];
        }
    }

    async searchStops(searchTerm) {
        try {
            const response = await axios.get(`${this.baseURL}?linha=708BI2`);
            const linha = response.data.linhas[0];
            const stops = [];

            if (!linha || !linha.rotas) {
                return [];
            }

            for (const rota of linha.rotas) {
                const matchingStops = rota.pontos.filter(p => 
                    p.endereco.toLowerCase().includes(searchTerm.toLowerCase())
                );

                stops.push(...matchingStops.map(stop => ({
                    id: stop.id,
                    name: stop.endereco,
                    latitude: stop.latitude,
                    longitude: stop.longitude,
                    radius: stop.raio
                })));
            }

            return [...new Map(stops.map(stop => [stop.id, stop])).values()];
        } catch (error) {
            this.logger.error('Failed to search stops:', error);
            return [];
        }
    }
}

module.exports = EMTUService;
