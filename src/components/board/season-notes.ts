// Which seasons you've watched, from your anime doc. Matched against a show's title on the
// Anime page (your own spelling or AniList's). Used by "Add seasons" to tick the right boxes;
// you can still change anything before adding.
//   all           every season
//   upTo          the first N seasons
//   allButNewest  everything except the newest season
//   droppedNewest everything, with the newest one under Stopped
//   skip          leave out seasons whose title matches this
// Shows not listed here start with nothing ticked.

export type SeasonNote = {
  title: RegExp;
  rule: "all" | "upTo" | "allButNewest" | "droppedNewest";
  n?: number;
  skip?: RegExp;
};

export const SEASON_NOTES: SeasonNote[] = [
  { title: /one[\s-]*punch/i, rule: "upTo", n: 2 },
  { title: /sword art online/i, rule: "all" },
  { title: /haikyu/i, rule: "all" },
  { title: /^mha$|hero academia/i, rule: "upTo", n: 5 },
  { title: /^fma$|fullmetal/i, rule: "all" },
  { title: /death note/i, rule: "all" },
  { title: /kakegurui/i, rule: "all" },
  { title: /promised neverland/i, rule: "all" },
  { title: /attack on titan|shingeki/i, rule: "all" },
  { title: /assassination classroom/i, rule: "all" },
  { title: /demon slayer|kimetsu/i, rule: "all" },
  { title: /love is war|kaguya/i, rule: "upTo", n: 2 },
  { title: /your lie in april/i, rule: "all" },
  { title: /dr\.?\s*stone/i, rule: "allButNewest" },
  { title: /mob psycho/i, rule: "all" },
  { title: /no game,? no life/i, rule: "all" },
  { title: /devil is a part[\s-]*timer/i, rule: "all" },
  { title: /jujutsu kaisen/i, rule: "all" },
  { title: /^naruto$/i, rule: "all", skip: /boruto/i },
  { title: /fire force|enen/i, rule: "droppedNewest" },
  { title: /tokyo revengers/i, rule: "droppedNewest" },
  { title: /saiki/i, rule: "all" },
  { title: /made in abyss/i, rule: "all" },
  { title: /cowboy bebop/i, rule: "all" },
  { title: /jojo/i, rule: "all", skip: /steel ball/i },
  { title: /vinland/i, rule: "all" },
  { title: /spy\s*x\s*family/i, rule: "allButNewest" },
  { title: /^baki/i, rule: "all" },
  { title: /chainsaw man/i, rule: "all" },
  { title: /hell['’]?s paradise/i, rule: "all" },
  { title: /solo leveling/i, rule: "all" },
  { title: /frieren|friern/i, rule: "all" },
];

export const noteFor = (title: string) => SEASON_NOTES.find((n) => n.title.test(title.trim())) ?? null;
