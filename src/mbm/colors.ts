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
export type Theme = { id: string; name: string; colors: string[]; one?: boolean };

// (One color's shades, dark to light, put in an order where each differs from the one before.)
const spread = (shades: string[]) => [0, 5, 2, 7, 4, 9, 1, 6, 3, 8].map((i) => shades[i]);

export const THEMES: Theme[] = [
  // One color, in shades.
  { id: "red", name: "Red", one: true, colors: spread(["#6e1a1a", "#8c2525", "#a83232", "#c24444", "#d65c5c", "#e07a7a", "#b5524a", "#c9695f", "#e09a90", "#efbab3"]) },
  { id: "orange", name: "Orange", one: true, colors: spread(["#7a3f10", "#965018", "#b26222", "#cc762f", "#e08b42", "#eaa262", "#a8673a", "#c2804f", "#dba06e", "#f0c39a"]) },
  { id: "gold", name: "Gold", one: true, colors: spread(["#6b500c", "#856414", "#a07a1c", "#b88f27", "#cca437", "#dbba56", "#8e7a3c", "#a89253", "#c4ae6e", "#e3d09a"]) },
  { id: "green", name: "Green", one: true, colors: spread(["#1c4529", "#275c37", "#337347", "#428a58", "#58a26d", "#79b98a", "#3c5a37", "#557550", "#76966b", "#a7c99d"]) },
  { id: "blue", name: "Blue", one: true, colors: spread(["#18304f", "#21436c", "#2c5789", "#3c6ca4", "#5584bb", "#76a0cf", "#2c465e", "#46627c", "#67829d", "#a0bad6"]) },
  { id: "purple", name: "Purple", one: true, colors: spread(["#341d4e", "#472a6b", "#5b3a88", "#704ea3", "#8868ba", "#a589cf", "#45325a", "#5e4a76", "#7d6a96", "#bba9d9"]) },
  { id: "pink", name: "Pink", one: true, colors: spread(["#6b1a45", "#87265a", "#a23571", "#ba4b89", "#cf68a1", "#df8fbc", "#7e3655", "#9a4e6f", "#b96d8d", "#ebb7cf"]) },
  // Mixed.
  { id: "earth", name: "Earth", colors: PALETTE },
  { id: "ocean", name: "Ocean", colors: ["#2f5d7c", "#4f9a94", "#c8a46e", "#5b7fa6", "#2c7a6b", "#8fb3c9", "#3e4f7a", "#7fb8a4", "#a8875a", "#46708c"] },
  { id: "sunset", name: "Sunset", colors: ["#c2553a", "#e09a4f", "#8e3f62", "#f0c06a", "#5c3d6e", "#d97b6c", "#a8455a", "#e8b28a", "#7a4f8a", "#b86b3d"] },
  { id: "forest", name: "Forest", colors: ["#3f6b4a", "#a57c4f", "#7a9a5c", "#5a4632", "#9bb38a", "#2f4f3e", "#c4a066", "#6e8b6a", "#8a5a3c", "#4d6b5d"] },
  { id: "berry", name: "Berry", colors: ["#8a2f4f", "#d0708a", "#4b2a5e", "#b4527a", "#e0a2b4", "#6b3f7a", "#9c4a64", "#c98aa8", "#5e2a42", "#a06aa0"] },
  { id: "pastel", name: "Pastel", colors: ["#8fb8d9", "#e3a6a1", "#a9cfa0", "#c9b2e0", "#f0c48a", "#9fd2c9", "#e8a8c8", "#b7c48a", "#a6b4e8", "#e5b99a"] },
  { id: "ink", name: "Ink", colors: ["#2b1c14", "#86705f", "#4a3a30", "#b8a493", "#5f4b3e", "#6e5a4c", "#3a2a20", "#a08b79", "#574538", "#c9b8a6"] },
];
export const themeById = (id: string | null | undefined) => THEMES.find((t) => t.id === id) ?? null;
