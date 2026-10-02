/** AI preference vocabulary. Stored as MemoryFact rows under category "settings". */
export const AI_TONES = ["professional", "friendly", "concise", "formal"] as const;
export const AI_LANGUAGES = ["English (India)", "English (US/UK)", "Hindi", "Gujarati", "Hinglish"] as const;

export const AI_PREF_KEYS = {
  tone: "settings.ai.tone",
  language: "settings.ai.language",
  guidance: "settings.ai.guidance",
} as const;

export const TONE_HINTS: Record<(typeof AI_TONES)[number], string> = {
  professional: "Clear and courteous. The safe default for client-facing drafts.",
  friendly: "Warm and conversational, still tidy.",
  concise: "Short, direct, no filler.",
  formal: "Careful wording for contracts, notices and senior contacts.",
};
