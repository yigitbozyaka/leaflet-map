/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';
// @ts-expect-error nolib
import * as osrmTextInstructions from 'osrm-text-instructions';
import { trafficSpeedCache, trafficCache, routeCache, fetchTomTomTrafficData } from '@/lib/cache';

type Location = { name: string; lat: number; lon: number };

const locations: Location[] = [
    { name: 'Cennet Sube', lat: 40.994600, lon: 28.775300 },
    { name: 'Location-1', lat: 41.0017377265273, lon: 28.776208912671674 },
    { name: 'Location-2', lat: 41.004619767643526, lon: 28.78322280363494 },
    { name: 'Location-3', lat: 41.00037372414711, lon: 28.792933878928125 },
    { name: 'Location-4', lat: 40.99140157967791, lon: 28.798549052894398 },
    { name: 'Location-5', lat: 41.0119826818897, lon: 28.788525037442994 },
    { name: 'Location-6', lat: 40.97668849083287, lon: 28.79445239031416 },
    { name: 'Location-7', lat: 41.00274090266056, lon: 28.817164223670922 }
];

type Segment = {
    distance: number;
    trafficTime: number;
    geometry: [number, number][];
    instructions: { text: string; geometry: [number, number][] }[];
};

const WEIGHTS = {
    distance: 0.4,
    trafficTime: 0.6,
};

const fetchDistanceWithSteps = async (from: Location, to: Location): Promise<Segment> => {
    const cacheKey = `route:${from.lat},${from.lon}:${to.lat},${to.lon}`;
    const cached = routeCache.get(cacheKey);
    if (cached) {
        console.log(`Cache hit for route: ${cacheKey}`);
        return cached;
    }

    const url = `${process.env.OSRM_BACKEND_URL}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&steps=true`;
    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`OSRM API error: ${res.status} ${res.statusText}`);
        }
        
        const json = await res.json();
        if (!json.routes || json.routes.length === 0) {
            throw new Error('No routes found in OSRM response');
        }

        const route = json.routes[0];
        const distance = route.distance / 1000 || Infinity;
        const baseTime = route.duration / 60 || Infinity;
        
        const geometry = route.geometry?.coordinates.map(
            ([lon, lat]: [number, number]) => [lat, lon]
        ) || [];

        const instructions = route.legs?.[0]?.steps?.map((step: any) => {
            const instructionText = osrmTextInstructions('v5').compile('en', step, {
                legIndex: 0,
                legCount: 1,
            });
            return {
                text: instructionText || 'Continue',
                geometry: step.geometry?.coordinates?.map(
                    ([lon, lat]: [number, number]) => [lat, lon]
                ) || []
            };
        }) || [];

        const trafficTime = await getTrafficAdjustedTime(from, to, baseTime, distance);
        
        const segment = { distance, trafficTime, geometry, instructions };
        routeCache.set(cacheKey, segment);
        return segment;
    } catch (error) {
        console.error("Error fetching route:", error);
        return { distance: Infinity, trafficTime: Infinity, geometry: [], instructions: [] };
    }
};

const getTrafficAdjustedTimeTomTom = (from: Location, to: Location, baseTime: number): number | null => {
    const fromKey = `traffic:${from.lat},${from.lon}`;
    const toKey = `traffic:${to.lat},${to.lon}`;
    const fromSpeed = trafficSpeedCache.get(fromKey);
    const toSpeed = trafficSpeedCache.get(toKey);

    if (!fromSpeed || !toSpeed) {
        return null;
    }

    const fromRatio = fromSpeed.freeFlowSpeed / Math.max(1, fromSpeed.currentSpeed);
    const toRatio = toSpeed.freeFlowSpeed / Math.max(1, toSpeed.currentSpeed);
    
    const weightedRatio = (fromRatio * 0.6) + (toRatio * 0.4);
    
    return baseTime * weightedRatio;
};

const getTrafficAdjustedTime = async (from: Location, to: Location, baseTime: number, distance: number): Promise<number> => {
    const cacheKey = `trafficTime:${from.lat},${from.lon}:${to.lat},${to.lon}`;
    
    if (trafficCache.has(cacheKey)) {
        return trafficCache.get(cacheKey)!;
    }

    const tomtomTrafficTime = getTrafficAdjustedTimeTomTom(from, to, baseTime);
    
    if (tomtomTrafficTime !== null) {
        trafficCache.set(cacheKey, tomtomTrafficTime);
        return tomtomTrafficTime;
    }

    console.warn(`Using deterministic traffic estimation for ${from.name} to ${to.name}`);
    
    const hashFactor = Math.abs(Math.sin(from.lat * to.lon + from.lon * to.lat) * 10000) % 1;
    
    const maxDelayMinutes = 5;
    const trafficFactor = 0.5 + (hashFactor * 0.5); // Between 0.5 and 1.0
    const trafficDelay = Math.min(maxDelayMinutes, (distance / 5) * trafficFactor);
    const trafficTime = baseTime + trafficDelay;

    trafficCache.set(cacheKey, trafficTime);
    return trafficTime;
};

const nearestNeighborRoute = (matrix: Segment[][]): number[] => {
    const n = matrix.length;
    const visited = new Set<number>([0]);
    const route: number[] = [0];
    
    let current = 0;
    while (visited.size < n) {
        let best = -1;
        let minCost = Infinity;
        
        for (let next = 0; next < n; next++) {
            if (visited.has(next)) continue;
            
            const cost = WEIGHTS.distance * matrix[current][next].distance + 
                         WEIGHTS.trafficTime * matrix[current][next].trafficTime;
            
            if (cost < minCost) {
                minCost = cost;
                best = next;
            }
        }
        
        if (best !== -1) {
            route.push(best);
            visited.add(best);
            current = best;
        } else {
            break;
        }
    }
    
    route.push(0);
    return route;
};

const twoOptImprovement = (route: number[], matrix: Segment[][]): number[] => {
    let improved = true;
    const calculateRouteScore = (r: number[]) => {
        let score = 0;
        for (let i = 0; i < r.length - 1; i++) {
            const seg = matrix[r[i]][r[i + 1]];
            score += WEIGHTS.distance * seg.distance + WEIGHTS.trafficTime * seg.trafficTime;
        }
        return score;
    };
    
    let bestRoute = [...route];
    let bestScore = calculateRouteScore(bestRoute);
    
    while (improved) {
        improved = false;
        
        for (let i = 1; i < route.length - 2; i++) {
            for (let j = i + 1; j < route.length - 1; j++) {
                const newRoute = [...bestRoute];
                const segment = newRoute.slice(i, j + 1).reverse();
                newRoute.splice(i, j - i + 1, ...segment);
                
                const newScore = calculateRouteScore(newRoute);
                
                if (newScore < bestScore) {
                    bestScore = newScore;
                    bestRoute = newRoute;
                    improved = true;
                    break;
                }
            }
            if (improved) break;
        }
    }
    
    return bestRoute;
};

export async function GET() {
    try {
        //console.log("Starting TSP optimization...");
        //const startTime = Date.now();

        await fetchTomTomTrafficData(locations);
        //console.log(`Traffic data fetched in ${(Date.now() - startTime) / 1000} seconds`);
        
        const n = locations.length;
        
        //console.log("Building distance and time matrix...");
        const matrix: Segment[][] = Array.from({ length: n }, () =>
            Array.from({ length: n }, () => ({
                distance: Infinity,
                trafficTime: Infinity,
                geometry: [],
                instructions: []
            }))
        );
        
        await Promise.all(
            locations.flatMap((from, i) =>
                locations.map(async (to, j) => {
                    if (i === j) {
                        matrix[i][j] = {
                            distance: 0,
                            trafficTime: 0,
                            geometry: [],
                            instructions: []
                        };
                        return;
                    }
                    
                    const segment = await fetchDistanceWithSteps(from, to);
                    matrix[i][j] = segment;
                })
            )
        );
        //console.log(`Matrix built in ${(Date.now() - startTime) / 1000} seconds`);
        
        //console.log("Generating initial route using Nearest Neighbor...");
        const initialRoute = nearestNeighborRoute(matrix);
        
        //console.log("Optimizing route using 2-opt algorithm...");
        const optimizedRoute = twoOptImprovement(initialRoute, matrix);
        
        let totalDistance = 0;
        let totalTime = 0;
        let totalCost = 0;
        const geometry: [number, number][] = [];
        const instructions: { text: string; geometry: [number, number][] }[] = [];
        
        for (let i = 0; i < optimizedRoute.length - 1; i++) {
            const segment = matrix[optimizedRoute[i]][optimizedRoute[i + 1]];
            totalDistance += segment.distance;
            totalTime += segment.trafficTime;
            totalCost += WEIGHTS.distance * segment.distance + WEIGHTS.trafficTime * segment.trafficTime;
            geometry.push(...segment.geometry);
            instructions.push(...segment.instructions);
        }
        
        //console.log(`Route optimization completed in ${(Date.now() - startTime) / 1000} seconds`);
        
        return NextResponse.json({
            route: optimizedRoute.map(i => ({
                ...locations[i],
                index: i
            })),
            totalCost: Number(totalCost.toFixed(2)),
            metrics: {
                totalDistance: totalDistance.toFixed(2) + " km",
                totalTime: totalTime.toFixed(2) + " minutes",
                totalCost: totalCost.toFixed(2)
            },
            geometry,
            instructions,
            segments: optimizedRoute.slice(0, -1).map((i, index) => {
                const segment = matrix[i][optimizedRoute[index + 1]];
                return {
                    distance: segment.distance,
                    trafficTime: segment.trafficTime
                };
            })
        });
    } catch (error) {
        console.error("TSP optimization failed:", error);
        return NextResponse.json({ 
            error: "Route optimization failed", 
            message: error instanceof Error ? error.message : "Unknown error" 
        }, { status: 500 });
    }
}