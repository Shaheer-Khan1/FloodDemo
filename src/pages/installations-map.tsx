import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, MapPin } from "lucide-react";
import type { Installation } from "@/lib/types";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Create colored markers based on status
const createMarkerIcon = (color: string) => {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

const getMarkerColor = (status: string): string => {
  switch (status) {
    case "verified":
      return "#10b981"; // green
    case "flagged":
      return "#ef4444"; // red
    case "pending":
      return "#f59e0b"; // yellow
    default:
      return "#6b7280"; // gray
  }
};

interface Location {
  id: string;
  locationId: string;
  latitude: number;
  longitude: number;
}

// Runtime viewport check to avoid sidebar on phones regardless of CSS
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isDesktop;
}

interface InstallationWithCoords extends Installation {
  lat?: number;
  lon?: number;
}

// Component to fit map bounds to all markers
function FitBounds({ installations }: { installations: InstallationWithCoords[] }) {
  const map = useMap();

  useEffect(() => {
    if (installations.length > 0) {
      const bounds = L.latLngBounds(
        installations.map((inst) => [inst.lat!, inst.lon!] as [number, number])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [installations, map]);

  return null;
}

// Ensure Leaflet recalculates size when container/layout changes
function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const invalidate = () => {
      try {
        map.invalidateSize();
      } catch {}
    };
    // run after mount and next ticks
    const t1 = setTimeout(invalidate, 0);
    const t2 = setTimeout(invalidate, 200);
    window.addEventListener('resize', invalidate);
    // Observe container size changes (flex/layout switches)
    const container = map.getContainer();
    let ro: ResizeObserver | null = null;
    if ((window as any).ResizeObserver && container) {
      ro = new ResizeObserver(() => invalidate());
      ro.observe(container);
    }
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', invalidate);
      if (ro && container) ro.unobserve(container);
    };
  }, [map]);
  return null;
}

export default function InstallationsMap() {
  const { userProfile } = useAuth();
  const isDesktop = useIsDesktop();
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInstallationId, setSelectedInstallationId] = useState<string | null>(null);

  // Fetch installations
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "installations"), (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
        createdAt: d.data().createdAt?.toDate(),
        updatedAt: d.data().updatedAt?.toDate(),
        verifiedAt: d.data().verifiedAt?.toDate(),
      })) as Installation[];
      setInstallations(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Fetch locations
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "locations"), (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as Location[];
      setLocations(data);
    });
    return () => unsub();
  }, []);

  // Match installations to coordinates
  const installationsWithCoords = useMemo(() => {
    const locationMap = new Map<string, Location>();
    locations.forEach((loc) => {
      locationMap.set(loc.locationId, loc);
    });

    return installations
      .map((inst) => {
        const location = locationMap.get(inst.locationId);
        return {
          ...inst,
          lat: location?.latitude,
          lon: location?.longitude,
        };
      })
      .filter((inst) => inst.lat != null && inst.lon != null) as InstallationWithCoords[];
  }, [installations, locations]);

  // Filter installations based on search
  const filteredInstallations = useMemo(() => {
    if (!searchTerm.trim()) return installationsWithCoords;
    const term = searchTerm.toLowerCase().trim();
    return installationsWithCoords.filter(
      (inst) =>
        inst.deviceId.toLowerCase().includes(term) ||
        inst.locationId.toLowerCase().includes(term) ||
        inst.installedByName.toLowerCase().includes(term)
    );
  }, [installationsWithCoords, searchTerm]);

  // Component to center map on selected installation
  function CenterOnInstallation({ installationId }: { installationId: string | null }) {
    const map = useMap();

    useEffect(() => {
      if (installationId && installationsWithCoords.length > 0) {
        const inst = installationsWithCoords.find((i) => i.id === installationId);
        if (inst && inst.lat && inst.lon) {
          map.setView([inst.lat, inst.lon], 15, { animate: true });
        }
      }
    }, [installationId, installationsWithCoords, map]);

    return null;
  }

  // Calculate center point for map (fallback)
  const mapCenter = useMemo(() => {
    if (installationsWithCoords.length === 0) return [21.5, 39.8] as [number, number];
    const avgLat = installationsWithCoords.reduce((sum, inst) => sum + (inst.lat || 0), 0) / installationsWithCoords.length;
    const avgLon = installationsWithCoords.reduce((sum, inst) => sum + (inst.lon || 0), 0) / installationsWithCoords.length;
    return [avgLat, avgLon] as [number, number];
  }, [installationsWithCoords]);

  if (!userProfile?.isAdmin && userProfile?.role !== "ministry" && userProfile?.role !== "verifier" && userProfile?.role !== "manager") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-xl font-semibold mb-2">Access Denied</p>
            <p className="text-muted-foreground">Only administrators, ministry, verifiers, and managers can view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Installations List Component (reusable)
  const InstallationsList = ({ className = "" }: { className?: string }) => (
    <div className={className}>
      {/* Search Bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by Device ID, Location ID, or Installer..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Status Legend */}
      <div className="mb-4 pb-4 border-b space-y-2">
        <div className="font-semibold text-sm">Status Legend</div>
        <div className="flex items-center gap-2 text-sm">
          <div className="w-3 h-3 rounded-full bg-yellow-500 border border-white shadow"></div>
          <span>Pending</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="w-3 h-3 rounded-full bg-green-500 border border-white shadow"></div>
          <span>Verified</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="w-3 h-3 rounded-full bg-red-500 border border-white shadow"></div>
          <span>Flagged</span>
        </div>
      </div>

      {/* Installations List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        <div className="text-sm text-muted-foreground mb-2">
          {filteredInstallations.length} installation{filteredInstallations.length !== 1 ? 's' : ''}
        </div>
        {filteredInstallations.length > 0 ? (
          filteredInstallations.map((inst) => (
            <div
              key={inst.id}
              onClick={() => {
                setSelectedInstallationId(inst.id);
              }}
              className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-accent ${
                selectedInstallationId === inst.id ? 'bg-accent border-primary' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{inst.deviceId}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    <div>Location: {inst.locationId}</div>
                    <div>Installer: {inst.installedByName}</div>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    inst.status === "verified" ? "border-green-500 text-green-600" :
                    inst.status === "flagged" ? "border-red-500 text-red-600" :
                    "border-yellow-500 text-yellow-600"
                  }`}
                >
                  {inst.status}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Sensor: {inst.sensorReading} cm</div>
                {inst.latestDisCm && <div>Server: {inst.latestDisCm} cm</div>}
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-muted-foreground text-center py-8">
            {searchTerm ? "No installations found matching your search" : "No installations with coordinates"}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl md:text-3xl font-bold">Installations Map</h1>
        <p className="text-muted-foreground mt-2">
          View all installations on the map ({installationsWithCoords.length} with coordinates)
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:h-[calc(100vh-180px)]">
        {/* Sidebar - Render only on desktop (double-guard) */}
        {isDesktop && (
        <Card className="hidden lg:flex border shadow-sm lg:w-80 flex-shrink-0 flex flex-col order-2 lg:order-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Search Installations</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col flex-1 overflow-hidden">
            <InstallationsList />
          </CardContent>
        </Card>
        )}

        {/* Map only on mobile; list remains desktop-only */}
        <Card className="border shadow-sm flex-1 flex flex-col min-h-0 order-1 lg:order-2">
          <CardContent className="p-0 relative" style={{ height: '60vh' }}>
            {installationsWithCoords.length > 0 ? (
              <MapContainer
                center={mapCenter}
                zoom={10}
                style={{ height: "100%", width: "100%" }}
              >
                <InvalidateSize />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds installations={installationsWithCoords} />
                <CenterOnInstallation installationId={selectedInstallationId} />
                {installationsWithCoords.map((inst) => (
                  <Marker
                    key={inst.id}
                    position={[inst.lat!, inst.lon!]}
                    icon={createMarkerIcon(getMarkerColor(inst.status))}
                    eventHandlers={{
                      click: () => setSelectedInstallationId(inst.id),
                    }}
                  >
                    <Popup>
                      <div className="space-y-2 p-2 min-w-[200px]">
                        <div className="font-semibold text-base">Device: {inst.deviceId}</div>
                        <div className="text-sm space-y-1">
                          <div><strong>Location ID:</strong> {inst.locationId}</div>
                          <div><strong>Installer:</strong> {inst.installedByName}</div>
                          <div>
                            <strong>Status:</strong>{" "}
                            <span className={`capitalize font-medium ${
                              inst.status === "verified" ? "text-green-600" :
                              inst.status === "flagged" ? "text-red-600" :
                              "text-yellow-600"
                            }`}>
                              {inst.status}
                            </span>
                          </div>
                          <div><strong>Sensor Reading:</strong> {inst.sensorReading} cm</div>
                          {inst.latestDisCm && (
                            <div><strong>Server Reading:</strong> {inst.latestDisCm} cm</div>
                          )}
                          {inst.createdAt && (
                            <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                              Installed: {inst.createdAt.toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>No installations with coordinates found. Upload location coordinates first.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mobile: List below the map */}
        <Card className="lg:hidden border shadow-sm order-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Installations</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[60vh] overflow-y-auto">
            <InstallationsList />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

