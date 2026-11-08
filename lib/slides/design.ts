/**
 * How a carousel slide looks.
 *
 * Kept apart from the renderer so the look can be argued about in one
 * place. The rules below are what make a set of slides read as one deck
 * rather than seven unrelated pictures.
 */

export interface SlideTheme {
  id: string;
  label: string;
  bg: string;
  ink: string;
  dim: string;
  /** The primary accent: badges, rules, the progress bar. */
  accent: string;
  /** Ink that sits legibly on the accent colour. */
  onAccent: string;
  /** The secondary line colour, used thin and sparingly. */
  trim: string;
  /** Whether the shipped logo suits this background. */
  logo: boolean;
}

/**
 * Three themes, not thirty. A carousel's job is to look like it came from
 * one person, and the fastest way to look amateur is a different palette
 * every week.
 *
 * "Rise Up" is the default and the real one: colours sampled out of the
 * team logo rather than guessed at. The dominant red in the mark measures
 * around #bd0507 with highlights to #ff4941, and the thin rules around it
 * run #b07f23 up to #f1c266. Red does the work, gold appears only as a
 * hairline, which is how the logo itself uses them. Drowning a slide in
 * gold is what makes a brand look like a payday loan advert.
 */
export const THEMES: SlideTheme[] = [
  {
    id: "riseup",
    label: "Rise Up",
    bg: "#000000",
    ink: "#ffffff",
    dim: "#8c8c8c",
    accent: "#c90d11",
    onAccent: "#ffffff",
    trim: "#c9962e",
    logo: true,
  },
  {
    id: "night",
    label: "Night",
    bg: "#0a0b0d",
    ink: "#f2f5f3",
    dim: "#8b948f",
    accent: "#3ecf8e",
    onAccent: "#07120d",
    trim: "#2a3b33",
    logo: true,
  },
  {
    id: "paper",
    label: "Paper",
    bg: "#f4f2ed",
    ink: "#14171a",
    dim: "#6b7280",
    accent: "#bd0507",
    onAccent: "#ffffff",
    trim: "#b07f23",
    // The logo is artwork on a black field, so it cannot sit on a light
    // background without a box around it. Left off rather than bodged.
    logo: false,
  },
];

export function themeById(id: string | null | undefined): SlideTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/**
 * Type size from text length.
 *
 * A fixed size means a short line looks lost and a long one overflows.
 * These steps were chosen against the real slide lengths the writer
 * produces, which land between about 40 and 200 characters.
 */
export function sizeFor(text: string, kind: "hook" | "body"): number {
  const n = text.length;
  if (kind === "hook") {
    if (n <= 40) return 104;
    if (n <= 70) return 88;
    if (n <= 110) return 74;
    if (n <= 160) return 62;
    return 52;
  }
  if (n <= 50) return 76;
  if (n <= 90) return 66;
  if (n <= 140) return 56;
  if (n <= 200) return 48;
  return 42;
}

/** Instagram portrait, the largest slot in the feed. */
export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

/**
 * How a slide is put together.
 *
 * Four, not fourteen. A deck reads as one thing because the same few
 * arrangements repeat; a different composition on every slide reads as
 * someone who could not decide.
 */
export type LayoutId = "plain" | "portrait" | "band" | "full";

export interface Layout {
  id: LayoutId;
  label: string;
  /** What it is for, shown when picking. */
  hint: string;
  /** Whether this layout needs a photo to make sense. */
  needsPhoto: boolean;
}

export const LAYOUTS: Layout[] = [
  { id: "plain", label: "Text only", hint: "No photo. Lets a strong line carry the slide", needsPhoto: false },
  { id: "portrait", label: "Photo right", hint: "Photo down one side, text beside it. For shots of you", needsPhoto: true },
  { id: "band", label: "Photo top", hint: "Photo across the top, text underneath. For objects and places", needsPhoto: true },
  { id: "full", label: "Full bleed", hint: "Photo fills the slide, text over a dark wash", needsPhoto: true },
];

export function layoutById(id: string | null | undefined): LayoutId {
  return (LAYOUTS.find((l) => l.id === id)?.id ?? "plain") as LayoutId;
}

/**
 * Headline size for the condensed face.
 *
 * Separate from sizeFor() because Big Shoulders fits roughly twice the
 * characters per line that Inter does, so the same text wants a very
 * different size. These steps were set against real generated slide
 * lengths and the width each layout actually leaves for text.
 */
export function headlineSize(text: string, narrow: boolean): number {
  const n = text.length;
  if (narrow) {
    if (n <= 30) return 104;
    if (n <= 55) return 90;
    if (n <= 85) return 76;
    if (n <= 120) return 64;
    return 54;
  }
  if (n <= 30) return 132;
  if (n <= 55) return 112;
  if (n <= 85) return 94;
  if (n <= 120) return 78;
  if (n <= 170) return 66;
  return 56;
}

/**
 * Splits a headline so one phrase can be coloured.
 *
 * The accent is matched case-insensitively and only the first occurrence
 * is coloured: colouring every "you" in a sentence is noise, not emphasis.
 * An accent that is not in the text leaves the headline untouched rather
 * than failing, because a mistyped word should cost the colour, not the
 * slide.
 */
export function splitAccent(
  text: string,
  accent: string | null,
): { before: string; hit: string; after: string } {
  if (!accent?.trim()) return { before: text, hit: "", after: "" };
  const i = text.toLowerCase().indexOf(accent.trim().toLowerCase());
  if (i < 0) return { before: text, hit: "", after: "" };
  return {
    before: text.slice(0, i),
    hit: text.slice(i, i + accent.trim().length),
    after: text.slice(i + accent.trim().length),
  };
}
