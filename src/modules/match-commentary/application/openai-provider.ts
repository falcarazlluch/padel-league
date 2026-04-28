import OpenAI from 'openai';
import { env } from '@/shared/config/env';
import type { AIProvider } from '../domain/ai-provider';

let _client: OpenAI | undefined;

function getClient(): OpenAI {
  const apiKey = env().OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  _client ??= new OpenAI({ apiKey });
  return _client;
}

export const OpenAIProvider: AIProvider = {
  async generateCommentary(prompt: string): Promise<{ content: string; model: string }> {
    const model = env().AI_MODEL_OPENAI ?? 'gpt-4o-mini';
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
  },
};
