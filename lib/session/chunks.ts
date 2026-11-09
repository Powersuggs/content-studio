/**
 * Breaking a script into what fits on screen at once.
 *
 * Scrolling text works if you can keep your eyes on it. Filming, you
 * cannot: you are looking at the lens, glancing down, and finding your
 * place again. A couple of lines held still is easier to pick up than a
 * moving wall, which is why every prompter built for phones does it this
 * way.
 *
 * Split on sentences rather than on length, because a line that breaks
 * mid-clause reads as a stumble. Length only decides how many sentences
 * go together.
 */

/** Roughly two comfortable lines on a phone at the default size. */
export const CHUNK_TARGET = 120;

/**
 * The hard ceiling, for a sentence with nowhere good to break.
 *
 * Above the target a comma will do. Above this, even a mid-clause break
 * beats a paragraph, because a paragraph on a prompter is unusable.
 */
const CHUNK_MAX = 180;

/** Sentence ends, keeping the punctuation with the sentence. */
const SENTENCE = /[^.!?\n]+[.!?]*\s*/g;

/**
 * Splits one long sentence that will not fit.
 *
 * Commas first, since a clause boundary is still a natural breath. Only
 * when there are none does it fall back to counting words, which is the
 * ugly case and should be rare in anything written to be spoken.
 */
function splitLong(text: string): string[] {
  const out: string[] = [];
  let rest = text.trim();

  while (rest.length > CHUNK_TARGET) {
    // A comma inside the target is a clause boundary, which is still a
    // natural place to breathe. Ignore one that lands in the first third,
    // since a four-word fragment followed by a long one is worse than
    // leaving it alone.
    const comma = rest.lastIndexOf(", ", CHUNK_TARGET);
    if (comma > CHUNK_TARGET * 0.35) {
      out.push(rest.slice(0, comma + 1).trim());
      rest = rest.slice(comma + 1).trim();
      continue;
    }
    // No usable comma. Breaking mid-clause reads as a stumble, so it is
    // only worth doing when the line is genuinely unreadable as one.
    if (rest.length <= CHUNK_MAX) break;
    const space = rest.lastIndexOf(" ", CHUNK_MAX);
    const at = space > 0 ? space : CHUNK_MAX;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * The script as a list of things to hold on screen.
 *
 * The hook is always its own chunk. It is the line that has to land, and
 * burying it at the top of a paragraph is how it gets rushed.
 */
export function chunkScript(hook: string, body: string): string[] {
  const chunks: string[] = [];
  const h = hook.trim();
  if (h) chunks.push(h);

  // Blank lines are the writer saying "new thought", so they are kept as
  // boundaries rather than flattened into one run of sentences.
  for (const para of body.split(/\n\s*\n/)) {
    const sentences = (para.match(SENTENCE) ?? [])
      .map((x) => x.trim())
      .filter(Boolean);

    let current = "";
    for (const sentence of sentences) {
      if (sentence.length > CHUNK_TARGET) {
        if (current) {
          chunks.push(current);
          current = "";
        }
        chunks.push(...splitLong(sentence));
        continue;
      }
      const joined = current ? `${current} ${sentence}` : sentence;
      if (joined.length <= CHUNK_TARGET) {
        current = joined;
      } else {
        if (current) chunks.push(current);
        current = sentence;
      }
    }
    if (current) chunks.push(current);
  }

  return chunks.filter(Boolean);
}

/**
 * How long to hold a chunk, in milliseconds.
 *
 * Paced on words rather than characters: people read and speak in words,
 * and a chunk of six short words is not half the work of one with six
 * long ones. A floor of a second and a half stops a three-word line
 * flashing past before the eye reaches it.
 */
export function holdMs(chunk: string, wordsPerMinute: number): number {
  const words = chunk.trim().split(/\s+/).filter(Boolean).length;
  const wpm = Math.max(40, wordsPerMinute);
  return Math.max(1500, Math.round((words / wpm) * 60_000));
}
