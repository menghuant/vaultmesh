# VaultMesh

**AI 原生 Markdown 知識庫團隊同步服務**

VaultMesh 讓團隊能夠即時協作編輯 Markdown 知識庫，並透過 AI 輔助實現智慧合併、語意搜尋與衝突解決。

---

## 專案架構

```
vaultmesh/
├── server/              # WebSocket 同步伺服器（後端 API）
├── plugin-obsidian/     # Obsidian 插件
├── plugin-vscode/       # VS Code 擴充功能
├── cli/                 # 命令列工具
├── mcp-server/          # Model Context Protocol 伺服器（AI 助手整合）
├── web/                 # Web 儀表板（Next.js）
└── packages/
    ├── core/            # 核心共享型別、工具與同步邏輯
    └── auth/            # 認證與授權模組
```

## 核心功能

- **即時同步** — 基於 CRDT（Yjs）的無衝突分散式同步
- **AI 智慧合併** — 利用大型語言模型協助解決語意衝突
- **多平台插件** — 支援 Obsidian、VS Code 及命令列
- **MCP 整合** — 透過 Model Context Protocol 讓 AI 助手直接讀寫知識庫
- **向量搜尋** — 對 Markdown 內容進行語意搜尋
- **細粒度權限** — 支援擁有者、編輯者、檢視者三種角色

## 技術棧

| 層級 | 技術 |
|------|------|
| 執行環境 | Node.js 20+，TypeScript 5 |
| 套件管理 | pnpm workspaces + Turbo |
| 同步協議 | Yjs CRDT + WebSocket |
| 後端框架 | Hono / Fastify（待定） |
| 前端框架 | Next.js 14 |
| AI 整合 | Anthropic Claude API，MCP |
| 認證 | JWT + OAuth2 |

## 快速開始

### 前置需求

- Node.js >= 20.0.0
- pnpm >= 9.0.0

### 安裝依賴

```bash
pnpm install
```

### 啟動開發環境

```bash
# 啟動所有服務
pnpm dev

# 僅啟動後端伺服器
pnpm --filter @vaultmesh/server dev

# 僅啟動 Web 儀表板
pnpm --filter @vaultmesh/web dev

# 啟動 MCP 伺服器
pnpm --filter @vaultmesh/mcp-server dev
```

### 建置

```bash
pnpm build
```

### 型別檢查

```bash
pnpm typecheck
```

## Workspace 說明

### `packages/core`

共享的核心邏輯，包含：
- `VaultDocument`、`SyncState` 等核心型別定義
- 文件 checksum 計算與衝突偵測工具
- 三方合併演算法

### `packages/auth`

認證與授權模組，包含：
- `User`、`Session`、`VaultPermission` 型別
- JWT 解析與驗證工具

### `server`

後端 WebSocket 同步伺服器，負責：
- 管理 CRDT 文件狀態
- 廣播文件更新至所有連線用戶端
- REST API 供插件與 CLI 使用

### `plugin-obsidian`

Obsidian 插件，提供：
- 一鍵同步指令
- 衝突提示與解決介面
- 離線佇列支援

### `plugin-vscode`

VS Code 擴充功能，提供：
- 狀態列顯示同步狀態
- 多人即時游標顯示
- 整合式衝突解決工具

### `cli`

命令列工具，支援：
- `vaultmesh init` — 初始化知識庫
- `vaultmesh sync` — 手動觸發同步
- `vaultmesh status` — 檢視同步狀態
- `vaultmesh invite` — 邀請協作者

### `mcp-server`

MCP 伺服器，讓 AI 助手能夠：
- 讀取與搜尋知識庫筆記
- 新增或更新文件
- 查詢版本歷史

### `web`

Next.js Web 儀表板，提供：
- 知識庫管理介面
- 成員與權限設定
- 同步歷史與衝突記錄

## MVP 三階段藍圖

### Phase 1：核心同步 🔧

目標：單一 vault、兩台機器能即時同步 Markdown 檔案。

- [ ] `packages/core`：Yjs Doc 包裝、檔案樹管理、增量 diff
- [ ] `server`：y-websocket 伺服器、房間管理、持久化（LevelDB）
- [ ] `packages/auth`：JWT 簽發 / 驗證，vault 成員清單
- [ ] `plugin-obsidian`：連線設定、同步狀態列、衝突通知

**里程碑**：兩位用戶同時編輯同一份筆記，變更 < 500ms 同步，無資料遺失。

---

### Phase 2：多平台與管理介面 🌐

目標：擴展至 VS Code、CLI，並提供 Web 管理頁面。

- [ ] `plugin-vscode`：側邊欄同步狀態、衝突視覺化
- [ ] `cli`：`vaultmesh pull/push/status/config` 指令
- [ ] `web`：vault 成員管理、同步歷史、存取控制
- [ ] `server`：REST API、Webhook 事件推送

**里程碑**：開發者可用 CLI 在 CI 流程中自動拉取 / 推送知識庫。

---

### Phase 3：AI 整合 🤖

目標：將知識庫接入 Claude，實現 AI 輔助知識管理。

- [ ] `mcp-server`：實作 MCP 工具（`search_vault`、`read_note`、`create_note`、`list_recent`）
- [ ] 語意搜尋索引（Embedding + 向量資料庫）
- [ ] Claude Code 可直接在對話中查詢、引用、更新筆記
- [ ] 智慧衝突解析：AI 提供合併建議

**里程碑**：在 Claude Code 中輸入 `search_vault("設計決策")` 立即取得相關筆記。

---

## 開發規範

- 所有套件使用 TypeScript strict mode
- 提交前執行 `pnpm typecheck` 及 `pnpm lint`
- 遵循 [Conventional Commits](https://www.conventionalcommits.org/) 規範

## 授權

MIT License © 2026 VaultMesh Contributors
