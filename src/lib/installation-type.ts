/** Stored on installations — Culvert (code 2) or Waterway (code 3). */
export type InstallationTypeLabel = "Culvert" | "Waterway";

const TYPE_CODE_MAP: Record<string, InstallationTypeLabel> = {
  "2": "Culvert",
  "3": "Waterway",
};

/**
 * Parse spreadsheet type cell. Returns null for empty, "1", or unknown values (skipped on import).
 */
export function parseInstallationTypeCode(raw: unknown): InstallationTypeLabel | null {
  const s = String(raw ?? "").trim();
  if (!s || s === "1") return null;

  if (TYPE_CODE_MAP[s]) return TYPE_CODE_MAP[s];

  const lower = s.toLowerCase();
  if (lower === "culvert") return "Culvert";
  if (lower === "waterway") return "Waterway";

  return null;
}
