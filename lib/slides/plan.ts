import { layoutAccepts, type LayoutId, type PhotoKind } from "./design";

/** A photo as the planner needs it: an id and what is in the picture. */
export interface PhotoRef {
  id: number;
  kind: PhotoKind;
}

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
export function defaultPlan(slideCount: number, photos: PhotoRef[] = []): CarouselPlan {
  const slides: SlidePlan[] = [];
  const taken = new Set<number>();

  // Walked least-used first and never repeated in one deck, but only
  // offered to a layout that can actually hold it. Dropping a headshot
  // into the band crops it to shoulders and chin, which is not a matter
  // of taste but an unusable slide.
  //
  // `prefer` asks for a kind without demanding it. The cover and the
  // closing slide are where a face does the most work: the first decides
  // whether anyone swipes, the last is where the ask lands, and an ask
  // from a person is a different thing from an ask from a coffee cup. The
  // middle slides carry ideas, and a face on every one of them would be
  // the same slide eight times.
  const take = (layout: LayoutId, prefer?: PhotoKind): number | null => {
    const unused = (kind?: PhotoKind) =>
      photos.find(
        (p) =>
          !taken.has(p.id) &&
          layoutAccepts(layout, p.kind) &&
          (kind === undefined || p.kind === kind),
      );
    // Preferred and unused, then unused of any kind this layout accepts.
    const fit = (prefer && unused(prefer)) || unused();
    if (fit) {
      taken.add(fit.id);
      return fit.id;
    }
    // Nothing unused fits, so reuse one that does, still favouring the
    // preferred kind. A repeat is better than an empty frame.
    const reuse =
      (prefer && photos.find((p) => layoutAccepts(layout, p.kind) && p.kind === prefer)) ||
      photos.find((p) => layoutAccepts(layout, p.kind));
    return reuse?.id ?? null;
  };

  for (let i = 0; i < slideCount; i++) {
    const isFirst = i === 0;
    const isLast = i === slideCount - 1;
    const bookend = isFirst || isLast;
    const layout: LayoutId = bookend ? "portrait" : i % 2 === 1 ? "band" : "full";
    slides.push({
      layout,
      photoId: take(layout, bookend ? "person" : undefined),
      accent: "",
    });
  }
  return { theme: "riseup", slides };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Grows or trims a stored plan to match a draft that has been rewritten. */
export function reconcile(
  plan: CarouselPlan | null,
  slideCount: number,
  photos: PhotoRef[] = [],
): CarouselPlan {
  const base = defaultPlan(slideCount, photos);
  if (!plan?.slides?.length) return base;

  const kindOf = new Map(photos.map((p) => [p.id, p.kind]));
  const chosen = new Set<number>();
  // Falling back to the default slide's photo is wrong: that photo was
  // picked for the default LAYOUT, which may not be the layout actually
  // stored. A headshot on a band slide was landing on another headshot.
  const firstFitting = (layout: LayoutId) =>
    photos.find((p) => layoutAccepts(layout, p.kind))?.id ?? null;

  const slides = base.slides.map((d, i) => {
    const kept = plan.slides[i];
    if (!kept) return d;
    const layout = (kept.layout ?? d.layout) as LayoutId;
    // The layout says whether this slide carries a picture; the picker
    // only says which one. Wanting none is said by choosing Text only.
    if (layout === "plain") return { layout, photoId: null, accent: str(kept.accent) };

    let photoId = typeof kept.photoId === "number" ? kept.photoId : d.photoId;
    const kind = photoId === null ? null : kindOf.get(photoId);
    if (photoId !== null && kind && !layoutAccepts(layout, kind)) {
      // A stored choice that no longer suits its shape, because the
      // layout changed or the photo was reclassified, gives way to one
      // chosen for THIS layout. Keeping it would mean a cropped face.
      photoId = firstFitting(layout);
    } else if (photoId !== null && !kind) {
      // A photo that is no longer in the bank at all, deleted since the
      // plan was made, is replaced rather than left as a broken frame.
      photoId = firstFitting(layout);
    } else if (typeof kept.photoId === "number") {
      chosen.add(i);
    }

    return { layout, photoId, accent: str(kept.accent) };
  });

  return {
    theme: typeof plan.theme === "string" ? plan.theme : base.theme,
    slides: dedupe(slides, photos, chosen),
  };
}

/**
 * Stops the same photograph appearing twice in one carousel.
 *
 * A photo the person chose never moves. Only the automatically filled
 * ones give way, which is the point of having chosen: otherwise a
 * default landing first would evict a deliberate pick.
 *
 * The replacement has to suit the slide's shape as well as be free, and
 * collisions only move when there is somewhere to move them. A bank
 * smaller than the deck repeats, which is the honest outcome.
 */
function dedupe(
  slides: SlidePlan[],
  photos: PhotoRef[],
  chosen: Set<number>,
): SlidePlan[] {
  if (photos.length === 0) return slides;

  const used = new Set<number>();
  for (const i of chosen) {
    const id = slides[i]?.photoId;
    if (typeof id === "number") used.add(id);
  }
  const spare = photos.filter((p) => !slides.some((s) => s.photoId === p.id));

  return slides.map((s, i) => {
    if (s.photoId === null || chosen.has(i)) return s;
    if (!used.has(s.photoId)) {
      used.add(s.photoId);
      return s;
    }
    const swap = spare.find((p) => !used.has(p.id) && layoutAccepts(s.layout, p.kind));
    if (!swap) return s;
    used.add(swap.id);
    return { ...s, photoId: swap.id };
  });
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
