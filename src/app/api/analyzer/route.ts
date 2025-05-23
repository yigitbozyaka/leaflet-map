import { NextResponse } from 'next/server';
import { RouteAnalyzer } from '@/lib/route-analyzer';
import connectDB from '@/lib/mongodb';
import { RouteAnalysis } from '@/lib/models/route-analysis';

export async function GET(request: Request) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not configured');
        }

        const url = new URL(request.url);
        const baseUrl = `${url.protocol}//${url.host}`;

        const analyzer = new RouteAnalyzer(apiKey);

        const [localRouteRes, tomtomRouteRes] = await Promise.all([
            fetch(`${baseUrl}/api/tsp`),
            fetch(`${baseUrl}/api/tomtom`)
        ]);

        if (!localRouteRes.ok || !tomtomRouteRes.ok) {
            console.error('Route fetch failed:', {
                local: localRouteRes.status,
                tomtom: tomtomRouteRes.status
            });
            throw new Error('Failed to fetch routes from providers');
        }

        const localRoute = await localRouteRes.json();
        const tomtomRoute = await tomtomRouteRes.json();

        const localRouteData = {
            provider: 'local' as const,
            metrics: localRoute.metrics,
            route: localRoute.route,
            segments: localRoute.segments
        };

        const tomtomRouteData = {
            provider: 'tomtom' as const,
            metrics: tomtomRoute.routeData.metrics,
            route: tomtomRoute.routeData.route,
            segments: tomtomRoute.routeData.segments
        };

        const analysis = await analyzer.analyzeRoutes(localRouteData, tomtomRouteData);

        // Connect to MongoDB and save the analysis
        await connectDB();
        const routeAnalysis = new RouteAnalysis({
            recommendedProvider: analysis.recommendedProvider,
            confidence: analysis.confidence,
            explanation: analysis.explanation,
            routes: {
                local: {
                    metrics: localRouteData.metrics,
                    segments: localRouteData.segments
                },
                tomtom: {
                    metrics: tomtomRouteData.metrics,
                    segments: tomtomRouteData.segments
                }
            },
            metadata: {
                timeOfDay: new Date().toLocaleTimeString(),
                dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' })
            }
        });

        await routeAnalysis.save();

        return NextResponse.json({
            analysis,
            routes: {
                local: localRouteData,
                tomtom: tomtomRouteData
            },
            saved: true
        });
    } catch (error) {
        console.error('Route analysis failed:', error);
        return NextResponse.json(
            { error: 'Route analysis failed', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}