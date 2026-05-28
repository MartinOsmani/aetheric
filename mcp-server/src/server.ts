import "dotenv/config";

import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import { scorePromptIntent } from "./score-prompt-intent.js";

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);

const server = new McpServer({
  name: "aetheric-mcp-server",
  version: "0.1.0",
});

server.registerTool(
  "score_prompt_intent",
  {
    description:
      "Score how monetisable a user prompt is for AI-native publisher ad insertion. " +
      "Returns an intent score (0-1), a matched ad category, a brand-safety verdict, and a one-sentence reason. " +
      "Use this to gate whether to surface a sponsored answer alongside an LLM response.",
    inputSchema: z.object({
      prompt: z.string().describe("The user's prompt to evaluate."),
      candidate_category: z
        .string()
        .optional()
        .describe(
          "Optional ad category being considered for insertion (e.g. 'saas-crm', 'consumer-electronics').",
        ),
    }),
  },
  async ({ prompt, candidate_category }) => {
    const result = await scorePromptIntent({
      prompt,
      candidateCategory: candidate_category,
    });

    return {
      structuredContent: result,
      content: [
        {
          type: "text",
          text:
            `intent_score=${result.intent_score.toFixed(2)} ` +
            `category=${result.recommended_category} ` +
            `brand_safety=${result.brand_safety} ` +
            `confidence=${result.confidence.toFixed(2)}\n` +
            result.reasoning,
        },
      ],
    };
  },
);

const app = createMcpExpressApp();

app.get("/", (_req, res) => {
  res.json({
    name: "aetheric-mcp-server",
    version: "0.1.0",
    description:
      "Aetheric — scores prompt intent for AI-native publisher ad insertion.",
    endpoints: { mcp: "/mcp" },
  });
});

app.post("/mcp", async (req, res) => {
  // Stateless: a transport per request. Fine for a single-tool scoring server.
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(
    `aetheric-mcp-server listening on http://127.0.0.1:${PORT} (MCP at /mcp)`,
  );
});
