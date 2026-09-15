// Corporate-group mapping for end clients.
// Matching is case-insensitive on the end-client name (Final Client, or Account when empty).
// Add brands here when a new maison or subsidiary becomes a client.

export type GroupRule = { group: string; pattern: RegExp };

export const LVMH_GROUP = 'LVMH';

export const GROUP_RULES: GroupRule[] = [
  {
    group: LVMH_GROUP,
    pattern:
      /\b(lvmh|fendi|bulgari|bvlgari|loro piana|tiffany|givenchy|tag heuer|acqua di parma|dior|celine|berluti|kenzo|sephora|rimowa|guerlain|marc jacobs|fenty|repossi|chaumet|zenith|hublot|emilio pucci|pucci|belmond|moynat|loewe|patou|benefit cosmetics|make up for ever|cheval blanc|dom p[ée]rignon|mo[ëe]t|hennessy|ruinart|krug|veuve clicquot|le bon march[ée]|dfs group)\b/i,
  },
  { group: 'Prada Group', pattern: /\b(prada|miu miu|church'?s|car shoe|marchesi 1824)\b/i },
  { group: 'Edison', pattern: /\bedison\b/i },
  { group: 'Admiral Group', pattern: /\b(admiral|conte\.it|qualitas)\b/i },
  { group: 'Kering', pattern: /\b(gucci|saint laurent|bottega veneta|balenciaga|alexander mcqueen|brioni|pomellato|boucheron|ginori|kering)\b/i },
  { group: 'Richemont', pattern: /\b(cartier|van cleef|montblanc|chlo[ée]|iwc|jaeger|panerai|piaget|vacheron|buccellati|richemont)\b/i },
];

export function groupOf(clientName: string): string {
  for (const r of GROUP_RULES) if (r.pattern.test(clientName)) return r.group;
  return clientName;
}

export function isLvmh(clientName: string): boolean {
  return groupOf(clientName) === LVMH_GROUP;
}

// Pass-through partner: deals billed to this account WITHOUT a Final Client
// are treated as pass-through (Kleecks retains only a share of the value).
export const PASS_THROUGH_ACCOUNT = /execus/i;
