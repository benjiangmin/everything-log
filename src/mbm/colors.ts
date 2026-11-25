// Colors new activities get, in turn: warm and earthy, readable against oat, and different
// enough from each other to tell apart on the day bar.
export const PALETTE = [
  "#7f5539", // mocha
  "#b08968", // latte
  "#6b8f71", // sage
  "#5e7b9b", // dusk blue
  "#c08552", // caramel
  "#8e6c8a", // plum
  "#a3473a", // brick
  "#4f6d5e", // pine
  "#d4a373", // honey
  "#6d597a", // lavender dusk
  "#9c6644", // cinnamon
  "#5f7470", // slate green
];

// ---------- Color themes (080) ----------
// A theme colors every job and category: the busiest get the first colors, which are ordered so
// neighbours differ. A color you pick yourself stays when the theme changes ("Reset to theme"
// gives it back). Each color reads against oat and holds white text and icons.
export type Theme = { id: string; name: string; colors: string[] };
export const THEMES: Theme[] = [
  { id: "earth", name: "Earth", colors: PALETTE },
  { id: "ocean", name: "Ocean", colors: ["#2f5d7c", "#4f9a94", "#c8a46e", "#5b7fa6", "#2c7a6b", "#8fb3c9", "#3e4f7a", "#7fb8a4", "#a8875a", "#46708c"] },
  { id: "sunset", name: "Sunset", colors: ["#c2553a", "#e09a4f", "#8e3f62", "#f0c06a", "#5c3d6e", "#d97b6c", "#a8455a", "#e8b28a", "#7a4f8a", "#b86b3d"] },
  { id: "forest", name: "Forest", colors: ["#3f6b4a", "#a57c4f", "#7a9a5c", "#5a4632", "#9bb38a", "#2f4f3e", "#c4a066", "#6e8b6a", "#8a5a3c", "#4d6b5d"] },
  { id: "berry", name: "Berry", colors: ["#8a2f4f", "#d0708a", "#4b2a5e", "#b4527a", "#e0a2b4", "#6b3f7a", "#9c4a64", "#c98aa8", "#5e2a42", "#a06aa0"] },
  { id: "pastel", name: "Pastel", colors: ["#8fb8d9", "#e3a6a1", "#a9cfa0", "#c9b2e0", "#f0c48a", "#9fd2c9", "#e8a8c8", "#b7c48a", "#a6b4e8", "#e5b99a"] },
  { id: "vivid", name: "Vivid", colors: ["#e4572e", "#2e86ab", "#f3a712", "#29bf12", "#a23b72", "#3d5a80", "#ef476f", "#118ab2", "#8338ec", "#06a77d"] },
  { id: "ink", name: "Ink", colors: ["#2b1c14", "#86705f", "#4a3a30", "#b8a493", "#5f4b3e", "#6e5a4c", "#3a2a20", "#a08b79", "#574538", "#c9b8a6"] },
];
export const themeById = (id: string | null | undefined) => THEMES.find((t) => t.id === id) ?? null;
