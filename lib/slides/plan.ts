import type { LayoutId } from "./design";

/**
 * A carousel's slides, as something that can be edited and kept.
 *
 * The generated carousel gives words. Turning those into pictures needs
 * three more decisions per slide: which layout, which photo, and which
 * phrase is coloured. Those decisions are worth keeping, because nobody
 * wants to make them twice for the same carousel.
 *
 * Stored on the idea_outputs row alongside the draft it belongs to,
 * inside the same JSON, so a slide plan cannot drift away from the text
 * it was made for.
 */

export interface SlidePlan {
  layout: LayoutId;
  photoId: number | null;
  accent: string;
}

export interface CarouselPlan {
  theme: string;
  slides: SlidePlan[];
}

/**
 * A reasonable plan before anybody has chosen anything.
 *
 * The cover gets a portrait layout because a face is the strongest way to
 * open, the closing slide matches it so the deck bookends, and the middle
 * alternates between a band and a full bleed. Alternating matters: eight
 * identical compositions is what makes a deck look like a template, and
 * the rhythm is most of what makes one look designed.
 *
 * Every slide starts with a photograph on it. An earlier version left the
 * slots empty, on the reasoning that guessing from a filename gets it
 * wrong; that was the wrong call. A default you glance at and change is
 * far less work than eight blanks you must fill, and being wrong is
 * obvious the moment you see it.
 */
export function defaultPlan(slideCount: number, photoIds: number[] = []): CarouselPlan {
  const slides: SlidePlan[] = [];
  // Walked in order and never repeated within one deck. The list arrives
  // least-used first, so a new carousel reaches for the photographs that
  // have had the least airtime, and the bank rotates itself instead of
  // the same three shots appearing in everything.
  let next = 0;
  const take = () => (photoIds.length ? photoIds[next++ % photoIds.length] : null);

  for (let i = 0; i < slideCount; i++) {
    const isFirst = i === 0;
    const isLast = i === slideCount - 1;
    const layout: LayoutId = isFirst || isLast ? "portrait" : i % 2 === 1 ? "band" : "full";
    slides.push({ layout, photoId: take(), accent: "" });
  }
  return { theme: "riseup", slides };
}

/** Grows or trims a stored plan to match a draft that has been rewritten. */
export function reconcile(
  plan: CarouselPlan | null,
  slideCount: number,
  photoIds: number[] = [],
): CarouselPlan {
  const base = defaultPlan(slideCount, photoIds);
  if (!plan?.slides?.length) return base;
  return {
    theme: typeof plan.theme === "string" ? plan.theme : base.theme,
    slides: base.slides.map((d, i) => {
      const kept = plan.slides[i];
      if (!kept) return d;
      const layout = (kept.layout ?? d.layout) as LayoutId;
      // The layout says whether this slide has a picture on it; the
      // picker only says which one. Trying to tell "none chosen yet"
      // apart from "none wanted" by a stored null was guesswork, and it
      // left carousels planned before photos existed full of empty
      // frames. Wanting no photo is now expressed by choosing Text only.
      const wantsPhoto = layout !== "plain";
      return {
        layout,
        photoId: wantsPhoto
          ? typeof kept.photoId === "number"
            ? kept.photoId
            : d.photoId
          : null,
        accent: typeof kept.accent === "string" ? kept.accent : "",
      };
    }),
  };
}

/**
 * The last few words of a headline, as a starting suggestion for the
 * accent. The payoff of a line is usually at its end, which is why the
 * reference decks colour the end so often.
 */
export function suggestAccent(text: string): string {
  const words = text.trim().replace(/[.!?]+$/, "").split(/\s+/);
  if (words.length <= 3) return "";
  return words.slice(-2).join(" ");
}

/** Builds the URL that renders one slide. */
export function slideUrl(input: {
  text: string;
  sub?: string;
  plan: SlidePlan;
  theme: string;
  index: number;
  total: number;
  handle?: string | null;
}): string {
  const p = new URLSearchParams({
    text: input.text,
    i: String(input.index),
    n: String(input.total),
    theme: input.theme,
    layout: input.plan.layout,
  });
  if (input.sub) p.set("sub", input.sub);
  if (input.plan.accent) p.set("accent", input.plan.accent);
  if (input.plan.photoId) p.set("photo", String(input.plan.photoId));
  if (input.handle) p.set("handle", input.handle);
  return `/api/slide?${p.toString()}`;
}
