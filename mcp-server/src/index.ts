#!/usr/bin/env node
/**
 * VaultMesh MCP Server
 *
 * Exposes vault documents as MCP resources and provides search/query tools
 * so Claude Code can read and reason over your team's Markdown knowledge base.
 *
 * Protocol: MCP (Model Context Protocol) over stdio
 */

import { createInterface } from "node:readline";

// TODO: replace with @modelcontextprotocol/sdk when stable
const rl = createInterface({ input: process.stdin, output: process.stdout });

process.stdout.write(
  JSON.stringify({ jsonrpc: "2.0", method: "initialized", params: { name: "vaultmesh", version: "0.1.0" } }) + "\n"
);

rl.on("line", (line) => {
  try {
    const req = JSON.parse(line) as { id: unknown; method: string };
    if (req.method === "tools/list") {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: req.id,
          result: {
            tools: [
              {
                name: "search_vault",
                description: "Full-text search across all Markdown files in the connected vault",
                inputSchema: {
                  type: "object",
                  properties: { query: { type: "string" } },
                  required: ["query"],
                },
              },
              {
                name: "read_note",
                description: "Read a specific note by path",
                inputSchema: {
                  type: "object",
                  properties: { path: { type: "string" } },
                  required: ["path"],
                },
              },
            ],
          },
        }) + "\n"
      );
    }
  } catch {
    // ignore malformed input
  }
});
