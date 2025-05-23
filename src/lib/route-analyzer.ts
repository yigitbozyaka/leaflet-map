import { GoogleGenerativeAI } from '@google/generative-ai';

type RouteData = {
    provider: 'local' | 'tomtom';
    metrics: {
        totalDistance: string;
        totalTime: string;
        totalCost: string;
    };
    route: {
        name: string;
        lat: number;
        lon: number;
    }[];
    segments: {
        distance: number;
        trafficTime: number;
    }[];
};

export class RouteAnalyzer {
    private genAI: GoogleGenerativeAI;
    private readonly MODEL = 'gemini-2.0-flash';

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    async analyzeRoutes(localRoute: RouteData, tomtomRoute: RouteData): Promise<{
        recommendedProvider: 'local' | 'tomtom';
        explanation: string;
        confidence: number;
    }> {
        const model = this.genAI.getGenerativeModel({ model: this.MODEL });

        const prompt = this.buildPrompt(localRoute, tomtomRoute);

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            console.log(text);

            const lines = text.split('\n');
            const recommendedProvider = lines[0].toLowerCase().includes('local') ? 'local' : 'tomtom';
            const explanation = lines.slice(1).join('\n');
            const confidence = this.extractConfidence(text);

            return {
                recommendedProvider,
                explanation,
                confidence
            };
        } catch (error) {
            console.error('Error analyzing routes with Gemini:', error);
            throw error;
        }
    }

    private buildPrompt(localRoute: RouteData, tomtomRoute: RouteData): string {
        return `As a route optimization expert with deep knowledge of Google Maps and navigation systems, analyze these two delivery routes and recommend the best one for a courier. Consider factors like traffic, distance, time, and route complexity.

Route 1 (Local/TSP):
- Total Distance: ${localRoute.metrics.totalDistance}
- Estimated Time: ${localRoute.metrics.totalTime}
- Number of Stops: ${localRoute.route.length}
- Traffic Analysis:
${this.formatTrafficAnalysis(localRoute)}

Route 2 (TomTom):
- Total Distance: ${tomtomRoute.metrics.totalDistance}
- Estimated Time: ${tomtomRoute.metrics.totalTime}
- Number of Stops: ${tomtomRoute.route.length}
- Traffic Analysis:
${this.formatTrafficAnalysis(tomtomRoute)}

Please provide your recommendation in the following format:
1. First line: "Recommended: [Local/TomTom]"
2. Next lines: Detailed explanation of your recommendation
3. Last line: "Confidence: [0-100]%"

Apply Google Maps routing principles:
1. Traffic Pattern Analysis:
   - Evaluate segment speeds against typical urban traffic patterns
   - Consider time-based traffic variations (rush hours, off-peak)
   - Analyze speed consistency across segments

2. Route Optimization Criteria:
   - Prefer routes with consistent speeds over those with high variability
   - Consider the number of traffic signals and stops
   - Evaluate the ratio of main roads vs. side streets
   - Assess the complexity of intersections and turns

3. Historical Traffic Patterns:
   - Consider typical traffic patterns for similar routes
   - Evaluate reliability based on historical data
   - Compare with known traffic hotspots

4. Route Quality Metrics:
   - Calculate the efficiency ratio (distance/time)
   - Evaluate the traffic flow consistency
   - Consider the number of potential bottlenecks
   - Assess the route's resilience to traffic changes

5. Local Area Knowledge:
   - Consider typical traffic patterns in the area
   - Evaluate known congestion points
   - Assess the reliability of traffic predictions
   - Consider alternative routes availability

Base your analysis on these Google Maps-like principles, even without direct Google Maps data. Focus on:
- Traffic pattern consistency
- Route efficiency metrics
- Historical traffic behavior
- Local area characteristics
- Alternative route availability
- Time-based traffic variations`;
    }

    private formatTrafficAnalysis(route: RouteData): string {
        const segments = route.segments.map((seg, i) => {
            const avgSpeed = (seg.distance / (seg.trafficTime / 60)).toFixed(1);
            const trafficLevel = this.getTrafficLevel(seg.distance, seg.trafficTime);
            return `  Segment ${i + 1}:
    - Distance: ${seg.distance.toFixed(1)}km
    - Time: ${seg.trafficTime.toFixed(1)}min
    - Average Speed: ${avgSpeed}km/h
    - Traffic Level: ${trafficLevel}`;
        }).join('\n');

        return segments;
    }

    private getTrafficLevel(distance: number, time: number): string {
        const avgSpeed = distance / (time / 60);
        if (avgSpeed < 20) return 'Heavy Traffic';
        if (avgSpeed < 40) return 'Moderate Traffic';
        return 'Light Traffic';
    }

    private formatRouteDetails(route: RouteData): string {
        const segments = route.segments.map((seg, i) => 
            `Segment ${i + 1}: ${seg.distance.toFixed(1)}km, ${Math.round(seg.trafficTime)}min`
        ).join('; ');

        const stops = route.route.map(loc => loc.name).join(' → ');

        return `Stops: ${stops}; Segments: ${segments}`;
    }

    private extractConfidence(text: string): number {
        const confidenceMatch = text.match(/Confidence:\s*(\d+)%/);
        return confidenceMatch ? parseInt(confidenceMatch[1]) : 50;
    }
} 