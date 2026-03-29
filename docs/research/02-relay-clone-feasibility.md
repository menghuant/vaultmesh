# 重現 Relay.md 服務的技術與商業可行性分析

**研究日期：** 2026-03
**研究問題：** 如果我們自己開發一個類似 Relay.md 的服務（Obsidian 即時協作 + 資料夾權限），技術上可行嗎？商業上有機會嗎？
**結論摘要：** 技術上完全可行，核心難點在於 CRDT 衝突解決（建議直接用 Yjs，Relay.md 本身也是用 Yjs）；商業上風險高，市場天花板約年收 10-20 萬美元，如果只是內部使用就直接用 Relay.md 即可。

---

## 目錄

1. [技術難度評估](#技術難度評估)
2. [架構分析](#架構分析)
3. [CRDT 技術深入分析](#crdt-技術深入分析)
4. [MVP 工期估計](#mvp-工期估計)
5. [商業分析](#商業分析)
6. [競爭分析](#競爭分析)
7. [SaaS vs 純外掛分析](#saas-vs-純外掛分析)
8. [結論與建議](#結論與建議)

---

## 技術難度評估

### 整體難度：中高（但有現成輪子可用）

| 子系統 | 難度 | 說明 |
|--------|------|------|
| Obsidian 外掛（TypeScript） | ⭐⭐ | Obsidian Plugin API 文件完整，社群大，有大量範例 |
| WebSocket 伺服器 | ⭐⭐ | Node.js + ws 或 Socket.io，成熟技術 |
| **CRDT 衝突解決** | **⭐⭐⭐⭐** | **最難的部分，但 Yjs 已把複雜度封裝好** |
| 使用者認證（JWT + OAuth） | ⭐⭐ | 有大量成熟函式庫 |
| 資料夾權限系統 | ⭐⭐⭐ | 需要設計好 ACL 資料模型，有一定複雜度 |
| 持久化（文件狀態儲存） | ⭐⭐⭐ | Yjs 狀態的持久化需要用 LevelDB 或 PostgreSQL |
| 管理 Web Dashboard | ⭐⭐ | 用 Next.js 或 React，標準 CRUD |
| 行動端支援 | ⭐⭐⭐⭐ | Obsidian 行動端的外掛 API 比桌面端受限 |

### 最難的部分：CRDT 衝突解決

如果從零實作 CRDT，工程複雜度極高（需要深入理解分散式系統理論）。但由於 **Yjs** 的存在，這個問題已被大幅簡化：

- Yjs 是目前最成熟的 CRDT 函式庫，被 Tiptap、Liveblocks、HackerNews 等廣泛使用。
- Relay.md 本身就是使用 Yjs 實作的（可從其技術部落格和外掛程式碼中推斷）。
- 使用 Yjs 後，我們不需要理解 CRDT 演算法細節，只需要正確使用其 API。

---

## 架構分析

### 整體架構圖

```
┌─────────────────────────────────────────────────────────────┐
│                        用戶端                                 │
│  ┌──────────────────┐       ┌──────────────────┐             │
│  │  Obsidian Plugin │       │   Web Dashboard  │             │
│  │  (TypeScript)    │       │   (Next.js)      │             │
│  │                  │       │                  │             │
│  │  - 監聽檔案變更   │       │  - 成員管理      │             │
│  │  - Yjs 文件管理  │       │  - 資料夾權限設定 │             │
│  │  - WebSocket 連線│       │  - 活動日誌      │             │
│  └────────┬─────────┘       └────────┬─────────┘             │
│           │ WebSocket                │ HTTPS REST            │
└───────────┼──────────────────────────┼─────────────────────── ┘
            │                          │
┌───────────┼──────────────────────────┼──────────────────────── ┐
│           ▼          伺服器           ▼                         │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                   WebSocket 同步伺服器                    │  │
│  │  - Yjs WebSocket Provider（y-websocket）                │  │
│  │  - 房間管理（每個 vault = 一個房間）                      │  │
│  │  - 認證中間件（驗證 JWT token）                           │  │
│  │  - 權限檢查（讀/寫前驗證 ACL）                            │  │
│  └──────────────────────────┬──────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────┼─────────────────────────────┐   │
│  │                           ▼  儲存層                      │   │
│  │  ┌──────────────┐   ┌──────────────┐  ┌──────────────┐  │   │
│  │  │ Yjs 文件狀態 │   │ 使用者/Vault │  │ 權限 ACL     │  │   │
│  │  │ (LevelDB /   │   │ PostgreSQL   │  │ PostgreSQL   │  │   │
│  │  │  PostgreSQL) │   │              │  │              │  │   │
│  │  └──────────────┘   └──────────────┘  └──────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 元件說明

#### 1. Obsidian Plugin（TypeScript）

**核心職責：**
- 監聽 Obsidian 的 `vault.on('modify', ...)` 事件
- 將本地 Markdown 文件載入 Yjs `Y.Doc`
- 透過 `y-websocket` 的 `WebsocketProvider` 連接到伺服器
- 當收到遠端 Yjs update 時，將變更寫回本地 Markdown 檔案
- 管理連線狀態（online / offline / syncing）

**關鍵技術決策：整行 Yjs 整合 vs 字元級 Yjs 整合**

方案 A（簡單）：以整個文件為一個 `Y.Text`
- 優點：實作簡單
- 缺點：同時編輯同一段落的衝突解決可能不夠細緻

方案 B（理想）：Markdown AST 轉 Yjs 樹狀結構（`Y.XmlFragment`）
- 優點：段落層級的精確合併，保留 Markdown 格式語意
- 缺點：需要 Markdown parser（unified/remark）和雙向轉換，實作複雜

**建議：** 先用方案 A 上線，再逐步改進到方案 B。

```typescript
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const ydoc = new Y.Doc()
const provider = new WebsocketProvider(
  'wss://your-server.com',
  `vault-${vaultId}/file-${fileId}`,
  ydoc
)
const ytext = ydoc.getText('content')

// 本地修改 → Yjs
ytext.delete(0, ytext.length)
ytext.insert(0, newContent)

// Yjs 更新 → 本地
ytext.observe(() => {
  const content = ytext.toString()
  writeToLocalFile(filePath, content)
})
```

#### 2. 後端 WebSocket 伺服器

**技術棧建議：** Node.js + `y-websocket` server + Hono（HTTP API）

```javascript
import { setupWSConnection } from 'y-websocket/bin/utils'
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ port: 4000 })

wss.on('connection', (ws, req) => {
  // 1. 驗證 JWT token
  const token = extractToken(req)
  const user = verifyToken(token)
  if (!user) { ws.close(4001, 'Unauthorized'); return }

  // 2. 解析 room name = vault-{vaultId}/file-{fileId}
  const { vaultId, fileId } = parseRoom(req.url)

  // 3. 驗證使用者對該 vault/file 有讀寫權限
  const allowed = checkPermission(user.id, vaultId, fileId)
  if (!allowed) { ws.close(4003, 'Forbidden'); return }

  // 4. 交給 y-websocket 處理 CRDT 同步
  setupWSConnection(ws, req, { docName: `${vaultId}/${fileId}` })
})
```

#### 3. 持久化方案

**Yjs 文件狀態持久化：**
- 使用 `y-leveldb`（LevelDB 後端）或 `y-mongodb-provider` / `y-postgresql`
- 伺服器重啟後，文件的 Yjs 狀態可以從資料庫恢復
- 使用者斷線後再連線時，可以拿到最新的 Yjs update 序列

**選擇建議：**
- 單機部署：LevelDB（`y-leveldb`），零設定，效能好
- 多機部署：PostgreSQL + Redis（做 pub/sub 廣播）

#### 4. 權限資料模型

```sql
-- Vault（每個組織的 vault）
CREATE TABLE vaults (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vault 成員
CREATE TABLE vault_members (
  vault_id UUID REFERENCES vaults(id),
  user_id UUID REFERENCES users(id),
  role TEXT CHECK (role IN ('owner', 'editor', 'viewer')),
  PRIMARY KEY (vault_id, user_id)
);

-- 資料夾層級權限覆寫
CREATE TABLE folder_permissions (
  vault_id UUID REFERENCES vaults(id),
  folder_path TEXT NOT NULL,        -- e.g. '/engineering/'
  user_id UUID REFERENCES users(id),
  role TEXT CHECK (role IN ('editor', 'viewer', 'none')),
  PRIMARY KEY (vault_id, folder_path, user_id)
);
```

**權限解析邏輯（最長路徑優先）：**
1. 找到所有與請求路徑匹配的 `folder_permissions`（前綴匹配）
2. 取最長的路徑規則（最精確）
3. 如果沒有匹配，使用 `vault_members` 中的預設角色

---

## CRDT 技術深入分析

### 什麼是 CRDT？

CRDT（Conflict-free Replicated Data Type，無衝突複製資料型別）是一種特殊的資料結構，設計目標是：**在分散式系統中，多個副本（replica）可以獨立修改，當修改在網路上傳播時，無論以什麼順序合併，最終所有副本都會收斂到同一個狀態。**

具體到文字編輯器的場景：
- Alice 在第 5 個字元後插入「Hello」
- Bob 在同一時間在第 5 個字元後插入「World」
- CRDT 確保：最終所有人看到的文件都包含「Hello」和「World」，且合併結果是確定性的（不管訊息順序如何）。

### CRDT vs OT vs Last-Write-Wins

| 比較維度 | CRDT | OT（Operational Transformation） | Last-Write-Wins |
|----------|------|-----------------------------------|-----------------|
| 合併策略 | 所有修改都保留，確定性合併 | 所有修改都保留，依順序轉換 | 只保留最後的版本 |
| 衝突感知 | 使用者不感知衝突 | 使用者不感知衝突 | 有衝突副本 |
| 實作複雜度 | 高（但有 Yjs） | 非常高（Google 內部有大量論文） | 極低 |
| 離線支援 | ✓（天然支援） | △（難以正確實作離線後合併） | △ |
| 代表實作 | Yjs, Automerge | Google Docs, Etherpad | Obsidian Sync |
| 適合場景 | P2P 協作，分散式系統 | 中央伺服器協調 | 個人同步 |

**為什麼選 CRDT 而不是 OT？**

1. OT 在有中央伺服器的情況下實作容易，但正確實作非常困難（Google 有數十人的團隊做了多年）。
2. CRDT（特別是 Yjs）的離線支援天然更好：離線時繼續編輯，上線後自動合併，無需伺服器協調。
3. 對於 Obsidian 插件（用戶經常離線）而言，CRDT 的離線優先特性是關鍵優勢。

### Yjs vs Automerge vs 自己實作

#### Yjs

- **GitHub：** [github.com/yjs/yjs](https://github.com/yjs/yjs)
- **Stars：** 16k+（截至 2026-03）
- **語言：** JavaScript / TypeScript
- **演算法：** YATA（Yet Another Transformation Approach）
- **成熟度：** 非常高，被 Tiptap、Hocuspocus、Liveblocks、Gitbook、Vercel（部分功能）使用
- **生態系：** 豐富
  - `y-websocket`：WebSocket 後端和前端 Provider
  - `y-webrtc`：P2P WebRTC 同步
  - `y-indexeddb`：瀏覽器端持久化
  - `y-leveldb`：Node.js 伺服器持久化
  - `y-protocols`：同步協議
  - Tiptap、ProseMirror、CodeMirror、Quill 的 binding

**適合本專案的理由：**
1. JavaScript/TypeScript 生態，與 Obsidian 外掛和 Node.js 後端完全相容
2. `y-websocket` 提供現成的 WebSocket 伺服器和客戶端，大幅減少工作量
3. `Y.Text` 對 Markdown 純文字同步效果完美
4. 效能出色：更新以 binary 格式編碼，遠比 JSON diff 更小
5. Relay.md 已驗證此技術棧可行

#### Automerge

- **GitHub：** [github.com/automerge/automerge](https://github.com/automerge/automerge)
- **Stars：** 7k+
- **語言：** Rust + WebAssembly（Automerge 2.0 後重寫）
- **演算法：** CRDT based on JSON
- **特點：** 比 Yjs 更通用（支援任意 JSON 結構），但文字 CRDT 效能不如 Yjs
- **適合場景：** 複雜資料結構的協作（不只是文字），例如協作資料庫、圖表等

**為什麼不用 Automerge：**
1. Rust/WASM 在 Obsidian 外掛環境下有相容性問題
2. 文字同步效能不如 Yjs
3. 生態系（特別是 WebSocket provider）不如 Yjs 完整

#### 自己實作 CRDT

**強烈不建議**，原因：
1. 正確實作 CRDT 需要深入理解分散式系統理論（向量時鐘、HLC 時鐘、因果一致性等）
2. 邊緣案例測試極其困難（需要 property-based testing、chaos testing）
3. Yjs 已被數百萬用戶驗證，Bug 幾乎已被找出並修復
4. 開發時間：自己實作約 3-6 人月，用 Yjs 約 1-2 週
5. 維護負擔永遠無法消除

### Yjs 的文字 CRDT：`Y.Text`

`Y.Text` 是 Yjs 中專門針對純文字場景優化的 CRDT 型別：

```typescript
const ydoc = new Y.Doc()
const ytext = ydoc.getText('my-text')

// 插入
ytext.insert(0, 'Hello World')

// 刪除
ytext.delete(6, 5)  // 刪除 'World'

// 格式化（如果需要 rich text）
ytext.format(0, 5, { bold: true })

// 觀察變更
ytext.observe(event => {
  event.changes.delta.forEach(op => {
    if (op.insert) console.log('insert:', op.insert)
    if (op.delete) console.log('delete:', op.delete)
    if (op.retain) console.log('retain:', op.retain)
  })
})
```

**注意事項：**
- `Y.Text` 的操作是字元索引（character index），與 Markdown 行號無直接對應，需要轉換層
- 對於 frontmatter（YAML）和程式碼塊，純文字 CRDT 可能產生語法不合法的中間狀態，需要特殊處理
- 建議在寫回本地檔案前做一次 YAML parse 驗證，如果 frontmatter 解析失敗，可以暫時用上一個有效版本

---

## MVP 工期估計

### 功能範圍

**MVP 包含：**
1. Obsidian 外掛（基本版）：連線、同步指定資料夾、線上狀態顯示
2. 後端 WebSocket 伺服器：房間管理、Yjs CRDT、JWT 認證
3. 基本持久化：LevelDB
4. 簡單權限：vault 層級的 Owner / Editor / Viewer
5. 最小 Web UI：登入 / 登出、創建 vault、邀請成員

**MVP 不包含：**
- 資料夾層級的細粒度權限（放到 v2）
- 即時游標顯示（放到 v2）
- 行動端支援（放到 v2）
- Obsidian 以外的客戶端（VS Code、CLI）
- AI 整合（放到 v3）

### 工時估計

| 模組 | 工作項目 | 估計工時（工程師天） |
|------|----------|----------------------|
| 後端 | WebSocket 伺服器架設 + y-websocket 整合 | 5 天 |
| 後端 | JWT 認證 + 使用者系統 | 5 天 |
| 後端 | 基本 REST API（vault CRUD、成員管理） | 5 天 |
| 後端 | 持久化（LevelDB / PostgreSQL） | 3 天 |
| 後端 | Docker 化 + 部署腳本 | 2 天 |
| 外掛 | Obsidian 外掛架構 + Yjs 整合 | 7 天 |
| 外掛 | 檔案監聽 + 同步邏輯 | 5 天 |
| 外掛 | 連線管理 + 離線佇列 | 5 天 |
| 外掛 | 設定面板 UI | 3 天 |
| Web | 認證頁面（登入 / 登出） | 2 天 |
| Web | Vault 管理 + 成員邀請 | 5 天 |
| 整合 | 端對端測試 + Bug 修復 | 10 天 |
| **合計** | | **~57 工程師天** |

### 換算成團隊規模

| 團隊規模 | 估計時間（含緩衝 30%） |
|----------|------------------------|
| 1 人全職 | 約 12 週（3 個月） |
| 2 人全職 | 約 6-8 週（1.5-2 個月） |
| 3 人全職 | 約 4-6 週（1-1.5 個月） |

> **注意：** 以上估計假設是有 TypeScript + Node.js 經驗、了解 Obsidian 外掛開發的工程師。如果是第一次接觸 Obsidian API 或 CRDT，需要額外加 30-50% 的學習時間。

### 8-12 開發者月的評估

「8-12 開發者月」包含 MVP 之後到完整產品（含細粒度權限、行動端、MCP 整合、Web Dashboard 完整版）的總工作量，不只是 MVP。

---

## 商業分析

### 市場規模估算

#### Obsidian 用戶基礎

- Obsidian 商業授權（Catalyst，個人贊助）：社群估計付費用戶 10 萬+
- Obsidian 免費用戶（個人和非商業用途免費）：估計 100-150 萬活躍用戶
- Obsidian 的商業授權（公司使用需付費 $50/user/年）：較少公開數據，估計 5-10 萬付費席位

**來源：** Obsidian 官方 Sync 服務訂閱者數量未公開，但社群論壇、Reddit 和外掛下載量顯示活躍用戶規模約 150 萬（截至 2025 年）。

#### 可觸及的付費市場

假設：
- 活躍 Obsidian 用戶：150 萬
- 其中「在團隊中使用 Obsidian」的比例：5-10% → 7.5-15 萬人
- 其中「願意付費解決協作問題」的比例：5-20% → **3,750-30,000 人**

**保守目標：** 1,000 個付費用戶（各個規模的小團隊）

#### 收入模型試算

假設定價：$5-8/user/月

| 情境 | 付費用戶數 | 平均 ARPU | 月收入 | 年收入 |
|------|------------|-----------|--------|--------|
| 悲觀 | 500 人 | $6 | $3,000 | $36,000 |
| 中性 | 2,000 人 | $6 | $12,000 | $144,000 |
| 樂觀 | 5,000 人 | $6 | $30,000 | $360,000 |
| 最佳 | 10,000 人 | $6 | $60,000 | $720,000 |

**收入天花板評估：年 10-20 萬美元（中性情境）**

這個數字的含義：
- 對於一個人的 side project：不錯的副業收入
- 對於 2-3 人的全職創業：**不夠支撐正常薪資**（灣區/台灣工程師年薪 $80k-200k）
- 除非能擴展到 Obsidian 以外的市場（VSCode、Logseq、Foam 等），否則市場天花板太低

### 為什麼市場天花板低？

1. **Obsidian 的核心用戶是「最會自己解決問題的人」**（工程師、研究者）：他們更傾向自架或用 Git 免費解決，付費意願相對低。
2. **市場很利基**：「用 Obsidian 做團隊知識庫」比「用任何工具做知識庫」的用戶子集小很多。
3. **企業採購障礙**：企業 IT 部門傾向採購有 SLA、SOC2 認證、正式支援的工具，Obsidian 生態的工具難以通過企業採購流程。
4. **競品免費策略**：Obsidian LiveSync（開源自架）、Git 方案都是免費的，壓縮了付費空間。

---

## 競爭分析

### 直接競品

#### Relay.md

| 項目 | 詳情 |
|------|------|
| **定位** | Obsidian 即時協作外掛 + 雲端服務 |
| **技術** | Yjs CRDT（確認），WebSocket |
| **定價** | Free（3 人）→ Pro $6/user/月 |
| **優勢** | 先行者，已有用戶，產品已驗證 |
| **劣勢** | 無自架選項，服務成熟度待觀察 |
| **GitHub Stars** | 外掛約 2k+（截至 2026-03） |

**競爭結論：** Relay.md 是直接競品，且已先行。如果要超越，需要差異化（自架選項、更好的 AI 整合、更好的 VS Code 支援）。

#### Obsidian LiveSync

| 項目 | 詳情 |
|------|------|
| **定位** | 開源、自架的 Obsidian 同步外掛 |
| **技術** | CouchDB 同步協議（CRDT-like），非 Yjs |
| **定價** | 完全免費 |
| **優勢** | 免費，可完全自架，活躍開發 |
| **劣勢** | 設定複雜（需要自己架 CouchDB），無商業支援，UI 差 |
| **GitHub Stars** | 3.5k+（截至 2026-03） |

**競爭結論：** 面向「願意自己架設的技術用戶」，是免費的選擇。我們的付費服務需要比 LiveSync 的自架體驗好 10 倍才能說服這些用戶付費。

### 間接競品

| 競品 | 競爭點 |
|------|--------|
| Obsidian Sync | 官方服務但無協作，用戶可能在兩者之間二選一 |
| Notion | 用戶可能整個遷移到 Notion 而不用 Obsidian |
| Linear + Confluence | 企業用戶的替代選擇 |

---

## SaaS vs 純外掛分析

### 方案 A：純外掛（不做雲端服務）

**模式：** 開發 Obsidian 外掛，讓用戶自己架設後端伺服器（Docker 一鍵部署），外掛免費或一次性付費。

**優點：**
- 無伺服器維護成本
- 隱私友好，吸引自架用戶
- 開發複雜度低（不需要多租戶架構）

**缺點：**
- 商業模式難：如果完全開源，收入只能靠贊助 / 一次性付費
- 無法提供「就直接能用」的體驗（用戶需要自己架後端）
- 無法做到「無感升級」

**收入估計：** GitHub Sponsors + 一次性授權費，年 $1-5 萬（參考類似規模的開源外掛）

### 方案 B：SaaS（雲端托管服務）

**模式：** 我們提供雲端 WebSocket 伺服器，外掛連到我們的服務，按 seat 收費。

**優點：**
- 可預期的 MRR，更好的商業模式
- 「零設定」體驗，降低使用門檻
- 可以做使用者數據分析，改善產品

**缺點：**
- 需要維護雲端基礎設施（成本：$50-200/月起）
- 資料在我們伺服器，隱私顧慮
- 多租戶架構複雜度高
- 需要 SLA、安全審計等

**收入估計：** 如前述商業分析，中性情境年 $10-20 萬

### 方案 C：雙軌（Self-hosted + SaaS）

**模式：** 開源後端（可自架），同時提供 SaaS 托管版（付費）。類似 GitLab / Outline 的模式。

**優點：**
- 吸引兩種用戶（DIY 用戶和懶人）
- 開源贏得信任，SaaS 獲得收入
- 社群驅動的 Bug 修復

**缺點：**
- 需要同時維護自架文件和 SaaS 服務
- 企業客戶可能傾向自架，不付費

**結論：方案 C 是最理想的長期策略**，但需要更多資源。對於 MVP，先做 SaaS 版驗證市場。

---

## 結論與建議

### 如果目的是「Morph 團隊內部使用」

**直接用 Relay.md。** 理由：
- $60/月 對 10 人小團隊是零摩擦費用
- 功能已驗證，體驗比自己開發的 MVP 好
- 工程師時間成本遠高於 $60/月
- 可以立刻開始使用，不需要等開發週期

### 如果目的是「開發成商業產品」

**技術上可行，但商業上需要謹慎評估：**

1. **先決定市場策略**：
   - 只做 Obsidian？天花板 $10-20 萬/年
   - 擴展到「通用 Markdown vault 同步」（Obsidian + VS Code + CLI）？天花板提升 5-10 倍

2. **差異化方向**：
   - **AI 整合**：MCP 伺服器讓 Claude Code 可以讀寫知識庫，這是 Relay.md 沒有的
   - **自架選項**：滿足隱私敏感的企業用戶
   - **多編輯器支援**：不只 Obsidian，也支援 VS Code、CLI

3. **建議執行順序**：
   - 第一週：評估是否要做，確定差異化方向
   - 第一個月：驗證 Yjs + WebSocket 核心可行性（POC）
   - 前三個月：打造 MVP，找到前 10 個付費用戶
   - 三到六個月：根據用戶反饋決定是否繼續投入

### 技術建議（如果決定做）

1. **後端：** Node.js + `y-websocket` + Hono + PostgreSQL（LevelDB for Yjs persistence）
2. **外掛：** TypeScript + Yjs + `y-websocket` WebsocketProvider
3. **認證：** JWT + OAuth2（GitHub、Google）
4. **部署：** Docker Compose，部署到 Fly.io 或 Hetzner
5. **不要自己實作 CRDT**：直接用 Yjs，省 3-6 個月

---

*最後更新：2026-03*
*研究者：Morph Team*
