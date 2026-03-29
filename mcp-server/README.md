# @vaultmesh/mcp-server

VaultMesh MCP Server — 讓 Claude Code 直接存取知識庫（佔位）。

## 概述

實作 [Model Context Protocol](https://modelcontextprotocol.io/) 的伺服器，讓 Claude Code 等 AI 助手可以：

- 搜尋知識庫內容（`search_vault`）
- 讀取筆記（`read_note`）
- 新增或更新文件（`create_note`、`update_note`）
- 列出最近更新（`list_recent`）
- 查詢版本歷史（`get_history`）

## 狀態

目前為佔位套件，將在 Phase 3 正式開發。

## Claude Code 整合（未來）

在 `~/.claude/claude_desktop_config.json` 加入：

```json
{
  "mcpServers": {
    "vaultmesh": {
      "command": "npx",
      "args": ["-y", "@vaultmesh/mcp-server"],
      "env": {
        "VAULTMESH_URL": "ws://localhost:4444",
        "VAULTMESH_TOKEN": "your-jwt-token"
      }
    }
  }
}
```
