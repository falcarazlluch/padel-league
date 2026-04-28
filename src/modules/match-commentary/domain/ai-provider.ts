export interface AIProvider {
  generateCommentary(prompt: string): Promise<{ content: string; model: string }>;
}
