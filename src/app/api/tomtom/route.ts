import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET() {
    const locations = [
        { name: 'Cennet Sube', lat: 40.9946, lon: 28.7753 },
        { name: 'Location-1', lat: 41.0017377265273, lon: 28.776208912671674 },
        { name: 'Location-2', lat: 41.004619767643526, lon: 28.78322280363494 },
        { name: 'Location-3', lat: 41.00037372414711, lon: 28.792933878928125 },
        { name: 'Location-4', lat: 40.99140157967791, lon: 28.798549052894398 },
        { name: 'Location-5', lat: 41.0119826818897, lon: 28.788525037442994 },
        { name: 'Location-6', lat: 40.97668849083287, lon: 28.79445239031416 },
        { name: 'Location-7', lat: 41.00274090266056, lon: 28.817164223670922 },
        { name: 'Cennet Sube', lat: 40.9946, lon: 28.7753 },
    ];

    const fetchRoute = async () => {
        try {
            const optimizeUrl = `https://api.tomtom.com/routing/waypointoptimization/1?key=${process.env.TOMTOM_API_KEY}`;
            const optimizeData = {
                waypoints: locations.slice(1, -1).map(({ lat, lon }) => ({
                    point: { latitude: Number(lat), longitude: Number(lon) },
                })),
                options: {
                    travelMode: 'car',
                    vehicleCommercial: false,
                },
            };

            console.log('TomTom optimize request:', JSON.stringify(optimizeData, null, 2));

            const optimizeRes = await axios.post(optimizeUrl, optimizeData, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': '*/*',
                },
            }).catch(error => {
                console.error('TomTom optimize error:', {
                    status: error.response?.status,
                    data: error.response?.data,
                    message: error.message,
                });
                throw error;
            });

            console.log('TomTom optimize response:', JSON.stringify(optimizeRes.data, null, 2));

            const optimizedOrder = optimizeRes.data.optimizedOrder;
            if (!optimizedOrder || !Array.isArray(optimizedOrder) || optimizedOrder.length !== 7) {
                console.error('Invalid optimized order length, expected 7 indices:', optimizedOrder);
                return null;
            }

            // Validate indices (0 to 6 for middle waypoints)
            const validIndices = optimizedOrder.every((idx: number) => idx >= 0 && idx < 7);
            if (!validIndices) {
                console.error('Optimized order contains invalid indices:', optimizedOrder);
                return null;
            }

            // Reorder middle waypoints (indices 1 to 7)
            const orderedLocations = [
                locations[0], // Start: Cennet Sube
                ...optimizedOrder.map((idx: number) => locations[idx + 1]), // Middle: Location-1 to Location-7
                locations[locations.length - 1], // End: Cennet Sube
            ];

            console.log('Ordered locations:', orderedLocations.map(loc => loc.name));

            // Step 2: Fetch detailed route
            const coordinates = orderedLocations
                .map(loc => `${loc.lat},${loc.lon}`)
                .join(':');
            console.log('Route coordinates:', coordinates);

            const routeUrl = `https://api.tomtom.com/routing/1/calculateRoute/${coordinates}/json?key=${process.env.TOMTOM_API_KEY}&instructionsType=text&routeRepresentation=polyline&computeTravelTimeFor=all&routeType=fastest&traffic=live`;

            const routeRes = await axios.get(routeUrl, {
                headers: { 'Content-Type': 'application/json' },
            });
            console.log('TomTom route response:', JSON.stringify(routeRes.data, null, 2));

            const route = routeRes.data.routes?.[0];
            if (!route) {
                console.error('No routes found in TomTom route response');
                return null;
            }

            const fullGeometry = route.legs?.flatMap((leg: any) =>
                leg.points?.map((point: any) => [point.latitude, point.longitude]) || []
            ) || [];

            const instructions = route.guidance?.instructions?.map((instr: any, index: number) => {
                const startIndex = instr.pointIndex || 0;
                const endIndex = route.guidance.instructions[index + 1]?.pointIndex || fullGeometry.length;
                const instrGeometry = fullGeometry.slice(startIndex, endIndex);
                return {
                    text: instr.message || 'Continue',
                    geometry: instrGeometry,
                };
            }) || [];

            return {
                route: orderedLocations,
                totalCost: (route.summary?.lengthInMeters || 0) / 1000, // Distance in km
                travelTime: (route.summary?.travelTimeInSeconds || 0) / 60, // Time in minutes
                geometry: fullGeometry,
                instructions,
            };
        } catch (error) {
            console.error('Error fetching TomTom route:', error);
            return null;
        }
    };

    const routeData = await fetchRoute();

    if (!routeData) {
        return NextResponse.json({ error: 'Failed to fetch route' }, { status: 500 });
    }

    console.log('Parsed TomTom route:', {
        totalCost: routeData.totalCost,
        travelTime: routeData.travelTime,
        instructionCount: routeData.instructions.length,
        geometryLength: routeData.geometry.length,
        routeOrder: routeData.route.map(loc => loc.name),
    });

    return NextResponse.json({
        routeData,
    });
}