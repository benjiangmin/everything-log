// How long you're likely to live, and what that time goes to. No AI: published tables, and your
// own history.
//
// Life expectancy: CDC/NCHS, United States Life Tables, 2024 (NVSR vol. 75 no. 5, Aug 2026),
// Table A: years of life left at each age, by sex and by race and Hispanic origin. Between the
// ages listed, it's read off a straight line. Where you live: CDC/NCHS, U.S. State Life Tables,
// 2022 (NVSR vol. 74 no. 12): your state's life expectancy against the U.S.'s (77.5 that year)
// scales the years left. All of it is an average for people like you, not a forecast for you.

export type Sex = "female" | "male";
export type Race = "hispanic" | "aian" | "asian" | "black" | "white" | "other";
export type Education = "less_hs" | "hs" | "some_college" | "bachelors";
export type Smoking = "never" | "former" | "current";
export type Exercise = "none" | "lt75" | "75_149" | "150_299" | "300_449" | "450";
export type Profile = {
  name: string | null;
  birthday: string | null;
  sex: Sex | null;
  race: Race | null;
  state: string | null;
  education?: Education | null;
  smoking?: Smoking | null;
  exercise?: Exercise | null;
  skipped: boolean;
};

// Beyond the life table: three things with big, well-measured effects, as years added to (or
// taken from) the average for people like you. Rough by nature: each study compares groups,
// and the table's average already mixes everyone, so each is measured against that mix.
//
// Education: IHME, Lancet Public Health 2025, life expectancy at 25 in 2019 by education
//   (college 84.2, some college 82.1, high school 77.3, less 73.5), against their weighted
//   average (~80.7). Still in college counts as your degree's group.
// Smoking: Jha et al., NEJM 2013: current smokers lose 10+ years against never-smokers;
//   quitting before 35 gives back about 10. Against today's mix (~1 in 9 adults smoke).
// Exercise: Moore et al., PLOS Medicine 2012, years gained against none (75 min/week: 1.8,
//   75-149: 2.5, 150-299: 3.4, 300-449: 4.2, 450+: 4.5), against the typical mix.
export const EDUCATION: { id: Education; label: string; years: number }[] = [
  { id: "less_hs", label: "Didn't finish high school", years: -7.2 },
  { id: "hs", label: "High school or GED", years: -3.4 },
  { id: "some_college", label: "Some college or an associate degree", years: 1.4 },
  { id: "bachelors", label: "Bachelor's", years: 3.5 },
];
export const SMOKING: { id: Smoking; label: string; years: number }[] = [
  { id: "never", label: "Never smoked", years: 1.0 },
  { id: "former", label: "Used to, quit", years: 0 },
  { id: "current", label: "Smoke now", years: -9.0 },
];
export const EXERCISE: { id: Exercise; label: string; years: number }[] = [
  { id: "none", label: "Hardly any", years: -2.6 },
  { id: "lt75", label: "Under 75 min/week", years: -0.8 },
  { id: "75_149", label: "75–150 min/week", years: -0.1 },
  { id: "150_299", label: "150–300 min/week", years: 0.8 },
  { id: "300_449", label: "300–450 min/week", years: 1.6 },
  { id: "450", label: "450+ min/week", years: 1.9 },
];

// The adjustments that apply, with what each is.
export function adjustments(p: Profile): { label: string; years: number }[] {
  const out: { label: string; years: number }[] = [];
  const e = EDUCATION.find((x) => x.id === p.education);
  if (e) out.push({ label: e.label, years: e.years });
  const s = SMOKING.find((x) => x.id === p.smoking);
  if (s) out.push({ label: s.label, years: s.years });
  const x = EXERCISE.find((y) => y.id === p.exercise);
  if (x) out.push({ label: `Exercise: ${x.label.toLowerCase()}`, years: x.years });
  return out;
}

export const RACES: { id: Race; label: string }[] = [
  { id: "hispanic", label: "Hispanic or Latino" },
  { id: "aian", label: "American Indian or Alaska Native" },
  { id: "asian", label: "Asian" },
  { id: "black", label: "Black" },
  { id: "white", label: "White" },
  { id: "other", label: "Another, more than one, or rather not say" },
];

const AGES = [0, 1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
// [group][sex: total, male, female][age index]: years left.
const TABLE: Record<Race, [number[], number[], number[]]> = {
  other: [
    [79.0, 78.4, 74.5, 69.5, 64.6, 59.7, 55.0, 50.3, 45.6, 41.0, 36.5, 32.0, 27.7, 23.6, 19.7, 16.0, 12.5, 9.4, 6.7, 4.6, 3.2, 2.2],
    [76.5, 76.0, 72.1, 67.1, 62.2, 57.4, 52.7, 48.1, 43.5, 39.0, 34.6, 30.3, 26.1, 22.1, 18.4, 14.9, 11.6, 8.6, 6.1, 4.2, 2.9, 2.0],
    [81.4, 80.9, 76.9, 72.0, 67.0, 62.1, 57.3, 52.4, 47.6, 42.9, 38.3, 33.7, 29.2, 24.9, 20.8, 16.9, 13.2, 9.9, 7.1, 4.9, 3.3, 2.3],
  ],
  hispanic: [
    [81.8, 81.2, 77.3, 72.3, 67.4, 62.5, 57.8, 53.1, 48.4, 43.8, 39.2, 34.6, 30.2, 25.9, 21.8, 17.8, 14.2, 10.8, 7.8, 5.5, 3.8, 2.7],
    [79.2, 78.6, 74.6, 69.7, 64.7, 59.9, 55.3, 50.7, 46.2, 41.6, 37.2, 32.7, 28.4, 24.3, 20.3, 16.6, 13.2, 9.9, 7.2, 5.0, 3.4, 2.4],
    [84.3, 83.7, 79.8, 74.8, 69.8, 64.9, 60.1, 55.2, 50.4, 45.6, 40.9, 36.2, 31.6, 27.1, 22.8, 18.6, 14.7, 11.1, 8.0, 5.5, 3.7, 2.5],
  ],
  aian: [
    [71.1, 70.8, 67.0, 62.1, 57.2, 52.5, 48.1, 43.8, 39.8, 35.9, 32.2, 28.7, 25.3, 22.3, 19.2, 16.3, 13.6, 11.0, 8.8, 6.9, 5.5, 4.4],
    [67.8, 67.5, 63.7, 58.8, 53.9, 49.3, 45.0, 41.0, 37.1, 33.5, 29.9, 26.6, 23.5, 20.8, 18.1, 15.5, 13.2, 10.7, 8.7, 7.0, 5.6, 4.6],
    [74.6, 74.2, 70.3, 65.4, 60.5, 55.7, 51.2, 46.7, 42.4, 38.4, 34.4, 30.7, 27.0, 23.5, 20.1, 16.8, 13.7, 11.0, 8.6, 6.6, 5.0, 3.9],
  ],
  asian: [
    [85.8, 85.1, 81.2, 76.2, 71.2, 66.3, 61.5, 56.6, 51.7, 46.9, 42.1, 37.3, 32.7, 28.1, 23.7, 19.4, 15.4, 11.6, 8.4, 5.7, 3.8, 2.6],
    [83.7, 83.0, 79.0, 74.1, 69.1, 64.2, 59.4, 54.5, 49.7, 44.9, 40.1, 35.5, 30.9, 26.5, 22.2, 18.1, 14.3, 10.8, 7.7, 5.2, 3.4, 2.4],
    [87.7, 87.0, 83.0, 78.1, 73.1, 68.2, 63.2, 58.3, 53.4, 48.5, 43.6, 38.8, 34.0, 29.4, 24.8, 20.3, 16.1, 12.2, 8.7, 5.9, 3.9, 2.6],
  ],
  black: [
    [74.8, 74.6, 70.7, 65.8, 60.9, 56.2, 51.6, 47.1, 42.6, 38.2, 33.9, 29.7, 25.6, 21.8, 18.3, 15.1, 12.2, 9.4, 7.0, 5.2, 3.8, 2.8],
    [71.3, 71.1, 67.3, 62.4, 57.5, 52.9, 48.5, 44.1, 39.7, 35.4, 31.3, 27.3, 23.4, 19.8, 16.5, 13.6, 10.9, 8.4, 6.3, 4.6, 3.3, 2.5],
    [78.2, 78.0, 74.1, 69.2, 64.2, 59.4, 54.6, 49.9, 45.2, 40.6, 36.2, 31.8, 27.6, 23.5, 19.8, 16.3, 13.0, 10.0, 7.4, 5.4, 3.9, 2.8],
  ],
  white: [
    [78.9, 78.3, 74.3, 69.4, 64.4, 59.6, 54.8, 50.0, 45.3, 40.7, 36.2, 31.8, 27.5, 23.3, 19.5, 15.8, 12.3, 9.2, 6.5, 4.5, 3.0, 2.1],
    [76.7, 76.0, 72.1, 67.1, 62.2, 57.4, 52.6, 48.0, 43.4, 38.9, 34.5, 30.1, 25.9, 21.9, 18.2, 14.7, 11.4, 8.5, 6.0, 4.0, 2.7, 1.9],
    [81.3, 80.6, 76.6, 71.7, 66.7, 61.8, 56.9, 52.1, 47.3, 42.6, 37.9, 33.4, 29.0, 24.7, 20.6, 16.7, 13.0, 9.7, 6.9, 4.7, 3.2, 2.2],
  ],
};

// Life expectancy at birth by state, 2022 (the U.S.: 77.5).
export const STATES: Record<string, number> = {
  Alabama: 73.8, Alaska: 75.8, Arizona: 76.7, Arkansas: 73.9, California: 79.3, Colorado: 78.5, Connecticut: 79.4, Delaware: 76.5,
  "District of Columbia": 76.6, Florida: 77.9, Georgia: 75.9, Hawaii: 80.0, Idaho: 78.4, Illinois: 77.5, Indiana: 75.4, Iowa: 77.9,
  Kansas: 76.5, Kentucky: 73.6, Louisiana: 73.8, Maine: 76.6, Maryland: 77.8, Massachusetts: 79.8, Michigan: 76.8, Minnesota: 79.3,
  Mississippi: 72.6, Missouri: 75.2, Montana: 77.3, Nebraska: 78.3, Nevada: 76.4, "New Hampshire": 78.7, "New Jersey": 79.6,
  "New Mexico": 74.5, "New York": 79.5, "North Carolina": 75.9, "North Dakota": 77.9, Ohio: 75.6, Oklahoma: 73.8, Oregon: 77.7,
  Pennsylvania: 77.3, "Rhode Island": 79.2, "South Carolina": 75.1, "South Dakota": 77.3, Tennessee: 73.8, Texas: 77.1, Utah: 79.0,
  Vermont: 78.3, Virginia: 77.5, Washington: 78.4, "West Virginia": 72.2, Wisconsin: 78.1, Wyoming: 76.8,
};
const US_2022 = 77.5;

const YEAR = 365.2425 * 24 * 3600_000;

export function ageAt(birthday: string, now: number): number {
  return (now - +new Date(`${birthday}T12:00:00`)) / YEAR;
}

// Years left, for someone this age (and sex, group, state). Past 100: the 100 row.
export function yearsLeft(age: number, sex: Sex | null, race: Race | null, state: string | null): number {
  const row = TABLE[race ?? "other"][sex === "male" ? 1 : sex === "female" ? 2 : 0];
  let left = row[row.length - 1];
  for (let i = 0; i < AGES.length - 1; i++) {
    if (age >= AGES[i] && age < AGES[i + 1]) {
      const f = (age - AGES[i]) / (AGES[i + 1] - AGES[i]);
      left = row[i] + (row[i + 1] - row[i]) * f;
      break;
    }
  }
  const s = state ? STATES[state] : undefined;
  return s ? left * (s / US_2022) : left;
}

export const RACE_LABEL = (r: Race | null) => RACES.find((x) => x.id === r)?.label ?? "everyone";

// What the rest of your life goes to, per day. Yours (from what you've tracked) once there are a
// week of days to go on; otherwise U.S. averages: sleep, American Time Use Survey 2024 (9.04
// h/day, ages 15+); commuting, Census ACS 2024 (27.2 min each way, about 250 workdays a year).
export type Ahead = { key: string; label: string; perDay: number; mine: boolean; source: string; color: string };

export function aheadItems(avg: { days: number; perDay: Record<string, number>; screenPerDay: number } | null, colors: Record<string, string>): Ahead[] {
  const enough = avg && avg.days >= 7;
  const mine = (name: string) => (enough ? avg!.perDay[name] : undefined);
  const days = enough ? `your last ${avg!.days} tracked days` : "";
  const out: Ahead[] = [];
  const sleep = mine("Sleep");
  out.push(
    sleep
      ? { key: "Sleep", label: "Sleeping", perDay: sleep, mine: true, source: days, color: colors.Sleep ?? "#8e6c8a" }
      : { key: "Sleep", label: "Sleeping", perDay: 9.04 * 3600, mine: false, source: "U.S. average (American Time Use Survey, 2024)", color: colors.Sleep ?? "#8e6c8a" },
  );
  const commute = mine("Commute");
  out.push(
    commute
      ? { key: "Commute", label: "Commute", perDay: commute, mine: true, source: days, color: colors.Commute ?? "#c9b8a6" }
      : { key: "Commute", label: "Commuting", perDay: ((27.2 * 2 * 250) / 365) * 60, mine: false, source: "U.S. average (Census ACS, 2024)", color: colors.Commute ?? "#c9b8a6" },
  );
  if (enough && avg!.screenPerDay > 60) out.push({ key: "screen", label: "Screen time", perDay: avg!.screenPerDay, mine: true, source: days, color: "#6d7f99" });
  // Then everything else you track (10 min a week or more), biggest first. (The page shows sleep
  // and phone by default; these only when you add them: most won't last 10 years.)
  if (enough) {
    for (const [name, secs] of Object.entries(avg!.perDay).sort((a, b) => b[1] - a[1])) {
      if (name === "Sleep" || name === "Commute" || secs < 600 / 7) continue;
      out.push({ key: name, label: name, perDay: secs, mine: true, source: days, color: colors[name] ?? "#d4a373" });
    }
  }
  return out;
}
