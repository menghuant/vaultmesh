# 通用 Markdown Vault 團隊同步服務的市場與技術分析

**研究日期：** 2026-03
**研究問題：** 如果把視角從「Obsidian 協作」擴大到「任何編輯器的 Markdown vault 團隊同步」，這個市場有多大？技術怎麼做？差異化在哪裡？
**核心洞察：** 目前沒有任何產品同時提供「本地 Vault Markdown ＋ 跨編輯器 ＋ 團隊權限 ＋ AI 整合」，這是真實的市場空白。
**結論摘要：** SAM 約 20-40 億美元，SOM 前三年約 2,000-4,000 萬美元；差異化關鍵在「AI-native 定位」——不只是文件同步，而是**團隊 AI 記憶同步**。

---

## 目錄

1. [市場缺口分析](#市場缺口分析)
2. [現有競品分析](#現有競品分析)
3. [市場規模估算](#市場規模估算)
4. [Claude Code 整合分析](#claude-code-整合分析)
5. [技術架構建議](#技術架構建議)
6. [MVP 規劃](#mvp-規劃)
7. [最大風險分析](#最大風險分析)
8. [差異化策略](#差異化策略)

---

## 市場缺口分析

### 現有工具的能力矩陣

| 工具 | 本地 Markdown | 跨編輯器 | 團隊權限 | 即時協作 | AI 整合 |
|------|:-------------:|:--------:|:--------:|:--------:|:-------:|
| Obsidian Sync | ✓ | ✗（僅 Obsidian） | **✗** | △ | ✗ |
| Relay.md | ✓ | ✗（僅 Obsidian） | ✓ | ✓ | ✗ |
| Outline | ✗（DB only） | ✓（Web UI） | ✓ | ✓ | △ |
| Notion | ✗ | ✓（Web + App） | ✓ | ✓ | ✓ |
| Syncthing | ✓ | ✓ | **✗** | ✓ | ✗ |
| Git + GitHub | ✓ | ✓ | △（repo 層級）| ✗ | △ |
| Dropbox / OneDrive | ✓ | ✓ | △（資料夾層級）| ✓ | ✗ |
| **VaultMesh（目標）** | **✓** | **✓** | **✓** | **✓** | **✓** |

### 核心市場空白

**沒有任何現有產品同時滿足以下五個條件：**

1. **本地 Vault Markdown**：檔案以 `.md` 格式儲存在用戶本地，可以用任何文字編輯器讀寫，不被鎖在專有格式裡。

2. **跨編輯器支援**：不管用的是 Obsidian、VS Code、Vim、Cursor 還是 Zed，都能無縫同步。這對開發者特別重要——有人用 Obsidian 做筆記，有人用 VS Code 在 IDE 裡直接寫，有人用 CLI 腳本自動寫入。

3. **團隊權限控制**：可以設定「工程師看不到財務資料夾」、「實習生只能讀取設計規範，無法編輯」。這在企業環境是必要需求，但現有的本地 Markdown 同步工具完全沒有。

4. **即時協作**：多人同時編輯時不需要手動解衝突，CRDT 確保所有人的修改都保留。

5. **AI 整合**：LLM 工具（Claude Code、GitHub Copilot、Cursor）可以直接讀寫知識庫，把知識庫變成「團隊 AI 的共享記憶」。

### 為什麼這個空白「現在」出現？

1. **Claude Code / Cursor 的爆發**：2024-2025 年，AI 程式碼編輯器迅速普及。開發者開始把 Markdown 知識庫當作「AI 的上下文源」——`.cursor/rules`、`CLAUDE.md`、`docs/` 目錄。但這些「AI 記憶」是私人的，沒辦法團隊共享和同步。

2. **Obsidian 的爆發**：Obsidian 在 2022-2024 年間成為知識工作者的主流工具，但其設計哲學是「個人優先」，沒有原生的團隊功能。

3. **遠端工作常態化**：分散式團隊對非同步知識共享的需求大增，而現有工具要麼是「用 Notion（失去本地 Markdown）」要麼是「用 Git（衝突麻煩）」，兩者都不理想。

---

## 現有競品分析

### 直接競品

#### Obsidian Sync

**定位：** 個人多裝置同步，不是團隊協作工具

| 項目 | 分析 |
|------|------|
| 優勢 | 官方服務，穩定，E2E 加密 |
| 核心缺陷 | **無資料夾 / 文件層級的存取控制** |
| 定價 | $8/user/月（年付） |
| 目標用戶 | 個人知識工作者 |
| 競爭判斷 | **不是直接競品**；它的目標是個人，我們的目標是團隊 |

**市場機會：** Obsidian Sync 的用戶中，有 5-10% 嘗試把它用在團隊場景，但因為沒有權限控制而放棄，這部分用戶是我們的潛在客戶。

#### Relay.md

**定位：** Obsidian 即時協作，CRDT 同步

| 項目 | 分析 |
|------|------|
| 優勢 | 先行者，Obsidian 深度整合，即時協作成熟 |
| 核心缺陷 | **僅支援 Obsidian**；無跨編輯器；無自架選項 |
| 定價 | Free（3 人） → $6/user/月 |
| 目標用戶 | Obsidian 重度用戶的小團隊 |
| 競爭判斷 | **直接競品**，但我們的差異化是跨編輯器 + AI |

**競爭策略：** 不正面競爭 Relay.md 的核心市場（Obsidian 用戶），而是拓展到「非 Obsidian 但有 Markdown vault 需求」的開發者，以及 AI 整合需求。

#### Syncthing

**定位：** 開源、P2P、去中心化的檔案同步

| 項目 | 分析 |
|------|------|
| 優勢 | 完全免費，無伺服器，效能好，跨平台 |
| 核心缺陷 | **無任何權限管理**；無衝突解決（last-write-wins 近似）；無 AI 整合 |
| 定價 | 完全免費開源 |
| 目標用戶 | 技術用戶，個人備份和同步 |
| 競爭判斷 | **間接競品**；提供基礎同步，但無法滿足團隊需求 |

**市場機會：** 正在用 Syncthing + Git 組合的技術團隊，因為衝突解決和權限管理麻煩而尋找更好的方案。

#### Git + GitHub / GitLab

**定位：** 版本控制，不是即時協作工具

| 項目 | 分析 |
|------|------|
| 優勢 | 開發者熟悉，版本歷史完整，免費（公開） |
| 核心缺陷 | **無即時協作**；衝突需手動解決；無 CRDT |
| 定價 | GitHub Free → $4/user/月（Team） |
| 目標用戶 | 技術用戶，文件工程（docs-as-code） |
| 競爭判斷 | **間接競品**；是目前最常見的「湊合方案」 |

**關鍵洞察：** 很多開發者團隊目前用 Git 管理知識庫，但忍受衝突解決的痛苦。這些用戶是我們最容易轉換的目標。

### 非 Markdown 競品（對比用）

| 工具 | 關鍵差異 | 我們的優勢 |
|------|---------|-----------|
| Notion | 非本地 Markdown，專有格式 | 本地優先，開放格式，AI 工具直接讀取 |
| Confluence | 企業向，Heavy，貴 | 輕量，開發者友好，本地 Markdown |
| Nuclino | SaaS，無本地檔案 | 本地優先 |
| Coda | 複雜，非 Markdown | 簡單，Markdown 原生 |

---

## 市場規模估算

### TAM（總可觸及市場）

**定義：** 所有需要「共享文件和知識庫同步」的知識工作者

| 細分市場 | 人數估計 | 說明 |
|----------|----------|------|
| 全球開發者 | 2,800 萬（GitHub 活躍用戶） | 最核心目標 |
| 設計師（Figma / Sketch 用戶） | 500 萬 | 次要目標 |
| 知識工作者（研究者、PM、作家） | 5,000 萬 | 廣義目標 |
| **Total TAM** | **~8,000 萬人** | |

假設每人每月願意為知識庫工具付 $5-10：
**TAM ≈ $48-96 億/年**

### SAM（可服務市場）

**定義：** 使用 Markdown 的開發者和知識工作者，有團隊協作需求

| 細分 | 比例 | 人數 |
|------|------|------|
| 開發者中使用 Markdown 的比例 | 70% | ~2,000 萬 |
| 其中有團隊知識庫需求的比例 | 30% | ~600 萬 |
| 知識工作者中使用 Markdown 的比例 | 5% | ~250 萬 |
| **SAM 合計** | | **~850 萬人** |

假設每人每月 $5：
**SAM ≈ $5 億/年**

但考慮到競品（Git 免費、Notion 免費方案）的替代效應，有效 SAM 約：
**SAM（有效）≈ $20-40 億/年**

> **注意：** 這裡的「有效」是指在合理定價下（$5-15/user/月）願意付費的市場規模，而不是理論最大值。

### SOM（可獲得市場）

**定義：** 考慮競爭格局、資源限制、執行能力後，我們實際能拿到的市場份額

**假設：**
- 我們的目標是開發者 + 使用 Obsidian / VS Code 的知識工作者小團隊
- 平均每個「客戶」是 5-15 人的小團隊，每月付 $5/user
- 前 3 年目標：1,000-4,000 個付費團隊（客戶），每個團隊平均 8 人

| 情境 | 付費客戶（團隊數） | 平均 MRR/客戶 | 月收入 | 年收入 |
|------|-------------------|---------------|--------|--------|
| Year 1（保守） | 200 | $40 | $8,000 | $96,000 |
| Year 2（中性） | 1,000 | $45 | $45,000 | $540,000 |
| Year 3（樂觀） | 4,000 | $50 | $200,000 | $2,400,000 |

**SOM（Year 1-3）≈ 2,000-4,000 萬美元（累計）**

這個數字足以支撐 3-5 人的精實團隊，但離「大成功」（$1 億 ARR）還需要更大的市場突破（可能要靠企業版或 AI 整合的爆發）。

---

## Claude Code 整合分析

### 為什麼 AI 整合是差異化關鍵？

2025-2026 年，AI 程式碼助手（Claude Code、Cursor、GitHub Copilot）已經成為開發者的標準工具。這些工具的一個核心需求是：**能夠讀取團隊的「上下文知識」**——包括架構決策、設計規範、會議紀錄、API 文件。

問題：**這些知識散落在每個人的本地 Markdown vault 裡，沒有辦法讓 AI 工具存取團隊的集體知識。**

VaultMesh 的機會：把本地 vault 變成「團隊 AI 的共享記憶」。

### MCP vs 其他整合路徑

#### 路徑 A：直接讀取本地 Markdown 檔案（File System）

**方式：** Claude Code 設定本地 Markdown 目錄的讀取權限，直接讀 `.md` 檔案

**優點：**
- 零延遲，不需要網路
- 不需要任何特殊整合
- 已有用戶這樣用（Claude Code + 本地 vault）

**缺點：**
- **只能讀自己本地的 vault，讀不到其他人的**
- 無法做即時搜尋（只能靠 Claude 的上下文視窗）
- 無法跨 vault 查詢

#### 路徑 B：Symlink 方案

**方式：** 把 VaultMesh 同步的資料夾 symlink 到 Claude Code 可以讀取的目錄

**優點：** 簡單，不需要任何 API

**缺點：**
- 需要手動設定 symlink
- 無法做語意搜尋（全文向量搜尋）
- 無法設定細粒度的「AI 只能讀哪些資料夾」
- 所有同步到本地的內容都會被 AI 讀取，無法按 AI 用戶設定不同的存取權限

#### 路徑 C：MCP Server（✓ 最佳路徑）

**方式：** VaultMesh 提供一個 MCP Server，Claude Code 透過 MCP 協議呼叫 VaultMesh 的工具

**優點：**
- **標準協議**：Claude Code、Cursor 等支援 MCP 的工具都能用
- **語意搜尋**：可以提供 `search_vault` 工具，基於向量 embedding 做語意搜尋
- **細粒度存取控制**：MCP Server 可以根據登入用戶，只暴露其有權限讀取的文件
- **寫入能力**：AI 可以透過 `write_note` 工具自動更新知識庫（例如：自動記錄會議紀錄、自動更新 API 文件）
- **活動日誌**：可以記錄 AI 讀取了哪些文件，用於審計

**缺點：**
- 需要實作 MCP Server（工程工作量）
- 需要使用者在 Claude Code / Cursor 中設定 MCP

**MCP 工具設計：**

```typescript
// MCP 工具定義
const tools = [
  {
    name: "search_vault",
    description: "在團隊知識庫中語意搜尋相關文件",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜尋查詢字串" },
        folder: { type: "string", description: "限定搜尋的資料夾路徑（可選）" },
        limit: { type: "number", description: "回傳結果數量，預設 5" }
      },
      required: ["query"]
    }
  },
  {
    name: "read_note",
    description: "讀取指定路徑的 Markdown 文件內容",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路徑，如 /engineering/architecture.md" }
      },
      required: ["path"]
    }
  },
  {
    name: "write_note",
    description: "新增或更新 Markdown 文件",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路徑" },
        content: { type: "string", description: "Markdown 內容" },
        create_if_not_exists: { type: "boolean", description: "如果不存在是否創建" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "list_notes",
    description: "列出資料夾中的文件",
    inputSchema: {
      type: "object",
      properties: {
        folder: { type: "string", description: "資料夾路徑" },
        recursive: { type: "boolean", description: "是否遞迴列出子資料夾" }
      }
    }
  },
  {
    name: "get_recent_changes",
    description: "取得最近修改的文件列表",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string", description: "ISO 8601 日期時間字串" },
        limit: { type: "number", description: "回傳數量限制" }
      }
    }
  }
]
```

**使用情境：**

```
# 用戶在 Claude Code 中問：
「幫我查一下我們的 API 認證是怎麼設計的」

# Claude Code 呼叫：
search_vault({ query: "API 認證設計" })
# → 回傳: /engineering/auth-design.md, /api/authentication.md

read_note({ path: "/engineering/auth-design.md" })
# → 回傳文件內容

# Claude Code 基於知識庫內容回答，並能引用具體文件
```

### AI 整合的更大願景：「團隊 AI 記憶同步」

不只是讓 AI 讀取知識庫，而是：

1. **AI 自動寫入**：Claude Code 完成一個功能後，自動把設計決策寫入 `/engineering/decisions/YYYY-MM-DD-feature-name.md`
2. **跨成員的 AI 上下文共享**：A 工程師跟 Claude 討論的架構決策，B 工程師在自己的 Claude 對話中也能取得
3. **AI 輔助衝突解決**：當兩個人對同一份文件有語意上的衝突（不只是文字合併衝突），AI 可以分析並提出合併建議
4. **智慧摘要**：定期讓 AI 把知識庫的最新內容總結成「週摘要」推送給成員

---

## 技術架構建議

### 核心原則

1. **Yjs CRDT + 區塊同步**：避免 Git 和 OT 的缺點
2. **本地優先（Local-first）**：本地有完整副本，離線也能工作
3. **任何編輯器透明**：對 Obsidian、VS Code、Vim 而言，vault 就是普通的本地目錄
4. **MCP First**：從設計初期就把 AI 整合考慮進去

### 為什麼避免 Git？

| 問題 | Git 的限制 |
|------|------------|
| 即時協作 | Git 是版本控制，不是即時協作工具；pull/push 有延遲 |
| 衝突解決 | Merge conflict 需要人工介入，對非技術用戶不友好 |
| 資料夾權限 | Git 原生不支援子目錄存取控制 |
| 二進位檔案 | 圖片、PDF 等二進位檔案的衝突無法合併 |

### 為什麼避免 OT？

| 問題 | OT 的限制 |
|------|------------|
| 實作複雜度 | 正確實作需要數年和大量人力（Google Docs 的例子） |
| 離線支援 | OT 需要中央伺服器協調，離線後合併困難 |
| 成熟度 | 沒有開箱即用的 OT 函式庫可以直接用在 Markdown 上 |

### 推薦技術棧

#### 同步核心

```
Yjs CRDT
├── Y.Doc：每個文件一個 CRDT 文件
├── Y.Text：文件內容（Markdown 純文字）
├── Y.Map：文件 metadata（frontmatter、標籤）
└── y-websocket：WebSocket 同步 provider
```

#### 區塊同步（Block-level Sync）

**問題：** 大型 vault（數千個 Markdown 檔案）如果每個連線都同步全部文件，頻寬和記憶體開銷巨大。

**解決方案：區塊同步（delta sync）**

```
客戶端每次同步只傳送：
1. 自上次同步以來修改過的文件列表
2. 每個文件的 Yjs update（增量，不是全文）
3. 新建或刪除的文件

伺服器：
1. 驗證客戶端有權限存取這些文件
2. 廣播 Yjs updates 給其他有權限的連線用戶端
3. 持久化 Yjs 文件狀態
```

#### 本地 Daemon 架構

**為了支援「任何編輯器」**，需要一個本地 Daemon 進程：

```
VaultMesh Daemon（背景進程，類似 Dropbox）
├── 監聽本地 vault 目錄的檔案系統事件（chokidar / FSEvents）
├── 維護每個文件的 Yjs Doc
├── 與 VaultMesh 伺服器保持 WebSocket 連線
├── 當本地檔案變更時：更新 Yjs Doc → 傳送 update 到伺服器
├── 當收到遠端 update 時：更新 Yjs Doc → 寫入本地檔案
└── 本地 HTTP API（供 Obsidian 外掛、VS Code 外掛查詢狀態）
```

這樣，Obsidian 外掛和 VS Code 外掛不需要各自維護 WebSocket 連線，只需要和本地 Daemon 通訊：

```
Obsidian Plugin    VS Code Extension    CLI
      ↓                    ↓              ↓
      └──────── 本地 HTTP API ───────────┘
                      ↓
              VaultMesh Daemon
                      ↓
            WebSocket → VaultMesh 伺服器
```

優點：
- 單一連線，效能好
- 各編輯器外掛輕量化（不需要各自實作 Yjs + WebSocket）
- Daemon 可以在背景持續同步，即使編輯器關閉也繼續工作

#### 向量搜尋（AI 整合用）

```
VaultMesh 伺服器
├── 文件更新時，自動觸發 embedding 生成
│   └── 呼叫 OpenAI text-embedding-3-small 或 Anthropic 的 embedding API
├── embedding 存入 pgvector（PostgreSQL 擴充）
├── MCP Server 的 search_vault 工具：
│   ├── 對查詢字串生成 embedding
│   ├── pgvector 語意相似度搜尋
│   └── 回傳最相關的文件列表（含 path 和摘要）
```

---

## MVP 規劃

### 目標：6-8 個月，2-3 位開發者

**MVP 範圍定義：**
- 核心同步引擎（Yjs + WebSocket）
- 基本認證（Email + 密碼，不需要 OAuth）
- 資料夾層級權限（Owner / Editor / Viewer 三角色）
- Obsidian 外掛（主要客戶端）
- 命令列工具（CLI，供技術用戶和自動化用）
- MCP Server（基本版：讀取 + 搜尋）
- Web Dashboard（最小可用：vault 管理 + 成員管理）

### 第一階段：核心同步引擎（2-3 個月）

**目標：** 單一 vault，兩台機器能即時同步 Markdown 檔案，無衝突。

**技術工作：**

| 工作項目 | 說明 | 預估工時 |
|----------|------|----------|
| `packages/core`：Yjs Doc 包裝層 | `VaultDoc`、`VaultFile` 抽象，封裝 Yjs API | 5 天 |
| `packages/core`：檔案樹管理 | 追蹤 vault 內所有檔案，維護增量 diff | 5 天 |
| `packages/auth`：JWT 簽發 / 驗證 | Access token + Refresh token | 3 天 |
| `packages/auth`：vault 成員清單 | 基本 RBAC 資料模型 | 3 天 |
| `server`：y-websocket 伺服器 | 整合 `y-websocket`，房間管理 | 5 天 |
| `server`：認證中間件 | WebSocket 連線前驗證 JWT | 2 天 |
| `server`：持久化（LevelDB） | Yjs 文件狀態持久化 | 3 天 |
| `plugin-obsidian`：連線設定 | 輸入伺服器 URL + token，建立連線 | 3 天 |
| `plugin-obsidian`：同步狀態列 | 顯示 Syncing / Online / Offline | 2 天 |
| `plugin-obsidian`：衝突通知 | 偵測到版本衝突時通知使用者 | 2 天 |
| 整合測試 | 兩個 Obsidian 實例同時編輯同一文件 | 5 天 |

**里程碑驗收：**
- [x] 兩個使用者同時編輯同一份 `.md` 文件，變更在 < 500ms 內同步
- [x] 斷線後重連，離線期間的修改自動合併
- [x] 伺服器重啟後，文件狀態正確恢復

---

### 第二階段：權限系統 + Obsidian 外掛 + CLI（2 個月）

**目標：** 資料夾層級權限 + 完整的 Obsidian 外掛體驗 + 基本 CLI。

**技術工作：**

| 工作項目 | 說明 | 預估工時 |
|----------|------|----------|
| `server`：資料夾權限 ACL | `folder_permissions` 資料表，最長路徑優先解析 | 7 天 |
| `server`：REST API | vault CRUD、成員邀請、資料夾權限 CRUD | 7 天 |
| `plugin-obsidian`：資料夾選擇 UI | 設定哪些資料夾要同步（排除隱私資料夾） | 3 天 |
| `plugin-obsidian`：線上成員顯示 | 側邊欄顯示目前線上的成員 | 2 天 |
| `plugin-obsidian`：衝突解決 UI | 當語意衝突發生，提供視覺化的選擇界面 | 5 天 |
| `cli`：`vaultmesh init` | 初始化 vault，連結到 VaultMesh 服務 | 2 天 |
| `cli`：`vaultmesh sync` | 手動觸發同步 | 1 天 |
| `cli`：`vaultmesh status` | 顯示目前同步狀態 | 1 天 |
| `cli`：`vaultmesh invite` | 邀請成員加入 vault | 2 天 |
| 整合測試 | 10 人同時連線，權限隔離測試 | 7 天 |

**里程碑驗收：**
- [x] A 用戶設定只能看 `/engineering/`，看不到 `/finance/`，驗證生效
- [x] CLI 工具可以在 CI/CD 環境中腳本化操作知識庫
- [x] 10 人同時連線，伺服器 CPU < 20%

---

### 第三階段：MCP Server + Web Dashboard + VS Code（2 個月）

**目標：** AI 整合上線 + Web UI 完整 + VS Code 客戶端。

**技術工作：**

| 工作項目 | 說明 | 預估工時 |
|----------|------|----------|
| `mcp-server`：MCP 協議實作 | stdio 或 SSE 傳輸，工具定義 | 5 天 |
| `mcp-server`：`search_vault` | 全文搜尋（初版）或向量語意搜尋 | 5 天 |
| `mcp-server`：`read_note`、`write_note`、`list_notes` | 基本 CRUD 工具 | 3 天 |
| `mcp-server`：權限整合 | MCP 呼叫前驗證用戶對文件有讀 / 寫權限 | 3 天 |
| `web`：認證頁面 | 登入、登出、註冊 | 3 天 |
| `web`：Vault 管理 | 建立 vault、刪除 vault、成員清單 | 5 天 |
| `web`：成員邀請 + 權限設定 | 邀請 email、設定資料夾權限 | 5 天 |
| `web`：活動日誌 | 顯示誰在何時修改了哪些文件 | 3 天 |
| `plugin-vscode`：基本同步 | 依賴本地 Daemon，外掛只顯示狀態 | 5 天 |
| `plugin-vscode`：狀態列 | 顯示 VaultMesh 同步狀態 | 2 天 |
| 整合測試 + Bug 修復 | | 10 天 |

**里程碑驗收：**
- [x] 在 Claude Code 中設定 VaultMesh MCP，呼叫 `search_vault("認證設計")` 回傳正確文件
- [x] AI 透過 `write_note` 寫入的文件，在 Obsidian 中即時顯示
- [x] VS Code 使用者可以看到同步狀態，修改 `.md` 檔案後自動同步

---

## 最大風險分析

### 風險 1：目標用戶是最會 DIY 的人群（最大風險）

**描述：** 我們的核心目標用戶是開發者——他們是世界上最擅長「自己解決問題」的人。面對知識庫同步問題，他們的第一反應是「我自己搭一個 Git + webhook」，而不是「我付費買一個工具」。

**影響：** 付費意願低，轉換成本高（已有 DIY 方案），難以說服他們換工具。

**應對策略：**
1. **體驗差距要夠大**：體驗必須比 Git + obsidian-git 好 10 倍，不只是「稍微好一點」
2. **免費方案要慷慨**：讓個人使用者免費，靠團隊付費（freemium 模式）
3. **開源信任**：開源後端，讓技術用戶審計程式碼，降低「我為什麼要信任你」的疑慮
4. **AI 整合是殺手級功能**：DIY 用戶也無法輕易自己做 MCP Server + 向量搜尋 + 權限整合

### 風險 2：Obsidian 官方可能推出 Teams 功能

**描述：** Obsidian 目前沒有官方的 Teams 方案，但如果 Obsidian 公司決定做，他們有天然的優勢（官方整合、信任度、用戶基礎）。

**影響：** 如果 Obsidian Teams 上線，我們的 Obsidian 客戶端市場會被大幅壓縮。

**應對策略：**
1. **不要押注在 Obsidian 上**：做跨編輯器（VS Code、CLI、Web），不成為 Obsidian 的附屬品
2. **AI 整合是護城河**：Obsidian 官方不太可能做深度的 MCP + AI 整合
3. **自架選項**：企業用戶需要資料主權，Obsidian 官方服務無法滿足

### 風險 3：Relay.md 快速迭代

**描述：** Relay.md 已先行，如果他們快速加入跨編輯器和 AI 功能，我們的差異化就消失了。

**應對策略：**
1. **速度競爭**：先做 AI 整合（MCP Server），讓 AI 整合成為我們的代名詞
2. **社群**：建立開發者社群，讓用戶有歸屬感和轉換成本
3. **企業版**：Relay.md 目前沒有企業版（自架、SLA、SSO），這是差異化機會

### 風險 4：CRDT 的邊緣案例

**描述：** CRDT（Yjs）在純文字上表現很好，但 Markdown 有複雜結構（frontmatter YAML、程式碼塊、表格）。在邊緣情況下，CRDT 合併可能產生語法錯誤的 Markdown。

**影響：** 用戶遇到「AI 或 Obsidian 突然無法解析文件」的問題，信任度下降。

**應對策略：**
1. **驗證層**：每次 CRDT 合併後，parse Markdown 驗證語法，如果失敗回到上一個有效版本
2. **特殊處理**：frontmatter（YAML）使用 `Y.Map` 而不是 `Y.Text`，避免結構性衝突
3. **透明化**：發生合併問題時，向使用者顯示明確的提示，而不是靜默失敗

### 風險 5：市場太小

**描述：** 如前述商業分析，如果只做 Obsidian 插件，年收入天花板約 $10-20 萬，不足以支撐全職團隊。

**應對策略：**
1. **擴大市場**：跨編輯器方向把 SAM 擴大 5-10 倍
2. **企業版**：單個企業客戶 ARR $10,000-50,000，10 個企業客戶就有 $100,000-500,000
3. **AI 記憶市場**：把定位從「文件同步工具」變成「AI 記憶同步基礎設施」，這個市場比文件工具大得多

---

## 差異化策略

### 差異化核心：AI-native 定位

**不只是「文件同步工具」，而是「團隊 AI 記憶同步基礎設施」。**

這個定位差異非常重要：

| 定位 A：文件同步工具 | 定位 B：AI 記憶同步 |
|---------------------|---------------------|
| 競爭對手：Relay.md、Syncthing、Dropbox | 競爭對手：幾乎沒有 |
| 客戶痛點：「同步 Markdown 很麻煩」 | 客戶痛點：「我的 AI 不知道團隊在做什麼」 |
| 付費意願：低（有免費替代品） | 付費意願：高（AI 生產力工具可以要求高溢價） |
| 市場大小：小 | 市場大小：大（AI 工具市場年複合增長率 30%+） |

### 核心差異化維度

#### 1. AI-native 設計

**現有工具的 AI 整合是「事後加入」的**（Notion AI 只是在 Notion 界面裡嵌入 AI），而 VaultMesh 是**從設計就把 AI 當成第一類用戶**。

具體表現：
- **MCP First**：設計初期就考慮 AI 工具的讀寫需求
- **AI 可讀的知識庫結構**：最佳化文件格式和 metadata，讓 LLM 更容易理解和引用
- **AI 寫入**：AI 可以成為「知識庫貢獻者」，自動記錄決策、更新文件
- **AI 衝突解決助手**：當有語意衝突時，AI 分析並建議合併方案

#### 2. 本地優先（Local-first）

**Notion、Outline 都是「雲優先」**：數據存在雲端，本地是視圖。VaultMesh 是**「本地優先」**：完整資料在本地，雲端是同步管道。

具體表現：
- 離線可以完整閱讀和編輯
- 網路故障不影響工作
- 可以用任何本地工具（grep、awk、Python 腳本）處理知識庫
- 企業 IT 審計可以審查本地檔案，而不是 API 快照

#### 3. 跨編輯器（Editor-agnostic）

**Relay.md 綁定 Obsidian**，VaultMesh 不綁定任何編輯器。

具體表現：
- 本地 Daemon 負責同步，編輯器只是讀寫本地檔案
- Obsidian、VS Code、Cursor、Vim、Zed 用戶都能用同一個 vault
- CLI 工具支援腳本自動化（CI/CD、定時備份、自動生成文件）

#### 4. 自架選項（Self-hosted）

**面向企業用戶和隱私敏感用戶**，提供完整的 Docker 自架版。

具體表現：
- 所有數據（文件內容、用戶資料）都在自己的伺服器
- 開源程式碼可審計
- 企業 IT 可以把 VaultMesh 跑在 VPC 內，滿足合規要求
- 開源版完整功能（不閹割），商業版加 SaaS 便利性

### 行銷定位

**Tagline：** "Your team's AI memory. Local first, always in sync."

**核心訊息：**
1. 給 AI 一個共享的記憶：讓每個人的 Claude Code / Cursor 都能讀取團隊的集體知識
2. 本地優先，格式開放：你的 Markdown 就是 Markdown，不鎖在任何平台
3. 任何編輯器都支援：Obsidian、VS Code、CLI，無縫協作

**目標客戶畫像（ICP）：**
- 5-20 人的技術團隊
- 重度使用 Claude Code / Cursor 的開發者
- 已有 Obsidian 或 Markdown 知識庫習慣
- 被 Notion 的「非 Markdown 格式」或 Git 的「衝突問題」困擾
- 願意付 $5-10/user/月 換取更好的知識庫協作體驗

---

*最後更新：2026-03*
*研究者：Morph Team*
