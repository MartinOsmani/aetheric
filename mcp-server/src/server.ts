import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

import { scorePromptIntent } from "./score-prompt-intent.js";

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);

const server = new McpServer({
  name: "aetheric-mcp-server",
  version: "0.1.0",
});

server.registerTool(
  "score_prompt_intent",
  {
    title: "Score prompt intent",
    description:
      "Score how monetisable a user prompt is for AI-native publisher ad insertion. " +
      "Returns an intent score (0-1), a matched ad category, a brand-safety verdict, and a one-sentence reason. " +
      "Use this to gate whether to surface a sponsored answer alongside an LLM response.",
    inputSchema: {
      prompt: z.string().describe("The user's prompt to evaluate."),
      candidate_category: z
        .string()
        .optional()
        .describe(
          "Optional ad category being considered for insertion (e.g. 'saas-crm', 'consumer-electronics').",
        ),
    },
  },
  async ({ prompt, candidate_category }) => {
    const result = await scorePromptIntent({
      prompt,
      candidateCategory: candidate_category,
    });

    return {
      structuredContent: result as unknown as Record<string, unknown>,
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

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    name: "aetheric-mcp-server",
    version: "0.1.0",
    description:
      "Aetheric — scores prompt intent for AI-native publisher ad insertion.",
    endpoints: { mcp: "/mcp" },
  });
});

// Stateless MCP Streamable HTTP endpoint: a fresh transport per request.
// Fine for a stateless scoring tool; if we add session state later, switch to
// sessionIdGenerator: randomUUID and keep transports in a map.
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    transport.close().catch(() => {});
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

// GET and DELETE on /mcp are part of the spec for session-aware clients; in
// stateless mode there is no session to resume or terminate, so respond 405.
app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method Not Allowed (stateless server)." },
    id: null,
  });
});
app.delete("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method Not Allowed (stateless server)." },
    id: null,
  });
});

app.listen(PORT, () => {
  console.log(
    `aetheric-mcp-server listening on http://127.0.0.1:${PORT} (MCP at POST /mcp)`,
  );
});
