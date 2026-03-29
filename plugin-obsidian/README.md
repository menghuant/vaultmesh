# @vaultmesh/plugin-obsidian

VaultMesh Obsidian 插件 — 讓 Obsidian vault 加入團隊同步。

## 概述

- 透過 WebSocket 連接 VaultMesh 伺服器
- 基於 Yjs CRDT 的無衝突即時同步
- 狀態列顯示同步狀態（已連線 / 同步中 / 離線）
- 離線佇列：離線時的變更在重新連線後自動合併

## 安裝（開發）

```bash
pnpm build
# 將 dist/ 內容複製至 Obsidian vault 的 .obsidian/plugins/vaultmesh/
```

## 設定

在 Obsidian 插件設定中填入：

- **Server URL**：VaultMesh 伺服器 WebSocket 地址（例如 `ws://localhost:4444`）
- **Vault ID**：知識庫唯一識別碼
- **Token**：從伺服器或 Web 儀表板取得的 JWT
