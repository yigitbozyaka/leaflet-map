'use client';

import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

const Map = dynamic(() => import('@/components/TSPMap'), { ssr: false });

export default function HomePage() {
  return (
    <main style={{ height: '100vh' }}>
      <Map />
    </main>
  );
}
