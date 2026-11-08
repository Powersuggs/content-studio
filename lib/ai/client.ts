import Anthropic from "@anthropic-ai/sdk";
import { applyHouseRules } from "@/lib/writing/house-rules";

let client: Anthropic | undefined;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export const AI_MODEL = "claude-sonnet-5";

/**
 * Concatenate every text block in a message's content into one string.
 *
 * The house rules are applied here, at the one point every writing route in
 * the app passes through, rather than in each route. A rule enforced in five
 * places is a rule that holds in four of them the first time a sixth route
 * is added.
 *
 * This runs before the JSON is parsed, which is deliberate: the rules only
 * ever swap in letters, commas and spaces, so well-formed JSON stays
 * well-formed, and anything the model wrapped in that JSON is covered too.
 */
export function extractResponseText(message: Anthropic.Message): string {
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  return applyHouseRules(text);
}
