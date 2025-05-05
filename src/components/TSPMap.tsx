'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Image from 'next/image';

type Location = { name: string; lat: number; lon: number };
type Geometry = [number, number][];
type Instruction = { text: string; geometry: Geometry };

type RouteResponse = {
  route: Location[];
  totalCost: number;
  geometry: Geometry;
  instructions: Instruction[];
};

export default function TSPMap() {
  const [data, setData] = useState<RouteResponse | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [geometryIndex, setGeometryIndex] = useState(0);
  const [provider, setProvider] = useState<"local" | "tomtom">("local");
  const mapRef = useRef<L.Map | null>(null);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchRoute = async () => {
      try {
        let url = '/api/tsp';
        if (provider === "tomtom") {
          url = '/api/tomtom'
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch route');
        const json = await res.json();
        if (provider === "tomtom") {
          setData(json.routeData);
        } else {
          setData(json);
        }
      } catch (error) {
        console.error('Error fetching route:', error);
      }
    };
    fetchRoute();
  }, [provider]);

  const startNavigation = () => {
    if (!data) return;
    setIsNavigating(true);
    setCurrentStep(0);
    setGeometryIndex(0);
    setUserPosition(data.geometry[0]);

    const speed = 10; // todo
    const intervalMs = 1000;

    simulationIntervalRef.current = setInterval(() => {
      setGeometryIndex((prevIndex) => {
        if (prevIndex >= data.geometry.length - 1) {
          stopNavigation();
          return prevIndex;
        }

        const nextIndex = prevIndex + 1;
        setUserPosition(data.geometry[nextIndex]);

        if (mapRef.current) {
          mapRef.current.setView(data.geometry[nextIndex], 15);
        }

        checkStepProgress(nextIndex);

        return nextIndex;
      });
    }, intervalMs);
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    setUserPosition(null);
    setCurrentStep(0);
    setGeometryIndex(0);
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }
    if (mapRef.current && data) {
      mapRef.current.setView([data.route[0].lat, data.route[0].lon], 13);
    }
  };

  const changeProvider = () => {
    if (provider === "local") {
      setProvider("tomtom");
    } else {
      setProvider("local")
    }
  }

  // fix
  const checkStepProgress = (currentGeometryIndex: number) => {
    if (!data || currentGeometryIndex < 0) return;

    let pointsPassedSoFar = 0;
    let newStepIndex = 0;

    for (let i = 0; i < data.instructions.length; i++) {
      const stepGeometryLength = data.instructions[i].geometry.length;

      if (pointsPassedSoFar + stepGeometryLength > currentGeometryIndex) {
        newStepIndex = i;
        break;
      }

      pointsPassedSoFar += stepGeometryLength;
      newStepIndex = i + 1;
    }

    // only update the step if it's changed
    if (newStepIndex !== currentStep && newStepIndex < data.instructions.length) {
      setCurrentStep(newStepIndex);
    }
  };

  const togglePanel = () => {
    setIsPanelOpen((prev) => !prev);
  };

  if (!data) return <div className="bg-amber-50 flex min-h-screen items-center justify-center">
    <Image className='animate-pulse' src="/logo.png" width={160} height={160} alt='ArasKargo' />
  </div>;

  const { route, totalCost, geometry, instructions } = data;

  return (
    <div className="relative h-screen w-screen overflow-x-hidden">
      {/* Navigation */}
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-[#103578] text-[#e00612] p-4 flex justify-between items-center">
        <div className="flex flex-row items-center justify-center gap-2">
          <Image src="/logo-mini.png" width={32} height={32} alt='ArasKargo' />
          <h2 className="max-md:hidden text-lg font-bold">Aras Navigation</h2>
        </div>
        <div className="flex flex-col md:flex-row gap-2">
          {!isNavigating ? (
            <button
              onClick={startNavigation}
              className="cursor-pointer duration-300 bg-[#e00612] text-[#103578] px-4 py-2 rounded-lg font-semibold text-sm hover:bg-[#E5D5C5]"
            >
              Start
            </button>
          ) : (
            <button
              onClick={stopNavigation}
              className="cursor-pointer duration-300 bg-[#e00612] text-[#103578] px-4 py-2 rounded-lg font-semibold text-sm hover:bg-[#E5D5C5]"
            >
              Stop
            </button>
          )}

          <button
            onClick={changeProvider}
            className="cursor-pointer duration-300 bg-[#e00612] text-[#103578] px-4 py-2 rounded-lg font-semibold text-sm hover:bg-[#E5D5C5]"
          >
            Change Provider to {provider === "local" ? "Tomtom" : "Local"}
          </button>

          <button
            onClick={togglePanel}
            className="cursor-pointer duration-300 bg-[#e00612] text-[#103578] px-4 py-2 rounded-lg font-semibold text-sm hover:bg-[#E5D5C5] md:hidden"
          >
            {isPanelOpen ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {/* Directions */}
      <div
        className={`absolute top-36 md:top-16 right-0 z-[999] bg-[#103578] text-white p-4 rounded-bl-lg max-w-full md:max-w-sm max-h-[calc(100vh-80px)] overflow-y-auto transition-transform duration-300 ${isPanelOpen ? 'translate-x-0' : 'translate-x-full'
          } md:translate-x-0`}
      >
        <h2 className="font-bold text-lg">Total Cost: {totalCost?.toFixed(2)}</h2>
        <div className="my-2">
          <h3 className="font-bold underline">Route Path</h3>
          <ul className="flex flex-row flex-wrap gap-2">
            {route.map((loc, i) => (
              <li className="flex flex-row justify-center gap-1 items-center" key={i}>
                <img src="/marker-icon.png" className="w-3 h-4" alt="marker" />
                <span className="text-sm font-semibold">{loc.name}</span>
                {i < route.length - 1 && <span>→</span>}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-bold underline">Directions</h3>
          <ol className="list-decimal pl-5">
            {instructions.map((step, index) => (
              <li
                key={index}
                ref={index === currentStep ? (el) => el?.scrollIntoView({ behavior: 'smooth', block: 'center' }) : undefined}
                className={`py-1 ${index === currentStep && isNavigating ? 'font-bold text-[#e00612]' : ''}`}
              >
                {step.text}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Map */}
      <MapContainer
        center={[route[0].lat, route[0].lon]}
        zoom={13}
        zoomControl={false}
        style={{ height: '100vh', width: '100%' }}
      >
        <TileLayer
          attribution='© OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Polyline
          positions={geometry}
          color="#0066FF"
          weight={6}
          opacity={0.5}
          smoothFactor={1}
        />

        {isNavigating && instructions[currentStep]?.geometry.length > 0 && (
          <Polyline
            positions={instructions[currentStep].geometry}
            color="#FF0000"
            weight={8}
            opacity={0.8}
            smoothFactor={1}
          />
        )}

        {route.map((loc, i) => (
          <Marker
            key={i}
            position={[loc.lat, loc.lon]}
            icon={new L.Icon({
              iconUrl: '/marker-icon.png',
              iconSize: [28, 28],
              iconAnchor: [14, 28],
              popupAnchor: [0, -28],
            })}
          >
            <Popup>{loc.name}</Popup>
          </Marker>
        ))}

        {userPosition && (
          <Marker
            position={userPosition}
            icon={new L.Icon({
              iconUrl: '/user-icon.png',
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            })}
          >
            <Popup>You are here</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

// ai made it idk
export function haversineDistance(coord1: [number, number], coord2: [number, number]): number {
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}