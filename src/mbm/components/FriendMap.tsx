"use client";

import DayMapInner from "./DayMapInner";
import { KEY } from "./mapBits";
import type { Activity, Block, RoutePoint, Visit } from "@/mbm/data";

type Stop = { arrived: string; departed: string | null; lat: number; lng: number; name: string | null };

// Someone's day on the map (close friends, when they share it): the same map as your Day page,
// routes joined to stops, just to look at (nothing to click and change, and nothing of yours used).
export default function FriendMap({ stops, route, tz, blocks, activities }: { stops: Stop[]; route: [number, number, string][]; tz: string; blocks: Block[]; activities: Activity[] }) {
  if (!KEY) return <p className="rounded-card bg-surface px-5 py-4 text-sm text-muted">The map needs NEXT_PUBLIC_GOOGLE_MAPS_KEY.</p>;
  if (!stops.length && !route.length) return <p className="rounded-card bg-surface px-5 py-4 text-sm text-muted">No places yet.</p>;
  const visits: Visit[] = stops.map((s, i) => ({ id: `stop-${i}`, arrived_at: s.arrived, departed_at: s.departed, lat: s.lat, lng: s.lng, place: s.name, auto_name: null, outline: null }));
  const points: RoutePoint[] = route.map(([lat, lng, at]) => ({ lat, lng, at }));
  return (
    // (isolate: the map's own layers stay under the page's popups.)
    <div className="relative isolate h-[28rem] overflow-hidden rounded-card ring-1 ring-line">
      <div className="absolute inset-0">
        <DayMapInner visits={visits} points={points} tz={tz} focus={null} blocks={blocks} activities={activities} viewOnly />
      </div>
    </div>
  );
}
