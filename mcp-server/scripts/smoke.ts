// Smoke test: calls the score_prompt_intent logic directly (no MCP transport)
// to verify the Anthropic call works and returns the expected shape.
//
//   ANTHROPIC_API_KEY=... npx tsx scripts/smoke.ts

import { scorePromptIntent } from "../src/score-prompt-intent.js";

async function main() {
  const prompt =
    "I'm comparing CRMs for a 10-person SaaS startup, leaning Pipedrive vs HubSpot";

  console.log(`Prompt: ${prompt}\n`);
  const result = await scorePromptIntent({
    prompt,
    candidateCategory: "saas-crm",
  });
  console.log(JSON.stringify(result, null, 2));

  // Soft expectations for the smoke check.
  const warnings: string[] = [];
  if (result.intent_score < 0.6)
    warnings.push(`intent_score=${result.intent_score} < 0.6 (expected high)`);
  if (result.recommended_category !== "saas-crm")
    warnings.push(
      `recommended_category=${result.recommended_category} != saas-crm`,
    );
  if (result.brand_safety !== "safe")
    warnings.push(`brand_safety=${result.brand_safety} != safe`);

  if (warnings.length > 0) {
    console.warn("\nSoft warnings:");
    for (const w of warnings) console.warn(" -", w);
  } else {
    console.log("\nSmoke test passed (intent high, saas-crm, safe).");
  }
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
