/**
 * Client for the SmartEnds bridge API — returns live flood-sensor readings
 * for a given device.
 *
 * IMPORTANT: the API returns `sumpDepth`, `water_level`, and `raw_distance`
 * as distinct values. This client reads `raw_distance` — exposed here as
 * `SmartEndsReading.waterLevel`, which feeds `latestDisCm` and the "water
 * level" UI throughout the app — the API's own `sumpDepth`/`water_level`
 * fields are NOT used anywhere.
 *
 * NOTE: Per project constraints this is called directly from the browser
 * (no backend proxy exists in this app). VITE_SMARTENDS_API_KEY is bundled
 * into the client JS and is therefore visible to anyone inspecting the site
 * — treat it as a low-sensitivity key, not a real secret.
 */

export type SmartEndsErrorReason = "unauthorized" | "not_found" | "upstream_failure" | "invalid_response" | "network_error";

export class SmartEndsApiError extends Error {
  reason: SmartEndsErrorReason;
  status?: number;

  constructor(reason: SmartEndsErrorReason, message: string, status?: number) {
    super(message);
    this.name = "SmartEndsApiError";
    this.reason = reason;
    this.status = status;
  }
}

export interface SmartEndsReading {
  deviceId: string;
  waterLevel: number;
  timestamp: number; // epoch milliseconds
  datetime?: string; // ISO UTC string
}

interface SmartEndsRawResponse {
  success?: boolean;
  data?: {
    device_id?: string;
    uid?: string;
    timestamp?: number;
    datetime?: string;
    sumpDepth?: number;
    water_level?: number;
    raw_distance?: number;
    temperature?: number;
    battery?: number;
  };
}

function getBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_SMARTENDS_BASE_URL as string | undefined;
  if (!baseUrl) {
    throw new SmartEndsApiError("network_error", "VITE_SMARTENDS_BASE_URL is not configured");
  }
  return baseUrl.replace(/\/+$/, "");
}

function getApiKey(): string {
  return (import.meta.env.VITE_SMARTENDS_API_KEY as string | undefined) || "";
}

/**
 * Fetches the latest flood-sensor reading for a device from the SmartEnds
 * bridge API. Throws SmartEndsApiError on any failure — callers should
 * catch and inspect `.reason` to decide how to handle 404 ("no recent
 * reading") vs other failures.
 */
export async function fetchLatestSmartEndsReading(
  deviceId: string,
  timeoutMs = 15000
): Promise<SmartEndsReading> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/devices/${deviceId.toUpperCase()}/latest`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": getApiKey(),
        // Bypasses ngrok's free-tier browser interstitial (ERR_NGROK_6024), which
        // otherwise intercepts requests with a real browser User-Agent and returns
        // an HTML warning page with no CORS headers — surfacing as a CORS error.
        "ngrok-skip-browser-warning": "true",
      },
      signal: controller.signal,
    });
  } catch (error) {
    throw new SmartEndsApiError("network_error", `Network error contacting SmartEnds: ${error}`);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    throw new SmartEndsApiError("unauthorized", "SmartEnds API key missing or invalid (401)", 401);
  }
  if (response.status === 404) {
    throw new SmartEndsApiError("not_found", `No recent SmartEnds reading for device ${deviceId} (404)`, 404);
  }
  if (response.status === 502) {
    throw new SmartEndsApiError("upstream_failure", "SmartEnds upstream (MOMAH) failure (502)", 502);
  }
  if (!response.ok) {
    throw new SmartEndsApiError("invalid_response", `SmartEnds API returned HTTP ${response.status}`, response.status);
  }

  let json: SmartEndsRawResponse;
  try {
    json = await response.json();
  } catch (error) {
    throw new SmartEndsApiError("invalid_response", `Failed to parse SmartEnds response: ${error}`);
  }

  if (!json.success || !json.data) {
    throw new SmartEndsApiError("invalid_response", "SmartEnds response missing success/data");
  }

  // NOTE: the SmartEnds API returns `sumpDepth`, `water_level`, and `raw_distance`
  // as distinct values (they are NOT the same reading). This app uses
  // `raw_distance` only — the API's `sumpDepth`/`water_level` fields are
  // intentionally ignored.
  const { raw_distance, timestamp, datetime, device_id } = json.data;
  if (typeof raw_distance !== "number" || typeof timestamp !== "number") {
    throw new SmartEndsApiError("invalid_response", "SmartEnds response missing raw_distance/timestamp");
  }

  return {
    deviceId: device_id || deviceId,
    waterLevel: raw_distance,
    timestamp,
    datetime,
  };
}

/** Hits the unauthenticated /health endpoint. Returns true if the bridge is reachable. */
export async function checkSmartEndsHealth(timeoutMs = 8000): Promise<boolean> {
  try {
    const baseUrl = getBaseUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: "GET",
        headers: { "ngrok-skip-browser-warning": "true" },
        signal: controller.signal,
      });
      if (!response.ok) return false;
      const json = await response.json();
      return json?.status === "ok";
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}
