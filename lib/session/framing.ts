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
 * Whether a camera giving this shape should be asked for a reel shape.
 *
 * True for anything wider than 9:16, which is every camera there is: a
 * laptop webcam at 16:9 and a phone front camera at 3:4 alike.
 *
 * This used to be true only for landscape cameras, leaving a phone to
 * film its whole sensor while the finished video kept only the middle.
 * That showed him a wider picture than he was going to get, and he
 * framed against it: "my arms are not long enough to hold the phone out
 * that far away". The crop happens either way, because a reel is 9:16
 * and no camera is. Doing it at the start means the picture on screen
 * while he films is the picture he ends up with.
 */
export function needsReelShape(width: number, height: number): boolean {
  if (!width || !height) return false;
  return width / height > REEL_ASPECT + EPSILON;
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
