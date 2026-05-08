/**
 * Global priority — merges typed scores into one ranked list (read-only).
 */

export type GlobalPrioritySource =
  | "follow_up"
  | "vip_recovery"
  | "quote_acceleration"
  | "revenue_snapshot"
  | "manual";

export type GlobalPriorityItem = {
  id: string;
  label: string;
  source: GlobalPrioritySource;
  score: number;
  reason: string;
  suggestedAction: string;
};

/**
 * Single ranked output: higher score first, stable tie-break by id.
 */
export function rankGlobalPriority(
  items: GlobalPriorityItem[]
): GlobalPriorityItem[] {
  const copy = [...items];
  copy.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });
  return copy;
}
