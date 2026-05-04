// Conservative prompt-injection detector. Designed to err on the side of
// catching obvious attempts; false positives are tolerable because the user
// can rephrase a benign question and we only block after repeated strikes.
//
// We do NOT claim absolute prevention — that's an open research problem. The
// model is also constrained at the orchestration layer:
//   1. The user role is enforced at the API boundary (Zod whitelist).
//   2. The chat context is delimited and tagged in the system prompt.
//   3. We never echo the system prompt back to the model.

const PATTERNS: Array<{ id: string; re: RegExp }> = [
  // Direct "ignore your instructions" family
  { id: 'ignore-instructions', re: /\b(ignore|forget|disregard|override|skip)\s+(all\s+|the\s+|your\s+|previous\s+|prior\s+|above\s+)*(instructions?|rules?|prompts?|messages?|system\s+prompt)/i },
  { id: 'ignore-instructions-es', re: /\b(ignora|olvida|omite|salta|deja\s+de\s+seguir|haz\s+caso\s+omiso\s+a)\s+(las|tus|todas\s+las|las\s+anteriores|las\s+previas)?\s*(instrucciones?|reglas?|prompts?|mensajes?|el\s+sistema)/i },

  // "You are now X" / role override
  { id: 'role-override', re: /\b(you\s+are|act|behave|pretend|roleplay|simulate|imagine|now\s+you('|\s+a)re|from\s+now\s+on)\s+(now\s+|a\s+|an\s+|as\s+)?(an?\s+)?(developer|admin|system|hacker|jailbreak|dan|gpt|chatgpt|llm|model|new\s+ai|different\s+ai|unfiltered)/i },
  { id: 'role-override-es', re: /\b(eres|act[uú]a|haz\s+de|finge\s+(ser|que\s+eres)|simula|imagina\s+que\s+eres|ahora\s+eres|a\s+partir\s+de\s+ahora)\s+(?:como\s+)?(?:un|una|el|la)?\s*(desarrollador|administrador|admin|sistema|hacker|jailbreak|dan|gpt|chatgpt|modelo|nueva\s+ia|otra\s+ia|sin\s+filtros?|sin\s+restricciones?)/i },

  // System prompt extraction
  { id: 'reveal-system', re: /\b(reveal|show|print|display|repeat|output|tell\s+me)\s+(me\s+)?(your\s+|the\s+|original\s+|initial\s+|hidden\s+|full\s+|entire\s+|complete\s+)?(system\s+prompt|instructions?|rules?|guidelines?|configuration|setup\s+message|context|programming|prompt)/i },
  { id: 'reveal-system-es', re: /\b(revela|mu[eé]strame|imprime|repite|dime|enseñame|cuál\s+es|cu[aá]les\s+son)\s+(tu|el|los|las|tu\s+propio)?\s*(prompt|instrucciones?|reglas?|configuraci[oó]n|sistema|directrices|programaci[oó]n|contexto)/i },

  // Hidden token markers (model-specific)
  { id: 'special-tokens', re: /(\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>|<\|system\|>|<\|user\|>|<\|assistant\|>|<\|endoftext\|>|###\s*system|<\s*system\s*>|```system|<role:?\s*system>)/i },

  // DAN / jailbreak language
  { id: 'jailbreak-keywords', re: /\b(do\s+anything\s+now|dan\s+mode|developer\s+mode|jailbreak|jailbroken|bypass\s+(your\s+)?(filter|safety|restrictions?|guidelines?)|unfiltered|unrestricted|without\s+(any\s+)?(filter|restrictions?|safety))/i },
  { id: 'jailbreak-keywords-es', re: /\b(modo\s+(dan|desarrollador|sin\s+filtros?|libre)|sin\s+(filtros?|restricciones?|l[ií]mites?|censura)|salta(rte|r)\s+(las|tus)\s+(reglas|restricciones|l[ií]mites)|elude\s+(tus|las)\s+restricciones)/i },

  // Pretend hypothetical or "for educational purposes" classic preface
  { id: 'pretend-frame', re: /\b(pretend\s+(this\s+is\s+|that\s+))?(for\s+(educational|research|fictional|hypothetical)\s+purposes?|in\s+a\s+hypothetical|in\s+a\s+fictional\s+(world|scenario))[^a-z]*(reveal|tell|show|explain)/i },

  // Direct request to drop policies
  { id: 'drop-policy', re: /\b(drop|remove|disable|turn\s+off|deactivate)\s+(?:(?:your|the|all|any)\s+)*(filter|filters|policy|policies|safeguards?|safety|restrictions?|guardrails?)/i },
  { id: 'drop-policy-es', re: /\b(desactiva|apaga|quita|elimina|deshabilita)\s+(?:(?:todas|todos|tus|las|los|mis|el|la)\s+)*(filtros?|pol[ií]ticas?|salvaguardas?|restricciones?|l[ií]mites?|reglas?\s+de\s+seguridad)/i },
];

export interface InjectionResult {
  matched: boolean;
  /** Internal ids of every pattern that matched. */
  reasons: string[];
}

/**
 * Run every detector pattern on the input. Returns the union of matches —
 * we want the audit trail, not just first-match.
 */
export function detectPromptInjection(input: string): InjectionResult {
  if (!input || typeof input !== 'string') return { matched: false, reasons: [] };
  const reasons: string[] = [];
  for (const p of PATTERNS) {
    if (p.re.test(input)) reasons.push(p.id);
  }
  return { matched: reasons.length > 0, reasons };
}

/**
 * Strip role-override-friendly token markers from any text we forward to the
 * model (e.g. inside the user-supplied history). Defensive sanitiser; the
 * primary defence is `detectPromptInjection`.
 */
export function stripModelTokens(input: string): string {
  return input.replace(
    /(\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>|<\|system\|>|<\|user\|>|<\|assistant\|>|<\|endoftext\|>)/gi,
    '',
  );
}
