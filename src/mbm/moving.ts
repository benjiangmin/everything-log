// Activities where you're on the move: hovering one on the day bar lights up the route on the
// map; anything else lights up the stop you were at. Just Commute for now (later: Running,
// Biking…, and spotting them by themselves).
const MOVING = new Set(["commute"]);

export const isMoving = (name: string | undefined | null) => Boolean(name && MOVING.has(name.trim().toLowerCase()));
