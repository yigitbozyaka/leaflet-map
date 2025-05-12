import { NextResponse } from 'next/server';
import { trafficSpeedCache, fetchTomTomTrafficData } from '../../tsp/route';

export async function POST(request: Request) {
  try {
    const { geometry } = await request.json();

    if (!geometry || !Array.isArray(geometry)) {
      console.error('Invalid geometry data:', geometry);
      return NextResponse.json({ error: 'Invalid geometry data' }, { status: 400 });
    }

    const locations = geometry.map(([lat, lon]) => ({ lat, lon, name: '' }));
    
    await fetchTomTomTrafficData(locations);
    
    const cacheEntries = Array.from(trafficSpeedCache['cache'].entries());

    const segments = processGeometryIntoSegments(geometry);

    return NextResponse.json({ segments });
  } catch (error) {
    console.error('Error processing traffic segments:', error);
    return NextResponse.json({ error: 'Failed to process traffic segments' }, { status: 500 });
  }
}

function processGeometryIntoSegments(geometry: [number, number][]): { positions: [number, number][]; color: string }[] {
  const segments: { positions: [number, number][]; color: string }[] = [];
  const segmentSize = 5;

  for (let i = 0; i < geometry.length - 1; i += segmentSize) {
    const segmentPoints = geometry.slice(i, Math.min(i + segmentSize + 1, geometry.length));
    const midPoint = segmentPoints[Math.floor(segmentPoints.length / 2)];
    
    const cacheKey = `traffic:${midPoint[0]},${midPoint[1]}`;
    console.log('Looking up traffic data for key:', cacheKey);
    const trafficData = trafficSpeedCache.get(cacheKey);
    console.log('Found traffic data:', trafficData);
    
    let color = '#4CAF50';
    if (trafficData) {
      const speedRatio = trafficData.currentSpeed / trafficData.freeFlowSpeed;
      console.log('Speed ratio:', speedRatio);
      if (speedRatio < 0.5) {
        color = '#F44336';
      } else if (speedRatio < 0.8) {
        color = '#FFC107';
      }
    }

    segments.push({
      positions: segmentPoints,
      color
    });
  }

  return segments;
} 