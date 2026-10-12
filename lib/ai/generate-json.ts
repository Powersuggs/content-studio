import { getAnthropicClient, extractResponseText, AI_MODEL } from "./client";
import { extractJson } from "./json-extract";
import { getVoicePromptBlock } from "@/lib/voice/profile";

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
  /**
   * Prepend the account's voice profile to the system prompt.
   *
   * Opt-in rather than automatic, because not every AI route should write AS
   * the person: analysing a competitor's post or reading performance patterns
   * should stay neutral. Only routes that produce content in their name set
   * this. Harmless before the interview is done -- the block is empty and the
   * prompt is unchanged.
   */
  useVoice?: boolean;
}

export async function generateJson<T = unknown>(
  opts: GenerateJsonOptions,
): Promise<T> {
  const client = getAnthropicClient();

  let system = opts.system;
  if (opts.useVoice) {
    const voice = await getVoicePromptBlock().catch(() => "");
    if (voice) system = `${voice}\n\n${system}`;
  }

  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: opts.maxTokens,
    system,
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
