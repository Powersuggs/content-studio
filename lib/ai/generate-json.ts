import { getAnthropicClient, extractResponseText, AI_MODEL } from "./client";
import { extractJson } from "./json-extract";

export interface GenerateJsonOptions {
  system: string;
  user: string;
  /**
   * Set this several times higher than the JSON payload you actually
   * expect. Reasoning models spend part of this budget on an internal
   * thinking block before they emit the JSON -- a tight limit here
   * doesn't shrink the thinking, it just truncates the JSON output,
   * which then looks like a parser bug rather than a token-budget one.
   */
  maxTokens: number;
}

export async function generateJson<T = unknown>(
  opts: GenerateJsonOptions,
): Promise<T> {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });

  if (message.stop_reason === "max_tokens") {
    throw new Error(
      "Model response was cut off at the token limit before finishing -- raise maxTokens for this route.",
    );
  }

  const text = extractResponseText(message);
  return extractJson<T>(text);
}
