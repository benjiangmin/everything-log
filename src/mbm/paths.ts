// Minute by Minute's own address. Its pages live under src/app/mbm (/mbm/day…), and on its own
// domain they're served without the /mbm: minutexminute.com/day (src/proxy.ts rewrites them).
// benbadobee.com/mbm/… sends you there, apart from the phone's API, Google's sign-in return and
// the everything-log home's own sign-in (so the everything-log's Minute by Minute card still works).
export const MBM_ORIGIN = "https://minutexminute.com";

// (mbm.localhost:3000 for trying it on your computer.)
export function isMbmHost(host: string | null | undefined) {
  const h = (host ?? "").split(":")[0].toLowerCase();
  return h === "minutexminute.com" || h === "www.minutexminute.com" || h === "mbm.localhost";
}

// /mbm/day → /day (and /mbm → /).
export function clean(path: string) {
  if (path === "/mbm") return "/";
  return path.startsWith("/mbm/") ? path.slice(4) : path;
}

// Where an address's pages are: "" on Minute by Minute's own domain, "/mbm" on the old one.
export const baseFor = (origin: string) => (isMbmHost(new URL(origin).host) ? "" : "/mbm");
