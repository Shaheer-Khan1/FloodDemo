/** Marker tag written on every bulk coordinate / location ID update */
export const BULK_UPDATE_TAG = "bulk-update";

/** Marker tag set when a verifier edits an installation on the verification screen */
export const VERIFIER_EDIT_TAG = "edited by verifier";

/** Default window for “recently edited” installations */
export const BULK_UPDATE_RECENT_DAYS = 3;

export type RecentEditSource = "bulk" | "verifier";

export function firestoreToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** True if installation tags indicate a bulk spreadsheet update */
export function hasBulkUpdateTag(tags: string[] | undefined | null): boolean {
  if (!tags?.length) return false;
  return tags.some(
    (t) => t === BULK_UPDATE_TAG || t.toLowerCase().includes("updated via bulk import")
  );
}

/** True if installation tags indicate a verifier edit on the verification screen */
export function hasVerifierEditTag(tags: string[] | undefined | null): boolean {
  if (!tags?.length) return false;
  return tags.some((t) => t === VERIFIER_EDIT_TAG);
}

function isWithinRecentEditWindow(
  updatedAt: unknown,
  days = BULK_UPDATE_RECENT_DAYS
): boolean {
  const edited = firestoreToDate(updatedAt);
  if (!edited) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return edited >= cutoff;
}

/** Bulk-updated within the last N days (default 7) */
export function wasBulkEditedRecently(
  updatedAt: unknown,
  tags: string[] | undefined | null,
  days = BULK_UPDATE_RECENT_DAYS
): boolean {
  if (!hasBulkUpdateTag(tags)) return false;
  return isWithinRecentEditWindow(updatedAt, days);
}

/** Verifier-edited within the last N days (default 7) */
export function wasVerifierEditedRecently(
  updatedAt: unknown,
  tags: string[] | undefined | null,
  days = BULK_UPDATE_RECENT_DAYS
): boolean {
  if (!hasVerifierEditTag(tags)) return false;
  return isWithinRecentEditWindow(updatedAt, days);
}

/** Bulk- or verifier-edited within the last N days (default 7) */
export function wasRecentlyEdited(
  updatedAt: unknown,
  tags: string[] | undefined | null,
  days = BULK_UPDATE_RECENT_DAYS
): boolean {
  if (!isWithinRecentEditWindow(updatedAt, days)) return false;
  return hasBulkUpdateTag(tags) || hasVerifierEditTag(tags);
}

/** Which recent-edit sources apply (bulk import, verification screen, or both) */
export function getRecentEditSources(
  tags: string[] | undefined | null
): RecentEditSource[] {
  const sources: RecentEditSource[] = [];
  if (hasBulkUpdateTag(tags)) sources.push("bulk");
  if (hasVerifierEditTag(tags)) sources.push("verifier");
  return sources;
}

export function getBulkUpdateCutoffDate(days = BULK_UPDATE_RECENT_DAYS): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}
