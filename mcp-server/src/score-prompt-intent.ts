import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5";

export const AD_CATEGORIES = [
  "saas-productivity",
  "saas-crm",
  "developer-tools",
  "consumer-electronics",
  "fashion",
  "food-delivery",
  "finance",
  "travel",
  "education",
  "entertainment",
  "other",
] as const;

export type AdCategory = (typeof AD_CATEGORIES)[number];

export type BrandSafety = "safe" | "sensitive" | "blocked";

export interface ScoreResult {
  intent_score: number;
  recommended_category: AdCategory;
  brand_safety: BrandSafety;
  reasoning: string;
  confidence: number;
}

export interface ScoreInput {
  prompt: string;
  candidateCategory?: string;
}

const SYSTEM_PROMPT = `You are Aetheric's prompt-intent scorer for AI-native publisher ad insertion.

Given a user prompt (and optionally a candidate ad category), score how monetisable the prompt is and classify brand safety.

intent_score (0-1):
  - 0.0-0.2: pure curiosity, no buying signal (e.g. "what is photosynthesis").
  - 0.3-0.5: vague interest or research with no clear product intent.
  - 0.6-0.8: clear decision/comparison/purchase intent, named categories, near-term need.
  - 0.9-1.0: explicit purchase intent with category, budget, or vendor comparison.

recommended_category: pick the single best match from this fixed list:
  saas-productivity, saas-crm, developer-tools, consumer-electronics, fashion, food-delivery,
  finance, travel, education, entertainment, other.
If a candidate_category is supplied, only use it if it genuinely fits the prompt; otherwise pick the better one.

brand_safety:
  - "blocked": grief, suicide/self-harm, healthcare emergencies, acute financial distress, illegal activity, hate.
  - "sensitive": politics, weapons, gambling, medical conditions (non-emergency), alcohol, dating, religion.
  - "safe": everything else.

reasoning: one sentence (under 25 words) explaining the score and category.
confidence (0-1): your confidence in the recommended_category and brand_safety verdict.

Return strictly the JSON schema. Do not include extra fields or prose outside the JSON.`;

// Note: Anthropic's structured-output schema validator rejects `minimum`/`maximum`
// for number types, so we constrain numeric ranges via the system prompt and
// clamp defensively in `normalise()`.
const JSON_SCHEMA = {
  type: "object",
  properties: {
    intent_score: {
      type: "number",
      description: "How strong the buying/decision intent is, from 0 to 1.",
    },
    recommended_category: {
      type: "string",
      enum: AD_CATEGORIES,
      description: "Best-matched ad category from the fixed list.",
    },
    brand_safety: {
      type: "string",
      enum: ["safe", "sensitive", "blocked"],
      description: "Brand-safety verdict for ad insertion.",
    },
    reasoning: {
      type: "string",
      description: "One-sentence explanation, under 25 words.",
    },
    confidence: {
      type: "number",
      description:
        "Confidence in the category and brand-safety verdict, from 0 to 1.",
    },
  },
  required: [
    "intent_score",
    "recommended_category",
    "brand_safety",
    "reasoning",
    "confidence",
  ],
  additionalProperties: false,
} as const;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY env var is required to call score_prompt_intent.",
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function scorePromptIntent(
  input: ScoreInput,
): Promise<ScoreResult> {
  const userContent = input.candidateCategory
    ? `candidate_category: ${input.candidateCategory}\n\nuser_prompt:\n${input.prompt}`
    : `user_prompt:\n${input.prompt}`;

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    // Structured output: constrain Claude to the schema.
    // Cast because SDK typings may lag the API surface for output_config.
    ...({
      output_config: {
        format: {
          type: "json_schema",
          schema: JSON_SCHEMA,
        },
      },
    } as Record<string, unknown>),
  });

  const textBlock = response.content.find(
    (b): b is Extract<typeof b, { type: "text" }> => b.type === "text",
  );
  if (!textBlock) {
    throw new Error("Claude returned no text block.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from Claude response: ${(err as Error).message}\nRaw: ${textBlock.text}`,
    );
  }

  return normalise(parsed);
}

function normalise(raw: unknown): ScoreResult {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Claude response is not a JSON object.");
  }
  const r = raw as Record<string, unknown>;

  const intent = clampNumber(r.intent_score, 0, 1);
  const confidence = clampNumber(r.confidence, 0, 1);

  const category = AD_CATEGORIES.includes(r.recommended_category as AdCategory)
    ? (r.recommended_category as AdCategory)
    : "other";

  const brandSafetyRaw = r.brand_safety;
  const brandSafety: BrandSafety =
    brandSafetyRaw === "safe" ||
    brandSafetyRaw === "sensitive" ||
    brandSafetyRaw === "blocked"
      ? brandSafetyRaw
      : "sensitive";

  const reasoning =
    typeof r.reasoning === "string" ? r.reasoning : "No reasoning returned.";

  return {
    intent_score: intent,
    recommended_category: category,
    brand_safety: brandSafety,
    reasoning,
    confidence,
  };
}

function clampNumber(v: unknown, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
