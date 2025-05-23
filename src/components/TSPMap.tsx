/* eslint-disable @typescript-eslint/no-unused-vars */

'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Image from 'next/image';
import TrafficLayer from './TrafficLayer';

type Location = { name: string; lat: number; lon: number };
type Geometry = [number, number][];
type Instruction = { text: string; geometry: Geometry };

type RouteResponse = {
  route: Location[];
  totalCost: number;
  geometry: Geometry;
  instructions: Instruction[];
  metrics: {
    totalDistance: string;
    totalTime: string;
    totalCost: string;
  };
  segments: {
    distance: number;
    trafficTime: number;
  }[];
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function TSPMap() {
  const [data, setData] = useState<RouteResponse | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [geometryIndex, setGeometryIndex] = useState(0);
  const [provider, setProvider] = useState<"local" | "tomtom">("tomtom");
  const [bearing, setBearing] = useState(0);
  const [remainingDistance, setRemainingDistance] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);
  const mapRef = useRef<L.Map | null>(null);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [showTraffic, setShowTraffic] = useState(false);

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
    updateRemainingMetrics(0);

    const speed = 10; // todo
    const intervalMs = 1500;

    simulationIntervalRef.current = setInterval(() => {
      setGeometryIndex((prevIndex) => {
        if (prevIndex >= data.geometry.length - 1) {
          stopNavigation();
          return prevIndex;
        }

        const nextIndex = prevIndex + 1;
        const nextPosition = data.geometry[nextIndex];
        setUserPosition(nextPosition);
        updateRemainingMetrics(nextIndex);

        if (prevIndex >= 0) {
          const newBearing = getBearing(data.geometry[prevIndex], nextPosition);
          setBearing((newBearing - 50 + 360) % 360);
        }

        checkStepProgress(nextIndex);

        return nextIndex;
      });
    }, intervalMs);
  };

  const updateRemainingMetrics = (currentIndex: number) => {
    if (!data) return;

    let remainingDist = 0;
    let remainingTime = 0;

    // Calculate remaining distance and time from current position to end
    for (let i = currentIndex; i < data.geometry.length - 1; i++) {
      const currentPoint = data.geometry[i];
      const nextPoint = data.geometry[i + 1];
      const distance = calculateDistance(
        currentPoint[0],
        currentPoint[1],
        nextPoint[0],
        nextPoint[1]
      );
      remainingDist += distance;

      // Find which segment this point belongs to
      let accumulatedPoints = 0;
      for (let j = 0; j < data.segments.length; j++) {
        const segmentGeometry = data.instructions[j].geometry;
        accumulatedPoints += segmentGeometry.length;
        
        if (i < accumulatedPoints) {
          remainingTime += data.segments[j].trafficTime / segmentGeometry.length;
          break;
        }
      }
    }

    setRemainingDistance(remainingDist);
    setRemainingTime(remainingTime);
  };

  const getNextStop = () => {
    if (!data) return 'Final Destination';
    
    // Find the current segment's end point
    let accumulatedPoints = 0;
    for (let i = 0; i < data.instructions.length; i++) {
      const segmentGeometry = data.instructions[i].geometry;
      accumulatedPoints += segmentGeometry.length;
      
      if (geometryIndex < accumulatedPoints) {
        // If we're in the last segment, return final destination
        if (i === data.instructions.length - 1) {
          return 'Final Destination';
        }
        // Otherwise return the next location
        return data.route[i + 1].name;
      }
    }
    
    return 'Final Destination';
  };

  useEffect(() => {
    if (!userPosition || !mapRef.current) return;

    const offset = offsetPosition(userPosition, bearing, 0.0008);
    mapRef.current.setView(offset, 17, {
      animate: true,
      duration: 1.0,
      easeLinearity: 0.25,
    });
  }, [userPosition, bearing]);

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

    const totalPoints = data.geometry.length;
    const currentProgress = currentGeometryIndex / totalPoints;

    let newStepIndex = 0;
    let accumulatedPoints = 0;

    for (let i = 0; i < data.instructions.length; i++) {
      const stepGeometry = data.instructions[i].geometry;
      accumulatedPoints += stepGeometry.length;

      if (accumulatedPoints > currentGeometryIndex) {
        newStepIndex = i;
        break;
      }

      if (i === data.instructions.length - 1) {
        newStepIndex = i;
      }
    }

    if (newStepIndex !== currentStep) {
      setCurrentStep(newStepIndex);
    }
  };

  const togglePanel = () => {
    setIsPanelOpen((prev) => !prev);
  };

  function getBearing(from: [number, number], to: [number, number]): number {
    const [lat1, lon1] = from.map((deg) => deg * Math.PI / 180);
    const [lat2, lon2] = to.map((deg) => deg * Math.PI / 180);
    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function offsetPosition(position: [number, number], bearing: number, distance = 0.0008): [number, number] {
    const R = 6378.1;
    const brng = (bearing * Math.PI) / 180;
    const lat1 = (position[0] * Math.PI) / 180;
    const lon1 = (position[1] * Math.PI) / 180;

    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) +
      Math.cos(lat1) * Math.sin(distance / R) * Math.cos(brng));
    const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distance / R) * Math.cos(lat1),
      Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2));

    return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
  }

  if (!data) return <div className="bg-amber-50 flex min-h-screen items-center justify-center">
    <Image className='animate-pulse' src="/logo.png" width={160} height={160} alt='ArasKargo' />
  </div>;

  const { route, totalCost, geometry, instructions } = data;

  return (
    <div className="relative h-screen w-screen overflow-x-hidden">
      {/* Navigation */}
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-[#103578] text-[#e00612] p-2 md:p-4">
        <div className="flex flex-row items-center justify-between">
          <div className="flex flex-row items-center gap-2">
            <Image src="/logo-mini.png" width={32} height={32} alt='ArasKargo' />
            <h2 className="max-md:hidden text-lg font-bold">Aras Navigation</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-wrap gap-2">
              {!isNavigating ? (
                <button
                  onClick={startNavigation}
                  className="cursor-pointer duration-300 bg-[#e00612] text-[#103578] px-3 py-1.5 rounded-lg font-semibold text-sm max-md:text-xs hover:bg-[#E5D5C5]"
                >
                  Start
                </button>
              ) : (
                <button
                  onClick={stopNavigation}
                  className="cursor-pointer duration-300 bg-[#e00612] text-[#103578] px-3 py-1.5 rounded-lg font-semibold text-sm max-md:text-xs hover:bg-[#E5D5C5]"
                >
                  Stop
                </button>
              )}

              <button
                onClick={() => setShowTraffic(!showTraffic)}
                className="cursor-pointer duration-300 bg-[#e00612] text-[#103578] px-3 py-1.5 rounded-lg font-semibold text-sm max-md:text-xs hover:bg-[#E5D5C5]"
              >
                {showTraffic ? "Traffic Off" : "Traffic On"}
              </button>

              <button
                onClick={changeProvider}
                className="cursor-pointer duration-300 bg-[#e00612] text-[#103578] px-3 py-1.5 rounded-lg font-semibold text-sm max-md:text-xs hover:bg-[#E5D5C5]"
              >
                {provider === "local" ? "Tomtom" : "Local"}
              </button>
            </div>
            <button
              onClick={togglePanel}
              className="md:hidden text-white hover:text-[#e00612] transition-colors ml-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Directions */}
      <div
        className={`fixed md:absolute top-[48px] md:top-16 right-0 z-[999] bg-[#103578] text-white rounded-bl-lg w-full md:w-96 max-h-[calc(100vh-72px)] overflow-y-auto transition-transform duration-300 ease-in-out transform ${isPanelOpen ? 'translate-x-0' : 'translate-x-full'
          } md:translate-x-0 shadow-lg`}
      >
        <div className="sticky top-0 bg-[#103578] px-4 py-8 md:py-4 z-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-lg">Route Summary</h2>
            <button
              onClick={togglePanel}
              className="md:hidden text-white hover:text-[#e00612] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-[#0c2a5e] p-2 rounded">
              <div className="text-gray-300">Total Distance</div>
              <div className="text-lg font-semibold">{data.metrics.totalDistance}</div>
            </div>
            <div className="bg-[#0c2a5e] p-2 rounded">
              <div className="text-gray-300">Total Time</div>
              <div className="text-lg font-semibold">{data.metrics.totalTime}</div>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-4">
          <div>
            <h3 className="font-bold text-lg mb-3">Route Path</h3>
            <ul className="space-y-3">
              {route.map((loc, i) => (
                <li key={i} className="relative">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className="bg-[#e00612] rounded-md px-2 py-1">
                        <Image src="/marker-icon.png" width={16} height={20} alt="marker" className="min-w-[16px]" />
                      </div>
                      {i < route.length - 1 && (
                        <div className="h-full w-0.5 bg-gray-600 my-1 flex-grow"></div>
                      )}
                    </div>
                    <div className="flex-grow">
                      <div className="font-semibold">{loc.name}</div>
                      {i < route.length - 1 && (
                        <div className="mt-1 text-sm">
                          {(() => {
                            const segment = data.segments[i];
                            return (
                              <div className="bg-[#0c2a5e] p-2 rounded mt-2">
                                <div className="flex justify-between text-gray-300">
                                  <span>Distance:</span>
                                  <span className="font-medium">{segment.distance.toFixed(1)} km</span>
                                </div>
                                <div className="flex justify-between text-gray-300">
                                  <span>Est. Time:</span>
                                  <span className="font-medium">{Math.round(segment.trafficTime)} min</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-gray-600 pt-4">
            <h3 className="font-bold text-lg mb-3">Turn-by-Turn Directions</h3>
            <ol className="list-decimal pl-5 space-y-2">
              {instructions.map((step, index) => (
                <li
                  key={index}
                  ref={index === currentStep ? (el) => el?.scrollIntoView({ behavior: 'smooth', block: 'center' }) : undefined}
                  className={`py-1 ${index === currentStep && isNavigating ? 'text-[#e00612] font-bold' : 'text-gray-300'}`}
                >
                  {step.text}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {isNavigating && (
        <div className="absolute bottom-4 left-4 right-4 md:right-[calc(384px+1rem)] z-[1000] bg-[#103578]/95 backdrop-blur-sm p-3 rounded-lg shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="text-white font-semibold">Navigation Progress</div>
            <div className="text-[#e00612] text-sm font-medium">
              {getNextStop()}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#0c2a5e]/80 p-2 rounded">
              <div className="text-gray-300 text-xs">Remaining Distance</div>
              <div className="text-white text-lg font-semibold">{remainingDistance.toFixed(1)} km</div>
            </div>
            <div className="bg-[#0c2a5e]/80 p-2 rounded">
              <div className="text-gray-300 text-xs">Remaining Time</div>
              <div className="text-lg font-semibold text-white">{Math.round(remainingTime)} min</div>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      <MapContainer
        center={[route[0].lat, route[0].lon]}
        zoom={13}
        zoomControl={false}
        ref={mapRef}
        style={{ height: '100vh', width: '100%' }}
      >
        {/* url="https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" */}
        {/*  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" */}
        <TileLayer
          attribution='© OpenStreetMap contributors'
          url="https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
        />

        {/* Traffic Layer */}
        {showTraffic && geometry && (
          <TrafficLayer
            enabled={showTraffic}
            geometry={geometry}
          />
        )}

        {/* Route Line */}
        <Polyline
          positions={geometry}
          color="#0066FF"
          weight={6}
          opacity={0.5}
          smoothFactor={1}
        />

        {/* Current Step Highlight */}
        {isNavigating && instructions[currentStep]?.geometry.length > 0 && (
          <Polyline
            positions={instructions[currentStep].geometry}
            color="#FF0000"
            weight={8}
            opacity={0.8}
            smoothFactor={1}
          />
        )}

        {/* Markers */}
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

        {/* User Position Marker */}
        {userPosition && (
          <Marker
            position={userPosition}
            icon={L.divIcon({
              className: '',
              html: `<img src="/user-icon.png" style="transform: rotate(${bearing}deg); width: 28px; height: 28px;" />`,
              iconSize: [32, 32],
              iconAnchor: [14, 14],
            })}
          >
            <Popup>You are here</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}