import type { Installation } from "@/lib/types";
import { translateTeamNameToArabic } from "@/lib/amanah-translations";

export type SqlExportFieldKey =
  | "amana_name"
  | "municipality_name"
  | "address"
  | "lat"
  | "lng"
  | "sumpdepth"
  | "binheight";

export const SQL_EXPORT_FIELD_OPTIONS: Array<{
  key: SqlExportFieldKey;
  label: string;
  description: string;
}> = [
  { key: "amana_name", label: "Amanah Name", description: "Arabic team / amanah name" },
  { key: "municipality_name", label: "Municipality Name", description: "From location reference or '-'" },
  { key: "address", label: "Address", description: "Location ID" },
  { key: "lat", label: "Latitude", description: "Location ref coords, or installer GPS for 9999" },
  { key: "lng", label: "Longitude", description: "Location ref coords, or installer GPS for 9999" },
  { key: "sumpdepth", label: "Sump Depth", description: "Installer reading (sensorReading)" },
  { key: "binheight", label: "Bin Height", description: "Server reading (latestDisCm)" },
];

export type CoordinateMode = "location" | "installer-gps";

export interface LocationLookup {
  latitude: number;
  longitude: number;
  municipalityName?: string;
}

export interface SqlExportRowInput {
  installation: Installation;
  teamName: string;
  lookupLocation: (locationId: string) => LocationLookup | null;
  coordinateMode: CoordinateMode;
  forceMunicipalityDash: boolean;
  selectedFields: Set<SqlExportFieldKey>;
}

export interface SqlExportOptions {
  rows: SqlExportRowInput[];
  selectedFields: SqlExportFieldKey[];
  includeFloodThresholds: boolean;
  scriptLabel: string;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNumber(value: number | null | undefined, decimals?: number): string {
  if (value == null || Number.isNaN(value)) return "NULL";
  if (decimals == null) return String(Math.round(value));
  // Keep full precision for coordinates; trim trailing zeros so ints stay clean (e.g. "21" not "21.000000")
  return String(Number(value.toFixed(decimals)));
}

function resolveCoordinates(
  installation: Installation,
  lookupLocation: (locationId: string) => LocationLookup | null,
  coordinateMode: CoordinateMode
): { lat: number | null; lng: number | null } {
  const locationId = installation.locationId ? String(installation.locationId).trim() : "";

  if (coordinateMode === "installer-gps" || locationId === "9999" || !locationId) {
    return {
      lat: installation.latitude ?? null,
      lng: installation.longitude ?? null,
    };
  }

  const location = lookupLocation(locationId);
  if (!location) {
    return { lat: null, lng: null };
  }

  return { lat: location.latitude, lng: location.longitude };
}

function buildRowValues(input: SqlExportRowInput): Record<SqlExportFieldKey, string | number | null> {
  const { installation, teamName, lookupLocation, coordinateMode, forceMunicipalityDash, selectedFields } =
    input;
  const locationId = installation.locationId ? String(installation.locationId).trim() : "";
  const location = locationId ? lookupLocation(locationId) : null;
  const coords = resolveCoordinates(installation, lookupLocation, coordinateMode);
  const amanahArabic = translateTeamNameToArabic(teamName) || teamName || "";

  const values: Record<SqlExportFieldKey, string | number | null> = {
    amana_name: amanahArabic,
    municipality_name: forceMunicipalityDash ? "-" : location?.municipalityName || "-",
    address: locationId || "",
    lat: coords.lat,
    lng: coords.lng,
    sumpdepth:
      typeof installation.sensorReading === "number" ? installation.sensorReading : null,
    binheight: typeof installation.latestDisCm === "number" ? installation.latestDisCm : null,
  };

  // Touch selectedFields so callers know it's intentional; all keys still populated for preview.
  void selectedFields;
  return values;
}

export function buildDeviceUpdateSql(options: SqlExportOptions): string {
  const { rows, selectedFields, includeFloodThresholds, scriptLabel } = options;
  const columns = ["device_uid", ...selectedFields];
  const lines: string[] = [
    `-- ${scriptLabel}`,
    "-- Auto-generated from FlowSet Console",
    `-- Fields: ${columns.join(", ")}`,
    "-- Cloud-safe: single statement, no BEGIN/COMMIT, no TEMP tables.",
    "",
    `WITH data(${columns.join(", ")}) AS (`,
    "  VALUES",
  ];

  const valueLines = rows.map((rowInput, index) => {
    const values = buildRowValues(rowInput);
    const parts = [
      sqlString(rowInput.installation.deviceId),
      ...selectedFields.map((field) => {
        const value = values[field];
        if (typeof value === "number") {
          const decimals = field === "lat" || field === "lng" ? 6 : undefined;
          return sqlNumber(value, decimals);
        }
        if (value == null || value === "") return "NULL";
        return sqlString(String(value));
      }),
    ];
    const suffix = index === rows.length - 1 ? "" : ",";
    return `    (${parts.join(", ")})${suffix}`;
  });

  lines.push(...valueLines);
  lines.push(")");
  lines.push("UPDATE devices AS d");
  lines.push("SET");

  const setLines = selectedFields.map((field, index) => {
    const targetCol = field === "binheight" ? "bin_height" : field;
    const comma = index < selectedFields.length - 1 || includeFloodThresholds ? "," : "";
    return `  ${targetCol.padEnd(22)} = COALESCE(data.${field}, d.${targetCol})${comma}`;
  });

  lines.push(...setLines);

  if (includeFloodThresholds) {
    lines.push("  low_flood_threshold     = 99,");
    lines.push("  medium_flood_threshold  = 99,");
    lines.push("  high_flood_threshold    = 99");
  }

  lines.push("FROM data");
  lines.push("WHERE d.device_uid = data.device_uid;");

  return lines.join("\n");
}

export function previewSqlRows(
  rows: SqlExportRowInput[],
  selectedFields: SqlExportFieldKey[],
  limit = 5
) {
  return rows.slice(0, limit).map((rowInput) => {
    const values = buildRowValues(rowInput);
    return {
      deviceId: rowInput.installation.deviceId,
      ...Object.fromEntries(selectedFields.map((field) => [field, values[field]])),
    };
  });
}
