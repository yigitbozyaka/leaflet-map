import { useEffect, useState } from 'react';
import { Polyline } from 'react-leaflet';

interface TrafficLayerProps {
  enabled: boolean;
  geometry: [number, number][];
}

export default function TrafficLayer({ enabled, geometry }: TrafficLayerProps) {
  const [trafficSegments, setTrafficSegments] = useState<{ positions: [number, number][]; color: string }[]>([]);

  useEffect(() => {
    if (!enabled || !geometry.length) {
      console.log('Traffic layer disabled or no geometry:', { enabled, geometryLength: geometry.length });
      return;
    }

    const fetchTrafficData = async () => {
      try {
        console.log('Fetching traffic data for geometry:', geometry.length, 'points');
        const response = await fetch('/api/traffic/segments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ geometry }),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Received traffic segments:', data.segments?.length || 0);
        if (data.segments && data.segments.length > 0) {
          setTrafficSegments(data.segments);
        } else {
          console.warn('No traffic segments received');
        }
      } catch (error) {
        console.error('Error fetching traffic segments:', error);
      }
    };

    fetchTrafficData();
    const interval = setInterval(fetchTrafficData, 300000); // 5 minutes

    return () => clearInterval(interval);
  }, [enabled, geometry]);

  if (!enabled || !trafficSegments.length) {
    console.log('Traffic layer not enabled or no segments:', { enabled, segmentsCount: trafficSegments.length });
    return null;
  }

  console.log('Rendering traffic segments:', trafficSegments.length);

  return (
    <>
      {trafficSegments.map((segment, index) => {
        console.log(`Rendering segment ${index}:`, {
          points: segment.positions.length,
          color: segment.color
        });
        return (
          <Polyline
            key={index}
            positions={segment.positions}
            color={segment.color}
            weight={3}
            opacity={0.9}
            lineCap="round"
            lineJoin="round"
          />
        );
      })}
    </>
  );
} 