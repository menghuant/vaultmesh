# Morph 團隊共享 Markdown 知識庫工具研究

**研究日期：** 2026-03
**研究目的：** 評估 10 人開發團隊可用的 Markdown 知識庫同步與協作工具，需求重點為：本地 Markdown 檔案、資料夾層級權限控制、低摩擦力同步、可整合 AI 工具鏈。
**結論摘要：** 首選 **Outline（自架版）**；如需保留 Obsidian 工作流，備選 **Relay.md**；預算有限且重視 Git 流程則選 **Wiki.js**。

---

## 目錄

1. [需求定義](#需求定義)
2. [方案分析](#方案分析)
   - [方案一：Obsidian + Git](#方案一obsidian--git)
   - [方案二：Obsidian Sync（官方）](#方案二obsidian-sync官方)
   - [方案三：Obsidian + Relay.md](#方案三obsidian--relaymd)
   - [方案四：Outline](#方案四outline)
   - [方案五：BookStack](#方案五bookstack)
   - [方案六：Wiki.js](#方案六wikijs)
   - [方案七：GitBook](#方案七gitbook)
   - [方案八：Notion](#方案八notion)
3. [綜合比較表](#綜合比較表)
4. [推薦結論](#推薦結論)

---

## 需求定義

| 需求項目 | 優先級 | 說明 |
|----------|--------|------|
| Markdown 原生格式 | 必要 | 檔案需能在本地直接以文字編輯器讀寫 |
| 資料夾 / 文件層級權限 | 必要 | 不同子團隊看不同資料夾，部分文件唯讀 |
| 即時或近即時同步 | 高 | 多人編輯同一文件時減少衝突 |
| Obsidian 相容 | 高 | 現有工作流基於 Obsidian |
| 自架可能性 | 中 | 希望資料主權在自己手中 |
| AI 整合（MCP / Claude） | 中 | 未來接入 Claude Code 讓 AI 讀寫知識庫 |
| 10 人費用合理 | 中 | 月費 < $100 USD |

---

## 方案分析

### 方案一：Obsidian + Git

**（obsidian-git 外掛 + GitHub / GitLab）**

#### 同步機制

- 使用 [obsidian-git](https://github.com/denolehov/obsidian-git) 外掛，定時（預設每 5 分鐘）自動執行 `git pull` → `git add` → `git commit` → `git push`。
- 手動觸發亦可，外掛提供 Command Palette 指令。
- 底層為標準 Git 流程，遠端倉庫可放 GitHub、GitLab、Gitea（自架）或任何 Git 伺服器。
- **不支援真正的即時同步**：每次同步之間有數分鐘延遲，不適合多人同時編輯同一文件。

#### 衝突解決

- 依賴 Git 的三方合併（three-way merge）。
- 純文字 Markdown 衝突率低，但仍會出現 `<<<<<<< HEAD` 衝突標記，需手動解決。
- obsidian-git 發現衝突時會彈出通知，但沒有內建的視覺化合併工具，需用外部 diff 工具（VS Code、IntelliJ 等）。
- 二進位檔案（圖片、PDF）衝突無法自動合併，必須選擇保留哪一方。
- **沒有 CRDT 層**，因此即時協作時覆蓋風險高。

#### 權限控制

- GitHub / GitLab：倉庫層級（整個 vault 一個 repo）或多倉庫拆分。
- 資料夾層級權限原生不支援（Git 不支援子目錄級別的存取控制）。
- 可用多倉庫 + git submodule 模擬資料夾權限，但維護複雜。
- GitLab 的 Protected Branches 和 CODEOWNERS 可限制特定路徑的推送，但無法阻止讀取。
- **無法做到「A 子團隊看不到 B 子團隊的資料夾」**，除非拆成多個 repo。

#### 10 人費用

| 選項 | 月費 |
|------|------|
| GitHub Free（公開 repo） | $0 |
| GitHub Team（私有 repo） | $4/user → $40/月 |
| GitLab Free（私有，限 5 人） | $0（超過需升級） |
| GitLab Premium | $19/user → $190/月 |
| Gitea 自架 | 伺服器成本（約 $5-20/月 VPS） |

#### 優點

- **零學習曲線**：Git 是開發者熟悉的工具。
- **完整版本歷史**：每次 commit 都有完整快照，可以 `git revert`。
- **離線優先**：本地有完整副本，無網路也能工作。
- **彈性最高**：任何 Git 相容的平台都可以用。
- **與 CI/CD 整合容易**：可接入 GitHub Actions 做自動化。
- **完全自架**：Gitea / Gitogit 可完全控制資料。

#### 缺點

- **無即時協作**：多人同時編輯同一文件容易衝突，且解決麻煩。
- **無資料夾級別權限**：必須拆多個 repo 才能做到，管理複雜。
- **技術門檻**：非技術人員需要學習 Git，外掛偶爾會出現 rebase / merge 錯誤。
- **行動裝置支援差**：iOS / Android 上的 obsidian-git 不穩定。
- **衝突解決體驗差**：沒有內建的視覺化合併工具。

#### 與 Obsidian 的關係

- **深度整合**：vault 就是一個 Git repo，Obsidian 完全感知不到 Git 的存在，只讀寫本地檔案。
- obsidian-git 外掛在社群中成熟穩定，Stars 超過 11k（截至 2026-03）。
- 支援 `.obsidian/` 設定同步，可統一團隊的外掛和主題設定。

---

### 方案二：Obsidian Sync（官方）

#### 同步機制

- Obsidian 官方提供的雲端同步服務，端對端加密（E2E）。
- 近即時同步（通常在數秒內）：監聽本地檔案變更，透過 Obsidian 的雲端基礎設施推播。
- 支援版本歷史（標準版 1 個月，Plus 版 12 個月）。
- 同步範圍可設定（選擇哪些資料夾和檔案類型要同步）。

#### 衝突解決

- Obsidian Sync 使用 **last-write-wins** 策略：最後儲存的版本覆蓋前一版。
- 衝突檔案會產生 `filename (conflicted copy).md` 副本，需手動合併。
- 沒有 CRDT 或 OT 層，**不適合多人同時編輯同一文件**。

#### 權限控制

- **不支援資料夾或文件層級的權限控制**。這是本次研究的核心痛點。
- 一個 vault 只能整體共享，或不共享。
- 無法設定「A 可以看 `/engineering` 但看不到 `/finance`」。
- 每個成員只要加入同一個 vault，就能看到所有內容。
- **結論：無法滿足本次需求，直接排除。**

#### 10 人費用

| 方案 | 個人費用 | 10 人費用 |
|------|----------|-----------|
| Plus | $8/user/月（年付） | $80/月 |
| 商業版（Business，尚未公開） | - | - |

> 注意：截至 2026-03，Obsidian Sync 沒有「Team」或「Business」計畫，每個人需要獨立訂閱，且無集中的管理後台。

#### 優點

- 設定簡單，幾乎零維護。
- 端對端加密，隱私保護好。
- 官方支援，穩定性有保證。
- 版本歷史完整。

#### 缺點

- **無資料夾級別權限**（核心缺陷）。
- **無集中管理後台**：無法統一管理 10 人的 vault 成員。
- **費用偏高**：$80/月 換來的功能比 Outline 自架版少。
- **無法自架**：資料存在 Obsidian 伺服器，資料主權受限。
- **無 API**：無法整合 AI 工具鏈或自動化。

#### 與 Obsidian 的關係

- **Obsidian 官方服務**，整合最深，設定最簡單。
- 但其設計目標是「個人多裝置同步」，而非「團隊協作」。

---

### 方案三：Obsidian + Relay.md

#### 同步機制

- [Relay.md](https://relay.md) 是一個 Obsidian 外掛 + 雲端服務，專為 Obsidian vault 的**即時團隊協作**設計。
- 使用 **CRDT（Conflict-free Replicated Data Types）** 技術（底層為 Yjs），支援真正的多人即時共同編輯，類似 Google Docs 的體驗。
- 架構：本地 Obsidian 外掛 ↔ Relay.md 雲端 WebSocket 伺服器 ↔ 其他成員的本地外掛。
- 變更以增量 diff（Yjs update）傳遞，而非整份文件，頻寬效率高。
- 支援**選擇性同步**：可以設定哪些資料夾或檔案要納入共享。

#### 衝突解決

- CRDT 特性：**理論上無衝突**。兩個人同時編輯同一段文字，Yjs 的合併演算法確保雙方的修改都被保留，並以確定性的方式合併，不需要人工介入。
- 與 Git 的 last-write-wins 和 merge conflict 不同，CRDT 的合併結果是「兩個人的修改都在裡面」。
- 目前（2026-03）Relay.md 的衝突解決品質取決於 Yjs 的文字 CRDT 實作（`Y.Text`），對純文字效果好，但複雜的 Markdown 結構（表格、程式碼塊中的多行內容）可能有排版異常。

#### 權限控制

- 支援**資料夾層級的存取控制**：可以設定哪個 Workspace Member 可以存取哪些資料夾。
- 角色：Owner、Editor、Viewer（唯讀）。
- **Workspace** 概念：一個組織可以建立一個 Workspace，邀請成員，然後管理各資料夾的分享設定。
- 相比 Obsidian Sync，這是最重要的差異點。

#### 10 人費用

| 方案 | 費用 | 說明 |
|------|------|------|
| Free | $0 | 最多 3 位協作者，1 個 vault |
| Pro | $6/user/月 | 無限協作者，進階權限 |
| **10 人 Pro** | **$60/月** | 年付約 $50/月 |

#### 優點

- **CRDT 即時協作**：目前市場上唯一專為 Obsidian 設計的即時協作方案。
- **保留本地 Vault**：所有檔案仍然在本地，Obsidian 的體驗完整保留（雙向鏈結、Graph View、所有外掛）。
- **資料夾級別權限**：滿足核心需求。
- **設定簡單**：安裝外掛後幾分鐘內可以上線。
- **費用合理**：$60/月 對 10 人來說可接受。

#### 缺點

- **依賴第三方服務**：資料流過 Relay.md 的伺服器，需信任其安全性。
- **無自架選項**（截至 2026-03）：無法把伺服器跑在自己的基礎設施上。
- **外掛依賴**：如果 Relay.md 服務停止或外掛不再維護，整個協作機制失效。
- **僅限 Obsidian**：VS Code 或其他編輯器的用戶無法使用。
- **CRDT 邊緣案例**：複雜文件結構（表格、frontmatter）的合併有時會有異常。
- **服務成熟度**：相比 Notion 或 GitBook，Relay.md 是相對年輕的產品，穩定性和功能完整性有待驗證。

#### 與 Obsidian 的關係

- **為 Obsidian 量身打造**：目前沒有其他編輯器支援。
- 安裝後在 Obsidian 側邊欄可見即時線上成員，有 Google Docs 式的游標顯示（路線圖功能，截至 2026-03 部分版本已支援）。
- Obsidian 的所有功能（Graph View、Dataview、Templater、Daily Notes 等）完全不受影響。

---

### 方案四：Outline

#### 同步機制

- [Outline](https://www.getoutline.com) 是一個開源的團隊知識庫，類似 Notion 但更輕量、更注重 Markdown。
- **即時協作**：基於 **operational transformation (OT)**，多人同時編輯同一文件時會看到彼此的游標和修改（類 Google Docs）。
- 雲端版（managed）：資料存在 Outline 的伺服器。
- **自架版**：完整開源（[github.com/outline/outline](https://github.com/outline/outline)），可部署在自己的伺服器上（Docker / Kubernetes）。
- 文件以富文本格式儲存在資料庫（PostgreSQL），**不是本地 Markdown 檔案**。

#### 衝突解決

- OT 演算法處理同時編輯，**使用者層面無衝突感知**，所有修改都會被整合。
- 版本歷史完整，可以看到每一次修改的 diff 和還原。

#### 權限控制

- **Collection（集合）層級的權限控制**：這是 Outline 的核心功能之一。
- 每個 Collection 可以設定：
  - **Public**：所有成員可見
  - **Secret**：只有被邀請的成員可見
- 成員角色：Admin、Member、Viewer、Guest。
- 可以針對單一文件設定分享連結（外部訪客也可以看）。
- 支援 SAML SSO（Okta、Google Workspace 等）整合（自架版也支援）。

#### 10 人費用

| 方案 | 費用 | 說明 |
|------|------|------|
| 自架版（Community） | 伺服器成本 | 完整功能，需自己維護 |
| Cloud Free | $0 | 最多 5 人，功能有限制 |
| Cloud Pro | $10/user/月 | 10 人 → **$100/月** |
| Cloud Business | $20/user/月 | 10 人 → **$200/月** |
| **自架 + $20/月 VPS** | **~$20/月** | 最划算，完整功能 |

#### 優點

- **Collection 層級權限**：是本次研究中原生權限控制最成熟的工具之一。
- **即時協作體驗好**：OT 實作成熟，多人編輯流暢。
- **完整開源**：MIT 授權，可自架，資料主權完整。
- **匯入 / 匯出 Markdown**：文件可以匯出為 `.md`，也可以從 Notion 等工具批量匯入。
- **API 完整**：有 RESTful API，可整合 AI 工具鏈（Claude Code 透過 API 讀寫）。
- **活躍社群**：GitHub Stars 超過 27k，持續維護更新中。
- **搜尋功能強**：全文搜尋，支援中文。

#### 缺點

- **不是本地 Markdown 檔案**：文件存在資料庫，無法直接用 Obsidian 開啟本地 vault。
- **Obsidian 工作流中斷**：若團隊重度依賴 Obsidian 的 Graph View、雙向鏈結、特殊外掛，切換到 Outline 會有損失。
- **自架需要維護**：Docker 部署需要有人管理伺服器、備份、更新。
- **富文本為主**：雖然支援 Markdown 語法，但編輯器是富文本界面，不是純 Markdown 原始碼編輯。

#### 與 Obsidian 的關係

- **不相容**：Outline 是獨立的 Web 應用，不是 Obsidian 外掛，兩者無法直接整合。
- 可以透過 Outline API + 自動化腳本，將 Outline 文件同步到本地 Markdown 檔案，但這需要額外開發工作。
- 如果團隊願意放棄 Obsidian 工作流，改用 Web 界面，Outline 是最佳選擇。

---

### 方案五：BookStack

#### 同步機制

- [BookStack](https://www.bookstackapp.com) 是一個開源知識庫，以「書架 → 書 → 章節 → 頁面」的四層結構組織內容。
- **不支援即時協作**：多人同時編輯同一頁面時，後者的存檔會覆蓋前者的修改（last-write-wins），沒有合併機制。
- 有修訂歷史，可以查看每個頁面的修改紀錄並還原。
- 自架（PHP / Laravel + MySQL），Docker 部署容易。

#### 衝突解決

- **無衝突解決機制**：如果 A 和 B 同時編輯同一頁面，後存檔的版本會覆蓋先存檔的版本，且沒有警告（截至 2026-03）。
- 頁面鎖定機制：當有人正在編輯時，會顯示「此頁面正在被他人編輯」的警告，但不強制阻止。
- **不適合頻繁協作編輯的場景**。

#### 權限控制

- **四層級細粒度權限系統**（這是 BookStack 的強項）：
  - 書架（Shelf）級別
  - 書（Book）級別
  - 章節（Chapter）級別
  - 頁面（Page）級別
- 每個層級可以設定：
  - **角色**：Admin、Editor、Viewer、Public
  - 覆寫（Override）：子層級可以覆寫父層級的權限設定
- 支援自訂角色（Role-Based Access Control）。
- 支援 LDAP / SAML SSO 認證。

#### 10 人費用

| 選項 | 費用 |
|------|------|
| 自架（免費開源） | 伺服器成本（$5-20/月 VPS） |
| 無雲端服務 | 必須自架 |

#### 優點

- **免費開源**：MIT 授權，完全免費。
- **細粒度權限**：四層級結構，是所有方案中最精細的權限系統。
- **輕量易部署**：PHP 應用，資源需求低，$5/月的 VPS 就能跑。
- **Markdown 支援**：可以用 Markdown 語法編輯頁面。

#### 缺點

- **無即時協作**：Last-write-wins，多人同時編輯風險高。
- **UI 較舊**：界面設計比 Outline 和 Notion 老舊。
- **不是本地 Markdown 檔案**：內容存在 MySQL 資料庫，無法直接以 Obsidian 開啟。
- **功能相對保守**：更新速度較慢，功能比 Outline 少。
- **無法與 Obsidian 整合**。

#### 與 Obsidian 的關係

- **不相容**：BookStack 是獨立 Web 應用，與 Obsidian 無整合路徑。

---

### 方案六：Wiki.js

#### 同步機制

- [Wiki.js](https://js.wiki) 是一個現代開源 Wiki，以 Node.js 構建，支援多種儲存後端。
- **獨特功能**：可以設定 Git 作為儲存後端，讓所有文件以 `.md` 格式存在 Git 倉庫，Web UI 只是前端界面。
- 這意味著：Web 界面編輯 → 儲存到 Git repo → 可以 clone 到本地直接看 Markdown 原始檔。
- 不支援即時 CRDT 協作，但衝突由 Git merge 處理。

#### 衝突解決

- 依賴 Git 的合併機制。
- Web 界面編輯衝突會有提示，讓使用者選擇保留哪個版本。
- 不如 Outline 的 OT 協作流暢，但比 Git + obsidian-git 的體驗好一些（有 Web UI 輔助）。

#### 權限控制

- **路徑型（Path-based）權限規則**：可以設定「`/engineering/**` 只有 Engineering 角色可以讀寫」。
- 支援細緻的讀 / 寫分離設定。
- 支援本地帳號、LDAP、OAuth2（Google、GitHub）認證。
- 支援 Guest（未登入）、User、Admin 角色，以及自訂角色。

#### 10 人費用

| 選項 | 費用 |
|------|------|
| 自架（開源） | 伺服器成本（$5-20/月 VPS） |
| Wiki.js Cloud | $8/user/月 → 10 人 $80/月 |

#### 優點

- **Git 儲存後端**：可以讓 Markdown 檔案同時存在 Git repo，是最接近「本地 Markdown + Web UI」的方案。
- **路徑型權限**：靈活且強大，適合有複雜目錄結構的知識庫。
- **開源免費**：AGPL 授權，可自架。
- **Markdown 原生**：編輯器原生支援 Markdown，也支援 WYSIWYG 模式。
- **多語言支援好**：中文（繁體、簡體）支援完整。

#### 缺點

- **無即時 CRDT 協作**：同時編輯衝突仍需手動解決。
- **Git 後端設定複雜**：需要自己管理 Git remote，設定較複雜。
- **UI 一般**：比 Outline 的現代感稍差。
- **Obsidian 工作流**：雖然有 Git backend，但本地 clone 後用 Obsidian 開啟和推送到 Wiki.js 需要手動 git 操作，不如 Relay.md 無縫。

#### 與 Obsidian 的關係

- **部分相容**：如果用 Git 後端，可以把 Wiki.js 的 Git repo clone 到本地，用 Obsidian 開啟。但推送修改需要手動 git push，不是自動同步。

---

### 方案七：GitBook

#### 同步機制

- [GitBook](https://www.gitbook.com) 是一個商業知識庫服務，以現代 UI 和 Git 整合著稱。
- 支援即時協作（多人同時編輯同一文件有合併機制）。
- 可以設定 Git Sync：雙向同步 GitHub / GitLab repo 和 GitBook，讓 Markdown 檔案同時存在 Git。
- 功能完整，UI 精美，文件管理體驗好。

#### 衝突解決

- GitBook 的即時協作基於 OT，類似 Notion，衝突在使用者層面透明。
- Git Sync 模式下，合併衝突由 Git 處理。

#### 權限控制

- 支援 Space 層級和 Collection 層級的權限控制。
- 角色：Admin、Writer、Reader、Custom。
- 支援 Guest（外部訪客）共享。
- Enterprise 版支援 SSO。

#### 10 人費用

| 方案 | 費用 | 說明 |
|------|------|------|
| Free | $0 | 只有 1 個 Space，無協作 |
| Plus | $6.7/user/月（年付） | 10 人 → $67/月 |
| Pro | 約 $165-349/月（固定費用，不按人頭） | 進階功能 |
| Enterprise | 洽談 | - |

> **注意：** GitBook Pro 以上方案採用**座位制之外的固定月費**，實際上 10 人使用 Pro 方案約 $165-349/月，對小團隊而言偏貴。

#### 優點

- **功能最完整**：AI 搜尋（GitBook AI）、版本管理、API 文件自動生成、多語言支援。
- **UI 精美**：最好的閱讀體驗，適合對外發布的技術文件。
- **Git Sync**：與 GitHub 雙向同步，兼顧 Web 編輯和本地 Markdown 工作流。
- **品牌客製化**：可以掛自己的 domain。

#### 缺點

- **價格最高**：Pro 方案 $165-349/月，對 10 人內部知識庫而言很貴。
- **不可自架**：純 SaaS，無法控制資料存放位置。
- **Obsidian 整合**：Git Sync 後可以用 Obsidian 開啟本地檔案，但即時性不如 Relay.md。
- **過度設計**：對內部知識庫而言，很多功能（品牌客製化、SEO、API 文件）是多餘的。

#### 與 Obsidian 的關係

- **間接相容**：透過 Git Sync，GitBook 的文件可以 clone 到本地用 Obsidian 開啟，但不是雙向即時同步。

---

### 方案八：Notion

#### 同步機制

- [Notion](https://www.notion.so) 是目前最成熟的團隊知識庫工具，即時協作基於 OT，多人同時編輯無衝突感知。
- 完整的 Web、桌面、行動端支援。
- **重要限制**：Notion 不是原生 Markdown 工具，內容儲存在 Notion 的專有資料庫格式，匯出的 `.md` 只是近似轉換，且有損（特別是資料庫 Block、Synced Block 等複雜元件）。

#### 衝突解決

- OT 即時合併，使用者層面無衝突感知。
- 版本歷史：Plus 以上方案可以看 90 天歷史（Free 版只有 7 天）。

#### 權限控制

- **最成熟的權限控制**：支援 Page 層級的細粒度設定。
- 可以把特定頁面分享給特定人員，而不暴露給整個 Workspace。
- 角色：Full Access、Edit、Comment、View。
- 支援 Guest（外部使用者）。
- Enterprise 版支援 SAML SSO、進階審計日誌。

#### 10 人費用

| 方案 | 費用 | 說明 |
|------|------|------|
| Free | $0 | 功能受限，無版本歷史 |
| Plus | $10/user/月（年付） | 10 人 → $100/月 |
| Business | $15/user/月（年付） | 10 人 → $150/月 |
| Enterprise | 洽談 | - |

#### 優點

- **最成熟**：功能完整、穩定、UI 好、生態系豐富（大量整合）。
- **細粒度權限**：Page 層級可以精確控制誰看什麼。
- **AI 功能（Notion AI）**：內建 AI 輔助寫作和搜尋。
- **行動端好**：iOS / Android 應用成熟。
- **整合廣泛**：Slack、GitHub、Jira 等大量整合。

#### 缺點

- **非原生 Markdown**：最核心的缺點。Notion 的格式是專有的 Block 格式，`.md` 匯出品質有損，無法在 Obsidian 開啟並保留所有功能。
- **不可自架**：純 SaaS，資料存在 Notion 伺服器。
- **無 API 的本地 Markdown 整合**：Claude Code 等工具無法直接讀取本地 `.md` 檔案。
- **價格偏高**：相比 Outline 自架版，$100-150/月 明顯貴很多。
- **供應商鎖定**：遷出 Notion 需要大量轉換工作。

#### 與 Obsidian 的關係

- **不相容**：Notion 的格式和 Obsidian 的工作流不相容，兩者無法整合。

---

## 綜合比較表

| 方案 | 即時協作 | 衝突解決 | 資料夾權限 | 本地 Markdown | Obsidian 整合 | 10 人月費 | 自架 | 推薦指數 |
|------|----------|----------|------------|----------------|----------------|-----------|------|----------|
| Obsidian + Git | ✗ | Git merge（手動） | ✗（多 repo 可模擬） | ✓ | ✓（外掛） | $0-40 | ✓ | ★★★ |
| Obsidian Sync | △（近即時） | last-write-wins | **✗** | ✓ | ✓（官方） | $80 | ✗ | ★ |
| Relay.md | ✓（CRDT） | 無衝突（Yjs） | ✓（資料夾層級） | ✓ | ✓（專為 Obsidian） | $60 | ✗ | ★★★★ |
| Outline | ✓（OT） | 無衝突（OT） | ✓（Collection） | △（匯出） | ✗ | $20（自架） | ✓ | ★★★★★ |
| BookStack | ✗ | last-write-wins | ✓（四層級） | △（匯出） | ✗ | $5-20（自架） | ✓ | ★★★ |
| Wiki.js | ✗ | Git merge | ✓（路徑型） | ✓（Git 後端） | △（間接） | $5-20（自架） | ✓ | ★★★★ |
| GitBook | ✓（OT） | 無衝突（OT） | ✓（Space） | △（Git Sync） | △（間接） | $67-349 | ✗ | ★★★ |
| Notion | ✓（OT） | 無衝突（OT） | ✓（Page 層級） | **✗** | **✗** | $100-150 | ✗ | ★★ |

> 圖例：✓ 完整支援 ／ △ 部分支援 ／ ✗ 不支援

---

## 推薦結論

### 🥇 首選：Outline 自架版

**適用情境：** 團隊願意放棄 Obsidian 工作流，改用 Web 界面作為主要知識庫入口。

**理由：**
1. Collection 層級權限原生支援，滿足核心需求。
2. 即時協作（OT）體驗成熟流暢。
3. 完整開源，可自架，月費 < $20（VPS 成本）。
4. 有 RESTful API，未來接入 Claude Code 或其他 AI 工具鏈容易。
5. GitHub Stars 27k+，社群活躍，持續維護。
6. 可以匯出 Markdown，如果未來需要遷移，資料不鎖定。

**建議部署：** Docker Compose 部署在 $20/月 的 Hetzner 或 DigitalOcean VPS。

---

### 🥈 備選 A：Relay.md

**適用情境：** 團隊深度依賴 Obsidian，不願放棄本地 vault 工作流。

**理由：**
1. CRDT 即時協作，Obsidian 工作流零中斷。
2. 資料夾層級權限滿足需求。
3. $60/月 對 10 人合理。

**風險：** 依賴第三方服務，無自架選項，服務成熟度有待觀察。

---

### 🥉 備選 B：Wiki.js 自架版（Git 後端）

**適用情境：** 需要保留本地 Markdown 檔案，且有 Git 工作流偏好。

**理由：**
1. Git 後端讓 Markdown 原始檔存在 Git repo，可以 clone 到本地。
2. 路徑型權限控制靈活。
3. 完全免費自架。

**風險：** 無即時協作，衝突解決體驗差。

---

### ❌ 排除方案

| 方案 | 排除原因 |
|------|----------|
| Obsidian Sync | **無資料夾層級權限，核心需求不滿足** |
| Obsidian + Git | 無資料夾權限（需多 repo），衝突解決體驗差 |
| Notion | 非原生 Markdown，無 Obsidian 整合，費用高 |
| GitBook | 功能好但費用過高（$165-349/月），超出預算 |
| BookStack | 無即時協作，UI 老舊 |

---

*最後更新：2026-03*
*研究者：Morph Team*
