"use client";

import { useEffect, useState } from "react";
import { DEFAULT_TZ, dayKeyOf, isDayKey } from "@/mbm/time";
import EntryPanel from "./EntryPanel";
import NowPanel from "./NowPanel";
import { MBM_OPEN, type MbmPanel } from "./open";

// Lives in the sidebar: slides in whichever Minute by Minute panel was asked for (see open.ts).
export default function MbmPanels() {
  const [panel, setPanel] = useState<MbmPanel | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => setPanel((e as CustomEvent<MbmPanel>).detail);
    window.addEventListener(MBM_OPEN, onOpen);
    return () => window.removeEventListener(MBM_OPEN, onOpen);
  }, []);

  if (!panel) return null;
  const close = () => setPanel(null);
  if (panel.kind === "now") return <NowPanel switching={Boolean(panel.switch)} onClose={close} />;
  // Adding: on the day you're looking at (?day=…), otherwise today.
  const viewing = new URLSearchParams(window.location.search).get("day");
  const dayKey = panel.dayKey ?? (window.location.pathname === "/mbm/day" && isDayKey(viewing) ? viewing : dayKeyOf(new Date(), DEFAULT_TZ));
  return (
    <EntryPanel
      key={`${panel.kind}-${dayKey}`}
      dayKey={dayKey}
      blockId={panel.kind === "edit" ? panel.blockId : undefined}
      span={panel.kind === "add" && panel.from && panel.to ? { from: panel.from, to: panel.to } : undefined}
      onClose={close}
    />
  );
}
