const axios = require('axios');

class EMTUService {
    constructor() {
        this.baseURL = process.env.EMTU_API_BASE_URL || 'https://bustime.noxxonsat.com.br';
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000;


        // Username e password podem ser qualquer coisa
        const username = 'user';
        const password = 'pass';
        const basicAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

        this.api = axios.create({
            baseURL: this.baseURL,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'EMTU-Live-Checker/1.0.0',
                'Authorization': basicAuth
            }
        });
        
        this.setupInterceptors();
    }

    setupInterceptors() {
        
        this.api.interceptors.request.use(
            (config) => {
                return config;
            },
            (error) => {
                return Promise.reject(error);
            }
        );

        
        this.api.interceptors.response.use(
            (response) => {
                return response;
            },
            (error) => {
                return Promise.reject(error);
            }
        );
    }

    
    getCacheKey(method, ...params) {
        return `${method}_${params.join('_')}`;
    }

    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    getCache(key) {
        const cached = this.cache.get(key);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }
        this.cache.delete(key);
        return null;
    }

    clearCache() {
        this.cache.clear();
    }

    

    async findRoute(routeNumber) {
        try {
            const response = await this.api.get(`/portal?linha=${routeNumber}`);
            const linhas = response.data.linhas || [];
            if (!linhas.length) return { linhas: [] };
            return { linhas };
        } catch (error) {
            console.log('Erro na requisição:', error.message);
            return { linhas: [] };
        }
    }

    async getVehiclePositions(routeNumber) {
        try {
            const response = await this.api.get(`/portal?linha=${routeNumber}`);
            const linhas = response.data.linhas || [];
            if (!linhas.length) return [];
            return linhas[0].veiculos || [];
        } catch (error) {
            console.log('Erro ao buscar posições dos veículos:', error.message);
            return [];
        }
    }

    async getRotas(routeNumber) {
        try {
            const response = await this.api.get(`/portal?linha=${routeNumber}`);
            const linhas = response.data.linhas || [];
            if (!linhas.length) return [];
            return linhas[0].rotas || [];
        } catch (error) {
            console.log('Erro ao buscar rotas:', error.message);
            return [];
        }
    }

    async getPontos(routeNumber, sentido = 'ida') {
        try {
            const rotas = await this.getRotas(routeNumber);
            const rota = rotas.find(r => r.sentido === sentido);
            if (!rota) return [];
            return rota.pontos || [];
        } catch (error) {
            return [];
        }
    }

    
    async getStopsForRoute(routeId) {
        const cacheKey = this.getCacheKey('route_stops', routeId);
        const cached = this.getCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.api.get(`/v1/routes/${routeId}/stops`);
            const stops = this.normalizeStops(response.data);
            this.setCache(cacheKey, stops);
            return stops;
        } catch (error) {
            return this.getMockStops(routeId);
        }
    }

    async findStop(stopName, routeId = null) {
        try {
            let stops = [];
            
            if (routeId) {
                stops = await this.getStopsForRoute(routeId);
            } else {
                stops = await this.getAllStops();
            }
            
            const term = stopName.toLowerCase();
            return stops.find(stop =>
                stop.name.toLowerCase().includes(term) ||
                stop.description?.toLowerCase().includes(term)
            );
        } catch (error) {
            return null;
        }
    }

    async searchStops(searchTerm) {
        try {
            const stops = await this.getAllStops();
            const term = searchTerm.toLowerCase();
            
            return stops.filter(stop =>
                stop.name.toLowerCase().includes(term) ||
                stop.description?.toLowerCase().includes(term) ||
                stop.address?.toLowerCase().includes(term)
            ).slice(0, 10); 
        } catch (error) {
            return [];
        }
    }

    async getAllStops() {
        const cacheKey = this.getCacheKey('all_stops');
        const cached = this.getCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.api.get('/v1/stops');
            const stops = this.normalizeStops(response.data);
            this.setCache(cacheKey, stops);
            return stops;
        } catch (error) {
            return this.getMockStops();
        }
    }

    async getStopLocation(stopId) {
        const cacheKey = this.getCacheKey('stop_location', stopId);
        const cached = this.getCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.api.get(`/v1/stops/${stopId}`);
            const location = {
                id: stopId,
                latitude: response.data.latitude || response.data.lat,
                longitude: response.data.longitude || response.data.lng,
                name: response.data.name,
                address: response.data.address
            };
            this.setCache(cacheKey, location);
            return location;
        } catch (error) {
            return this.getMockStopLocation(stopId);
        }
    }

    
    // (método removido, pois já existe a nova versão compatível com a API atual)

    async getVehicleInfo(vehicleId) {
        try {
            const response = await this.api.get(`/v1/vehicles/${vehicleId}`);
            return this.normalizeVehicle(response.data);
        } catch (error) {
            return null;
        }
    }

    
    async getArrivalPredictions(stopId, routeId = null) {
        try {
            const url = routeId 
                ? `/v1/stops/${stopId}/predictions?route=${routeId}`
                : `/v1/stops/${stopId}/predictions`;
            
            const response = await this.api.get(url);
            return this.normalizePredictions(response.data);
        } catch (error) {
            return this.getMockPredictions(stopId, routeId);
        }
    }

    
    normalizeRoutes(data) {
        if (!Array.isArray(data)) data = [data];
        
        return data.map(route => ({
            id: route.id || route.route_id || route.codigo,
            number: route.number || route.linha || route.codigo,
            name: route.name || route.nome || route.descricao,
            description: route.description || route.descricao_longa,
            type: route.type || route.tipo || 'bus',
            active: route.active !== false
        }));
    }

    normalizeStops(data) {
        if (!Array.isArray(data)) data = [data];
        
        return data.map(stop => ({
            id: stop.id || stop.stop_id || stop.codigo,
            name: stop.name || stop.nome || stop.denominacao,
            description: stop.description || stop.descricao,
            address: stop.address || stop.endereco,
            latitude: parseFloat(stop.latitude || stop.lat || stop.coordenada_y),
            longitude: parseFloat(stop.longitude || stop.lng || stop.coordenada_x),
            type: stop.type || stop.tipo || 'bus_stop'
        }));
    }

    normalizeVehicles(data) {
        if (!Array.isArray(data)) data = [data];
        
        return data.map(vehicle => ({
            id: vehicle.id || vehicle.vehicle_id || vehicle.codigo,
            routeId: vehicle.route_id || vehicle.linha_id,
            latitude: parseFloat(vehicle.latitude || vehicle.lat || vehicle.coordenada_y),
            longitude: parseFloat(vehicle.longitude || vehicle.lng || vehicle.coordenada_x),
            bearing: vehicle.bearing || vehicle.direcao,
            speed: vehicle.speed || vehicle.velocidade,
            timestamp: vehicle.timestamp || vehicle.data_hora || new Date().toISOString(),
            status: vehicle.status || 'active'
        }));
    }

    normalizeVehicle(data) {
        return {
            id: data.id || data.vehicle_id || data.codigo,
            routeId: data.route_id || data.linha_id,
            latitude: parseFloat(data.latitude || data.lat || data.coordenada_y),
            longitude: parseFloat(data.longitude || data.lng || data.coordenada_x),
            bearing: data.bearing || data.direcao,
            speed: data.speed || data.velocidade,
            timestamp: data.timestamp || data.data_hora || new Date().toISOString(),
            status: data.status || 'active',
            capacity: data.capacity || data.capacidade,
            occupancy: data.occupancy || data.ocupacao
        };
    }

    normalizePredictions(data) {
        if (!Array.isArray(data)) data = [data];
        
        return data.map(prediction => ({
            routeId: prediction.route_id || prediction.linha_id,
            vehicleId: prediction.vehicle_id || prediction.veiculo_id,
            arrivalTime: prediction.arrival_time || prediction.tempo_chegada,
            estimatedMinutes: prediction.estimated_minutes || prediction.minutos_estimados,
            distance: prediction.distance || prediction.distancia,
            status: prediction.status || 'scheduled'
        }));
    }

    normalizeRouteDetails(data) {
        return {
            id: data.id || data.route_id || data.codigo,
            number: data.number || data.linha || data.codigo,
            name: data.name || data.nome || data.descricao,
            description: data.description || data.descricao_longa,
            type: data.type || data.tipo || 'bus',
            fare: data.fare || data.tarifa,
            company: data.company || data.empresa,
            active: data.active !== false,
            stops: data.stops ? this.normalizeStops(data.stops) : []
        };
    }

        
    getMockRoutes() {
        return [
            {
                id: '001',
                number: '001',
                name: 'Terminal São Mateus - Terminal Cidade Tiradentes',
                description: 'Linha expressa conectando os terminais',
                type: 'bus',
                active: true
            },
            {
                id: '002',
                number: '002',
                name: 'Terminal Jabaquara - Diadema Centro',
                description: 'Linha intermunicipal',
                type: 'bus',
                active: true
            },
            {
                id: '003',
                number: '003',
                name: 'Terminal Santo André - ABC',
                description: 'Linha regional do ABC',
                type: 'bus',
                active: true
            }
        ];
    }

    getMockStops(routeId = null) {
        const allStops = [
            {
                id: 'stop_001',
                name: 'Terminal São Mateus',
                description: 'Terminal principal',
                address: 'Av. Ragueb Chohfi, São Mateus',
                latitude: -23.6094,
                longitude: -46.4736,
                type: 'terminal'
            },
            {
                id: 'stop_002',
                name: 'Estação Cidade Tiradentes',
                description: 'Estação do metrô',
                address: 'Av. dos Metalúrgicos, Cidade Tiradentes',
                latitude: -23.5963,
                longitude: -46.4026,
                type: 'station'
            },
            {
                id: 'stop_003',
                name: 'Shopping Anália Franco',
                description: 'Parada em frente ao shopping',
                address: 'Av. Regente Feijó, Vila Regente Feijó',
                latitude: -23.5489,
                longitude: -46.5692,
                type: 'bus_stop'
            }
        ];

        return routeId ? allStops.slice(0, 2) : allStops;
    }

    getMockVehicles(routeId) {
        return [
            {
                id: `vehicle_${routeId}_001`,
                routeId: routeId,
                latitude: -23.6000 + (Math.random() - 0.5) * 0.01,
                longitude: -46.4500 + (Math.random() - 0.5) * 0.01,
                bearing: Math.floor(Math.random() * 360),
                speed: Math.floor(Math.random() * 50),
                timestamp: new Date().toISOString(),
                status: 'active'
            },
            {
                id: `vehicle_${routeId}_002`,
                routeId: routeId,
                latitude: -23.5950 + (Math.random() - 0.5) * 0.01,
                longitude: -46.4450 + (Math.random() - 0.5) * 0.01,
                bearing: Math.floor(Math.random() * 360),
                speed: Math.floor(Math.random() * 50),
                timestamp: new Date().toISOString(),
                status: 'active'
            }
        ];
    }

    getMockStopLocation(stopId) {
        const mockLocations = {
            'stop_001': { latitude: -23.6094, longitude: -46.4736 },
            'stop_002': { latitude: -23.5963, longitude: -46.4026 },
            'stop_003': { latitude: -23.5489, longitude: -46.5692 }
        };

        return {
            id: stopId,
            latitude: mockLocations[stopId]?.latitude || -23.5505,
            longitude: mockLocations[stopId]?.longitude || -46.6333,
            name: `Parada ${stopId}`,
            address: 'Endereço da parada'
        };
    }

    getMockPredictions(stopId, routeId) {
        return [
            {
                routeId: routeId || '001',
                vehicleId: 'vehicle_001',
                arrivalTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                estimatedMinutes: 5,
                distance: 1500,
                status: 'on_time'
            },
            {
                routeId: routeId || '001',
                vehicleId: 'vehicle_002',
                arrivalTime: new Date(Date.now() + 12 * 60 * 1000).toISOString(),
                estimatedMinutes: 12,
                distance: 3200,
                status: 'on_time'
            }
        ];
    }

    getMockRouteDetails(routeId) {
        const mockRoutes = this.getMockRoutes();
        const route = mockRoutes.find(r => r.id === routeId) || mockRoutes[0];
        
        return {
            ...route,
            fare: 4.40,
            company: 'EMTU',
            stops: this.getMockStops(routeId)
        };
    }

        
    async healthCheck() {
        try {
            await this.api.get('/health', { timeout: 5000 });
            return { status: 'ok', api: 'connected' };
        } catch (error) {
            return { status: 'degraded', api: 'mock_mode' };
        }
    }
}

module.exports = EMTUService;