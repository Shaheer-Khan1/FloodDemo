import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLocation } from "wouter";
import type { Installation, Device, Location, Team } from "@/lib/types";

export default function ApiInstallations() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [location] = useLocation();

  // Parse query parameters
  const params = useMemo(() => {
    const searchParams = new URLSearchParams(location.split("?")[1] || "");
    return {
      format: searchParams.get("format") || "enriched", // enriched, simple, raw
      teamId: searchParams.get("teamId") || null,
      status: searchParams.get("status") || null,
      limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : null,
      includeDevices: searchParams.get("includeDevices") !== "false",
      includeLocations: searchParams.get("includeLocations") !== "false",
      includeTeams: searchParams.get("includeTeams") !== "false",
    };
  }, [location]);

  useEffect(() => {
    fetchAllData();
  }, [params]);

  const fetchAllData = async () => {
    try {
      setLoading(true);

      // Fetch all installations
      const installationsSnap = await getDocs(collection(db, "installations"));
      const installations = installationsSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
          verifiedAt: data.verifiedAt?.toDate?.()?.toISOString() || data.verifiedAt,
          systemPreVerifiedAt: data.systemPreVerifiedAt?.toDate?.()?.toISOString() || data.systemPreVerifiedAt,
          escalatedAt: data.escalatedAt?.toDate?.()?.toISOString() || data.escalatedAt,
          serverRefreshedAt: data.serverRefreshedAt?.toDate?.()?.toISOString() || data.serverRefreshedAt,
        };
      });

      // Fetch all devices
      const devicesSnap = await getDocs(collection(db, "devices"));
      const devices = devicesSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        };
      });

      // Fetch all locations
      const locationsSnap = await getDocs(collection(db, "locations"));
      const locations = locationsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Fetch all teams
      const teamsSnap = await getDocs(collection(db, "teams"));
      const teams = teamsSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        };
      });

      // Enrich installations with related data
      const enrichedInstallations = installations.map((installation) => {
        const device = devices.find((d) => d.id === installation.deviceId);
        const location = locations.find((l) => l.locationId === installation.locationId);
        const team = teams.find((t) => t.id === installation.teamId);

        return {
          ...installation,
          device: device || null,
          location: location || null,
          team: team || null,
        };
      });

      const response = {
        success: true,
        timestamp: new Date().toISOString(),
        count: enrichedInstallations.length,
        data: {
          installations: enrichedInstallations,
          metadata: {
            totalInstallations: installations.length,
            totalDevices: devices.length,
            totalLocations: locations.length,
            totalTeams: teams.length,
          },
        },
      };

      setData(response);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch data");
      setLoading(false);
    }
  };

  // Return JSON response
  if (loading) {
    return (
      <pre style={{ padding: "20px", fontFamily: "monospace" }}>
        {JSON.stringify(
          {
            success: false,
            loading: true,
            message: "Loading installation data...",
          },
          null,
          2
        )}
      </pre>
    );
  }

  if (error) {
    return (
      <pre style={{ padding: "20px", fontFamily: "monospace" }}>
        {JSON.stringify(
          {
            success: false,
            error: error,
            timestamp: new Date().toISOString(),
          },
          null,
          2
        )}
      </pre>
    );
  }

  return (
    <pre style={{ padding: "20px", fontFamily: "monospace", fontSize: "12px" }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

