// Is a place you pick for a stop (or an entry) next to where your phone had you? Judged by
// buildings, not a distance: nothing but open ground (streets, sidewalks, lawns) between the
// phone's spot and the place's building. Across Lake St from the Extension Bldg to Theory: fine.
// Halfway across campus: no, the phone can't be that wrong. (Run in your browser: the building
// map answers browsers more readily than the website's server.)
import { nearCheckInfo } from "@/app/mbm/actions";
import { closestOnOutline, nothingBetween } from "./buildings";

// null: fine. Otherwise what to tell you.
export async function notNextTo(
  of: { visitId?: string; blockId?: string },
  place: { placeId?: string; lat?: number; lng?: number },
  name = "That place",
): Promise<string | null> {
  const info = await nearCheckInfo(of, place).catch(() => null);
  if (!info) return "Couldn't check where your phone had you. Try again in a moment.";
  const { spots, target } = info;
  if (!target || !spots.length) return null; // (nothing recorded to go against)
  // (All the spots at once, not one after another.)
  const answers = await Promise.all(
    spots.map((s) => nothingBetween(s, target.outline && target.outline.length >= 3 ? closestOnOutline(target.outline, s[0], s[1]) : [target.lat, target.lng])),
  );
  if (answers.includes(false)) return `${name} isn't next to where your phone had you. Pick a place in or right next to that building.`;
  if (answers.includes(undefined)) return "Couldn't check the buildings around there right now. Try again in a moment.";
  return null;
}

// Moving a stop: only to a spot next to where the phone had you.
export async function cantMoveTo(visitId: string, lat: number, lng: number): Promise<string | null> {
  const info = await nearCheckInfo({ visitId }, { lat, lng }).catch(() => null);
  if (!info) return "Couldn't check where your phone had you. Try again in a moment.";
  const answers = await Promise.all(info.spots.map((s) => nothingBetween(s, [lat, lng])));
  if (answers.includes(false)) return "Too far from where your phone had you: drop it in or right next to that building.";
  if (answers.includes(undefined)) return "Couldn't check the buildings around there right now. Try again in a moment.";
  return null;
}

// The same, for a place picked in the search (one of yours, or a real one from the map).
export function pickIsNear(
  of: { visitId?: string; blockId?: string },
  pick: { kind: "mine"; id: string } | { kind: "real"; name: string; lat: number; lng: number } | null,
): Promise<string | null> {
  if (!pick) return Promise.resolve(null);
  return pick.kind === "mine" ? notNextTo(of, { placeId: pick.id }) : notNextTo(of, { lat: pick.lat, lng: pick.lng }, pick.name);
}
