import OpenAI from 'openai';
import { env } from '@/shared/config/env';
import type { AIProvider } from '../domain/ai-provider';

let _client: OpenAI | undefined;

function getClient(): OpenAI {
  const raw = env().OPENAI_API_KEY;
  if (!raw) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  // Trim whitespace/newlines that sneak in when pasting into the Vercel UI;
  // those break the Authorization header at HTTPS level (APIConnectionError).
  const apiKey = raw.trim();
  _client ??= new OpenAI({ apiKey });
  return _client;
}

function describeError(err: unknown): string {
  if (!err) return 'unknown';
  const e = err as { name?: string; message?: string; status?: number; code?: string; cause?: unknown };
  const parts: string[] = [];
  if (e.name) parts.push(e.name);
  if (typeof e.status === 'number') parts.push(`status=${e.status}`);
  if (e.code) parts.push(`code=${e.code}`);
  if (e.message) parts.push(e.message);
  const cause = e.cause as { code?: string; message?: string } | undefined;
  if (cause?.code) parts.push(`cause.code=${cause.code}`);
  if (cause?.message) parts.push(`cause.message=${cause.message}`);
  return parts.join(' | ') || String(err);
}

export const OpenAIProvider: AIProvider = {
  async generateCommentary(prompt: string): Promise<{ content: string; model: string }> {
    const model = env().AI_MODEL_OPENAI?.trim() || 'gpt-4o-mini';
    try {
      const completion = await getClient().chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85,
        max_tokens: 200,
      });
      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('OpenAI returned empty content');
      }
      return { content, model };
    } catch (err) {
      throw new Error(`OpenAI call failed (model=${model}): ${describeError(err)}`);
    }
  },
};
