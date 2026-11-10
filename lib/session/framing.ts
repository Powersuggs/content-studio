/**
 * How the camera picture is shaped, and how it is fitted on screen.
 *
 * This exists as its own file because getting it wrong is invisible. A
 * preview that is cropped slightly tighter than the recording still looks
 * like a working camera; you only find out when you watch the video back
 * and your hands are outside the frame. So the arithmetic lives here where
 * it can be checked, rather than inline in a component where it cannot.
 *
 * The bug that prompted it: the capture asked for 1080x1920, which is the
 * shape of a reel, from an iPhone front camera whose sensor is 4:3. The
 * only way to satisfy that is to throw away a quarter of the width, so the
 * picture arrived already zoomed in, and then the preview stretched that
 * to fill a screen taller still and cropped the sides a second time.
 */

/** The shape Instagram wants for a reel: 1080 wide by 1920 tall. */
export const REEL_ASPECT = 9 / 16;

/** Ignore differences smaller than this when comparing shapes. */
const EPSILON = 0.001;

/**
 * Whether the camera should be asked for a different shape at all.
 *
 * It should not. Having now seen both, Aaron settled it: "I want the full
 * video it shows the dotted lines should guide me to be center not the
 * video saved and cut there". So the camera gives what it gives, the
 * whole sensor, and the dotted lines are advice rather than scissors.
 *
 * This is kept as a function, always false, rather than deleted, because
 * the question has been answered three different ways across a week of
 * him using it and the reasoning belongs somewhere findable:
 *
 *   Cropping at the camera is what made it feel zoomed in.
 *   Cropping only at the export is what made the preview a lie.
 *   Cropping at both is what put him out of arm's reach.
 *
 * Not cropping means Instagram does it at posting time, where he can see
 * it happen and drag it about. That is the version he wants.
 */
export function needsReelShape(_width: number, _height: number): boolean {
  return false;
}

/**
 * Whether to draw the guide showing what a reel keeps.
 *
 * Only worth drawing when the camera is giving something wider than a
 * reel, so there is a real decision about what gets cut. When the frame is
 * already 9:16 the guide would just trace the edge of the picture and add
 * nothing but clutter.
 */
export function showsReelGuide(aspect: number): boolean {
  return aspect > REEL_ASPECT + EPSILON;
}

/**
 * The largest rectangle of the given shape that fits inside the space.
 *
 * Letterboxed, never cropped: every pixel being recorded is on screen, and
 * nothing on screen is outside the recording. The leftover space goes
 * black, which is a fine place for the prompter words to sit.
 */
export function fitFrame(
  areaWidth: number,
  areaHeight: number,
  aspect: number,
): { width: number; height: number } {
  if (!areaWidth || !areaHeight || !aspect || aspect <= 0) {
    return { width: 0, height: 0 };
  }
  const byWidth = areaWidth / aspect;
  return byWidth <= areaHeight
    ? { width: Math.round(areaWidth), height: Math.round(byWidth) }
    : { width: Math.round(areaHeight * aspect), height: Math.round(areaHeight) };
}
