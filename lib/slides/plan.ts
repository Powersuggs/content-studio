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
 * alternates between a photo and plain text. Alternating matters: eight
 * photo slides in a row is as monotonous as eight plain ones, and the
 * rhythm is most of what makes a deck feel designed.
 *
 * No photo is chosen. Guessing which picture suits which sentence, with
 * nothing but a filename to go on, produces worse results than an empty
 * slot that asks to be filled.
 */
export function defaultPlan(slideCount: number): CarouselPlan {
  const slides: SlidePlan[] = [];
  for (let i = 0; i < slideCount; i++) {
    const isFirst = i === 0;
    const isLast = i === slideCount - 1;
    const layout: LayoutId = isFirst || isLast ? "portrait" : i % 2 === 1 ? "band" : "plain";
    slides.push({ layout, photoId: null, accent: "" });
  }
  return { theme: "riseup", slides };
}

/** Grows or trims a stored plan to match a draft that has been rewritten. */
export function reconcile(plan: CarouselPlan | null, slideCount: number): CarouselPlan {
  const base = defaultPlan(slideCount);
  if (!plan?.slides?.length) return base;
  return {
    theme: typeof plan.theme === "string" ? plan.theme : base.theme,
    slides: base.slides.map((d, i) => {
      const kept = plan.slides[i];
      if (!kept) return d;
      return {
        layout: (kept.layout ?? d.layout) as LayoutId,
        photoId: typeof kept.photoId === "number" ? kept.photoId : null,
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
