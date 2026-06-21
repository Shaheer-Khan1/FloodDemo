import { format } from "date-fns";

const TRACKED_FIELDS = [
  "deviceId",
  "locationId",
  "latitude",
  "longitude",
  "sensorReading",
] as const;

export type TrackedInstallationField = (typeof TRACKED_FIELDS)[number];

/** Archived snapshot key: `{fieldName}_{yyyy-MM-dd_HHmmss}` */
export function archivedFieldKey(fieldName: string, at: Date = new Date()): string {
  return `${fieldName}_${format(at, "yyyy-MM-dd_HHmmss")}`;
}

const ARCHIVED_KEY_PATTERN = new RegExp(
  `^(${TRACKED_FIELDS.join("|")})_\\d{4}-\\d{2}-\\d{2}_\\d{6}$`
);

export function isArchivedFieldKey(key: string): boolean {
  return ARCHIVED_KEY_PATTERN.test(key);
}

function valuesEqual(oldValue: unknown, newValue: unknown): boolean {
  if (Object.is(oldValue, newValue)) return true;
  if (
    typeof oldValue === "number" &&
    typeof newValue === "number" &&
    !Number.isNaN(oldValue) &&
    !Number.isNaN(newValue) &&
    oldValue === newValue
  ) {
    return true;
  }
  return String(oldValue ?? "") === String(newValue ?? "");
}

function hasArchiveableOldValue(oldValue: unknown): boolean {
  return oldValue !== undefined && oldValue !== null;
}

/**
 * Store the previous value under `{name}_{date}` and the new value under `{name}` only.
 * Skips when unchanged or when there is no prior value to archive.
 */
export function setArchivedFieldChange(
  payload: Record<string, unknown>,
  fieldName: string,
  oldValue: unknown,
  newValue: unknown,
  at: Date = new Date()
): boolean {
  if (valuesEqual(oldValue, newValue)) return false;

  if (hasArchiveableOldValue(oldValue)) {
    payload[archivedFieldKey(fieldName, at)] = oldValue;
  }
  payload[fieldName] = newValue;
  return true;
}

export function applyFieldUpdates(
  payload: Record<string, unknown>,
  changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>,
  at: Date = new Date()
): void {
  for (const { field, oldValue, newValue } of changes) {
    setArchivedFieldChange(payload, field, oldValue, newValue, at);
  }
}

/** Most recent archived value for a field (by dated key suffix). */
export function getLatestArchivedValue(
  data: Record<string, unknown>,
  fieldName: string
): unknown {
  const prefix = `${fieldName}_`;
  let bestKey: string | null = null;
  let bestValue: unknown;

  for (const key of Object.keys(data)) {
    if (!key.startsWith(prefix) || !isArchivedFieldKey(key)) continue;
    if (!bestKey || key.localeCompare(bestKey) > 0) {
      bestKey = key;
      bestValue = data[key];
    }
  }

  return bestValue;
}

/** Legacy `originalLocationId` or latest `locationId_{date}` archive. */
export function getPriorLocationId(data: Record<string, unknown>): string | null {
  if (data.originalLocationId != null && data.originalLocationId !== "") {
    return String(data.originalLocationId);
  }
  const archived = getLatestArchivedValue(data, "locationId");
  return archived != null && archived !== "" ? String(archived) : null;
}

export function hasPriorLocationId(data: Record<string, unknown>): boolean {
  return getPriorLocationId(data) != null;
}

export interface ArchivedInstallationSnapshot {
  /** Key suffix `yyyy-MM-dd_HHmmss` shared by archived fields from one change. */
  suffix: string;
  locationId?: string;
  latitude?: number;
  longitude?: number;
}

function parseArchivedNumber(value: unknown): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (value == null || value === "") return undefined;
  const parsed = parseFloat(String(value));
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseArchivedFieldKey(key: string): { field: string; suffix: string } | null {
  if (!isArchivedFieldKey(key)) return null;
  const match = key.match(/^(\w+)_(\d{4}-\d{2}-\d{2}_\d{6})$/);
  if (!match) return null;
  return { field: match[1], suffix: match[2] };
}

function collectArchivedSnapshots(
  data: Record<string, unknown>
): Map<string, ArchivedInstallationSnapshot> {
  const bySuffix = new Map<string, ArchivedInstallationSnapshot>();

  for (const key of Object.keys(data)) {
    const parsed = parseArchivedFieldKey(key);
    if (!parsed) continue;

    let snap = bySuffix.get(parsed.suffix);
    if (!snap) {
      snap = { suffix: parsed.suffix };
      bySuffix.set(parsed.suffix, snap);
    }

    const value = data[key];
    if (parsed.field === "latitude") {
      snap.latitude = parseArchivedNumber(value);
    } else if (parsed.field === "longitude") {
      snap.longitude = parseArchivedNumber(value);
    } else if (parsed.field === "locationId" && value != null && value !== "") {
      snap.locationId = String(value);
    }
  }

  return bySuffix;
}

/** All archived snapshots, newest suffix first. */
export function listArchivedSnapshots(
  data: Record<string, unknown>
): ArchivedInstallationSnapshot[] {
  const bySuffix = collectArchivedSnapshots(data);
  return Array.from(bySuffix.values()).sort((a, b) =>
    b.suffix.localeCompare(a.suffix)
  );
}

/** Snapshot for a specific archive suffix (e.g. `2026-05-17_150106`). */
export function getArchivedSnapshotBySuffix(
  data: Record<string, unknown>,
  suffix: string
): ArchivedInstallationSnapshot | null {
  if (!suffix) return null;
  return collectArchivedSnapshots(data).get(suffix) ?? null;
}

/** Latest archived lat/lon/locationId grouped by archive timestamp suffix. */
export function getLatestArchivedSnapshot(
  data: Record<string, unknown>
): ArchivedInstallationSnapshot | null {
  const snapshots = listArchivedSnapshots(data);
  return snapshots[0] ?? null;
}

export function hasArchivedCoordinates(data: Record<string, unknown>): boolean {
  return getLatestArchivedSnapshot(data) != null || getPriorLocationId(data) != null;
}
