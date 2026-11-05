// Opening Minute by Minute's side panels from anywhere on the page (the sidebar buttons, the
// "now" card, clicking an entry on the bar). The sidebar listens and slides the panel in.
export type MbmPanel = { kind: "now" } | { kind: "add"; dayKey?: string } | { kind: "edit"; dayKey: string; blockId: string };

export const MBM_OPEN = "mbm:open";

export function openMbm(panel: MbmPanel) {
  window.dispatchEvent(new CustomEvent<MbmPanel>(MBM_OPEN, { detail: panel }));
}
