import { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation } from 'lucide-react';

interface LocationData {
  lat: number;
  lng: number;
  label?: string;
}

interface RoutePoint {
  lat: number;
  lng: number;
}

interface LeafletMapProps {
  location?: LocationData;
  routePoints?: RoutePoint[];
  onLocationChange?: (lat: number, lng: number) => void;
  className?: string;
}

const liveIcon = L.divIcon({
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -14],
  html: `<div style="width:24px;height:24px;position:relative">
    <div style="position:absolute;inset:0;border-radius:50%;background:rgba(16,185,129,0.3);animation:livePulse 2s ease-in-out infinite"></div>
    <div style="position:absolute;inset:4px;border-radius:50%;background:#10b981;border:2px solid #fff;box-shadow:0 0 6px rgba(16,185,129,0.6)"></div>
    <style>@keyframes livePulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.8);opacity:0}}</style>
  </div>`,
});

const startIcon = L.divIcon({
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -13],
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#22c55e;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35)">
    <span style="color:#fff;font-size:10px;font-weight:700;line-height:1">S</span>
  </div>`,
});

const endIcon = L.divIcon({
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -13],
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#ef4444;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35)">
    <span style="color:#fff;font-size:10px;font-weight:700;line-height:1">E</span>
  </div>`,
});

// Tracks user interaction so flyTo doesn't override their pan/zoom
function InteractionTracker({ userInteracted }: { userInteracted: React.MutableRefObject<boolean> }) {
  useMapEvents({
    dragstart: () => { userInteracted.current = true; },
    zoomstart: () => { userInteracted.current = true; },
  });
  return null;
}

function MapUpdater({
  location,
  userInteracted,
}: {
  location: LocationData;
  userInteracted: React.MutableRefObject<boolean>;
}) {
  const map = useMap();

  useEffect(() => {
    if (location && !userInteracted.current) {
      map.flyTo([location.lat, location.lng], 14, { duration: 1.5 });
    }
  }, [location, map, userInteracted]);

  return null;
}

function FitBounds({ positions }: { positions: L.LatLngExpression[] }) {
  const map = useMap();

  useMemo(() => {
    if (positions.length < 2) return;
    const bounds = L.latLngBounds(positions);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [positions, map]);

  return null;
}

const LeafletMap = ({ location, routePoints, onLocationChange, className }: LeafletMapProps) => {
  const hasRoute = routePoints && routePoints.length >= 2;
  const [mode, setMode] = useState<'live' | 'lastTrip'>(hasRoute ? 'live' : 'live');

  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(location ?? null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'granted' | 'denied' | 'unavailable'>('idle');
  const userInteracted = useRef(false);

  useEffect(() => {
    if (location) {
      setCurrentLocation(location);
    }
  }, [location]);

  useEffect(() => {
    if (location) return;

    if (!navigator.geolocation) {
      setGeoStatus('unavailable');
      return;
    }

    setGeoStatus('loading');

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const resolved: LocationData = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: 'Your Location',
        };
        setCurrentLocation(resolved);
        setGeoStatus('granted');
        onLocationChange?.(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        if (err.code === GeolocationPositionError.PERMISSION_DENIED) {
          setGeoStatus('denied');
        } else {
          setGeoStatus('unavailable');
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [location, onLocationChange]);

  const routePositions: L.LatLngExpression[] = useMemo(
    () => (routePoints ?? []).map((p) => [p.lat, p.lng] as [number, number]),
    [routePoints],
  );

  const showRoute = mode === 'lastTrip' && routePositions.length >= 2;

  const mapCenter: [number, number] = showRoute
    ? (routePositions[0] as [number, number])
    : currentLocation
      ? [currentLocation.lat, currentLocation.lng]
      : [51.505, -0.09];

  if (!showRoute && !currentLocation) {
    return (
      <div
        className={`flex items-center justify-center bg-[#1a1a2e]/50 rounded-xl ${className}`}
        style={{ height: '300px' }}
      >
        {geoStatus === 'denied' ? (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <span className="text-3xl">📍</span>
            <p className="text-white/70 text-sm font-medium">Location access denied</p>
            <p className="text-white/40 text-xs">
              Enable location in your browser settings so the map can show your position.
            </p>
          </div>
        ) : geoStatus === 'unavailable' ? (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <span className="text-3xl">🗺️</span>
            <p className="text-white/70 text-sm font-medium">GPS unavailable</p>
            <p className="text-white/40 text-xs">Your device doesn't support location services.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
            <p className="text-white/60 text-sm">Finding your location…</p>
          </div>
        )}
      </div>
    );
  }

  const handleRecentre = () => {
    userInteracted.current = false;
  };

  return (
    <div className={`rounded-xl overflow-hidden relative ${className}`}>
      {hasRoute && (
        <div className="flex bg-[#1a1a2e]/80 border-b border-white/10">
          <button
            onClick={() => setMode('live')}
            className={`flex-1 py-2 text-xs font-medium transition-colors min-h-[36px] ${
              mode === 'live'
                ? 'text-emerald-400 bg-emerald-500/10 border-b-2 border-emerald-400'
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            Live
          </button>
          <button
            onClick={() => setMode('lastTrip')}
            className={`flex-1 py-2 text-xs font-medium transition-colors min-h-[36px] ${
              mode === 'lastTrip'
                ? 'text-emerald-400 bg-emerald-500/10 border-b-2 border-emerald-400'
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            Last Trip
          </button>
        </div>
      )}

      <MapContainer
        center={mapCenter}
        zoom={14}
        style={{ height: '300px', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        <InteractionTracker userInteracted={userInteracted} />

        {showRoute ? (
          <>
            <FitBounds positions={routePositions} />
            <Polyline
              positions={routePositions}
              pathOptions={{ color: '#10b981', weight: 4, opacity: 0.85 }}
            />
            <Marker position={routePositions[0]} icon={startIcon}>
              <Popup><span className="text-sm font-bold text-gray-700">Start</span></Popup>
            </Marker>
            <Marker position={routePositions[routePositions.length - 1]} icon={endIcon}>
              <Popup><span className="text-sm font-bold text-gray-700">End</span></Popup>
            </Marker>
          </>
        ) : currentLocation ? (
          <>
            <MapUpdater location={currentLocation} userInteracted={userInteracted} />
            <Marker position={[currentLocation.lat, currentLocation.lng]} icon={liveIcon}>
              <Popup>
                <span className="text-sm font-bold text-gray-700">
                  {currentLocation.label || 'Your Location'}
                </span>
              </Popup>
            </Marker>
          </>
        ) : null}
      </MapContainer>

      {/* Re-centre button — shown when user has panned/zoomed away */}
      {!showRoute && currentLocation && (
        <button
          onClick={handleRecentre}
          className="absolute bottom-3 right-3 z-[1000] w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-opacity"
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
          }}
          title="Re-centre on my location"
          aria-label="Re-centre map"
        >
          <Navigation className="w-4 h-4 text-emerald-400" />
        </button>
      )}
    </div>
  );
};

export default LeafletMap;
