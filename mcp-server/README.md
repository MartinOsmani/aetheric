# aetheric-mcp-server

MCP server for **Aetheric** (Cursor AdTech London Hackathon, Track 02 — AI-native ad publishers).

Exposes a single tool, **`score_prompt_intent`**, that scores how monetisable a user prompt is for ad insertion (intent score, ad category, brand safety, reasoning, confidence). Powered by Claude Haiku 4.5 with structured JSON output.

Built for the "Best use of Alpic" bonus — deployable on [Alpic](https://alpic.ai) as a standard Node MCP server.

## Tool: `score_prompt_intent`

Input:
```json
{
  "prompt": "I'm comparing CRMs for a 10-person SaaS startup, leaning Pipedrive vs HubSpot",
  "candidate_category": "saas-crm"
}
```

Output:
```json
{
  "intent_score": 0.9,
  "recommended_category": "saas-crm",
  "brand_safety": "safe",
  "reasoning": "Explicit CRM vendor comparison with clear buying intent for a small SaaS team.",
  "confidence": 0.95
}
```

Ad-category enum (hard-coded): `saas-productivity`, `saas-crm`, `developer-tools`, `consumer-electronics`, `fashion`, `food-delivery`, `finance`, `travel`, `education`, `entertainment`, `other`.

Brand safety: `safe` | `sensitive` | `blocked`.

## Local dev

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

The MCP Streamable HTTP endpoint is then at `http://127.0.0.1:3000/mcp`.

Smoke test (calls the tool directly):

```bash
npx tsx scripts/smoke.ts
```

(Set `ANTHROPIC_API_KEY` first.)

Typecheck / build:

```bash
npm run typecheck
npm run build
```

## Deploy on Alpic

1. Push this directory to its own GitHub repo (or push the monorepo and point Alpic at the `mcp-server/` subdirectory).
2. In the [Alpic dashboard](https://alpic.ai), create a new MCP server from the repo. Alpic reads `alpic.json` (here: `npm install` + `npm run start`).
3. In the Alpic environment-variable settings, add `ANTHROPIC_API_KEY` (and optionally `PORT` — Alpic typically injects one).
4. Deploy. Alpic returns a live HTTPS endpoint; the MCP route is `/mcp`.

That's it — no per-deploy config beyond the env var.

## Stack

- `@modelcontextprotocol/server` + `@modelcontextprotocol/express` + `@modelcontextprotocol/node` (Streamable HTTP transport)
- `@anthropic-ai/sdk` (model `claude-haiku-4-5`, `output_config.format.json_schema` for structured output)
- Express 5, TypeScript, Zod 4
