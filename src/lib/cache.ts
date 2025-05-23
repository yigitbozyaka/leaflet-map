interface CacheEntry<T> {
    value: T;
    timestamp: number;
}

type Segment = {
    distance: number;
    trafficTime: number;
    geometry: [number, number][];
    instructions: { text: string; geometry: [number, number][] }[];
};

type Location = { name: string; lat: number; lon: number };

class TTLCache<T> {
    private cache = new Map<string, CacheEntry<T>>();
    private ttl: number;

    constructor(ttlMinutes: number = 15) {
        this.ttl = ttlMinutes * 60 * 1000;
    }

    set(key: string, value: T): void {
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    get(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return undefined;
        }
        
        return entry.value;
    }

    has(key: string): boolean {
        return this.get(key) !== undefined;
    }

    clear(): void {
        this.cache.clear();
    }

    getCacheSize(): number {
        return this.cache.size;
    }
}

export const trafficSpeedCache = new TTLCache<{ currentSpeed: number; freeFlowSpeed: number }>(15);
export const trafficCache = new TTLCache<number>(15);
export const routeCache = new TTLCache<Segment>(30);

export const fetchTomTomTrafficData = async (locations: Location[]): Promise<void> => {
    try {
        // Filter out locations that are already cached
        const uncachedLocations = locations.filter(({ lat, lon }) => {
            const cacheKey = `traffic:${lat},${lon}`;
            return !trafficSpeedCache.has(cacheKey);
        });

        // If all locations are cached, no need to make an API call
        if (uncachedLocations.length === 0) {
            return;
        }

        const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/traffic/data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ locations: uncachedLocations }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const { trafficData } = await response.json();
        
        if (!trafficData || trafficData.length === 0) {
            return;
        }

        trafficData.forEach((data: { lat: number; lon: number; currentSpeed: number; freeFlowSpeed: number }) => {
            const cacheKey = `traffic:${data.lat},${data.lon}`;
            trafficSpeedCache.set(cacheKey, {
                currentSpeed: data.currentSpeed,
                freeFlowSpeed: data.freeFlowSpeed,
            });
        });
    } catch (error) {
        console.error('Error fetching traffic data:', error);
    }
}; 