import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: Request) {
    try {
        const { locations } = await request.json();
        
        if (!Array.isArray(locations)) {
            return NextResponse.json({ error: 'Invalid locations format' }, { status: 400 });
        }

        if (locations.length === 0) {
            return NextResponse.json({ error: 'No locations provided' }, { status: 400 });
        }

        for (const loc of locations) {
            if (typeof loc.lat !== 'number' || typeof loc.lon !== 'number' ||
                isNaN(loc.lat) || isNaN(loc.lon) ||
                loc.lat < -90 || loc.lat > 90 ||
                loc.lon < -180 || loc.lon > 180) {
                return NextResponse.json({ 
                    error: 'Invalid coordinates',
                    details: `Invalid coordinates: ${JSON.stringify(loc)}`
                }, { status: 400 });
            }
        }

        const apiKey = process.env.TOMTOM_API_KEY;
        if (!apiKey) {
            console.error('TOMTOM_API_KEY not found in environment variables');
            return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
        }


        const trafficData = await Promise.all(
            locations.map(async ({ lat, lon }: { lat: number; lon: number }) => {
                const cacheKey = `traffic:${lat},${lon}`;

                const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${apiKey}&point=${lat},${lon}`;
                try {
                    const res = await axios.get(url, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 5000
                    });

                    if (!res.data?.flowSegmentData) {
                        console.warn(`No flow segment data for ${cacheKey}`);
                        return null;
                    }

                    const flowData = res.data.flowSegmentData;

                    if (!flowData.currentSpeed || !flowData.freeFlowSpeed) {
                        console.warn(`Missing speed data for ${cacheKey}:`, flowData);
                        return null;
                    }

                    const currentSpeed = Number(flowData.currentSpeed);
                    const freeFlowSpeed = Number(flowData.freeFlowSpeed);

                    if (isNaN(currentSpeed) || isNaN(freeFlowSpeed)) {
                        console.warn(`Invalid speed values for ${cacheKey}:`, { currentSpeed, freeFlowSpeed });
                        return null;
                    }

                    return {
                        lat,
                        lon,
                        currentSpeed,
                        freeFlowSpeed
                    };
                } catch (error) {
                    if (axios.isAxiosError(error)) {
                        console.error(`TomTom API error for ${cacheKey}:`, {
                            status: error.response?.status,
                            message: error.message,
                            data: error.response?.data
                        });
                    } else {
                        console.error(`Unexpected error for ${cacheKey}:`, error);
                    }
                }
                return null;
            })
        );

        const validData = trafficData.filter(Boolean);

        if (validData.length === 0) {
            console.warn('No valid traffic data was fetched for any location');
        }

        return NextResponse.json({ 
            trafficData: validData,
            stats: {
                total: locations.length,
                successful: validData.length,
                failed: locations.length - validData.length
            }
        });
    } catch (error) {
        console.error('Error in traffic data endpoint:', error);
        return NextResponse.json({ 
            error: 'Failed to fetch traffic data',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
} 