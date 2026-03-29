# @vaultmesh/server

VaultMesh WebSocket 同步伺服器。

## 概述

基於 `y-websocket` 的即時同步後端，負責：

- 管理多個 vault 的 Yjs CRDT 文件狀態
- 廣播增量更新至所有連線用戶端
- LevelDB 持久化，確保伺服器重啟後資料不遺失
- JWT 驗證整合（透過 `@vaultmesh/auth`）

## 開發

```bash
pnpm dev       # 開發模式（tsx watch）
pnpm build     # 編譯 TypeScript
pnpm start     # 執行編譯後的伺服器
```

## 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `PORT` | `4444` | WebSocket 監聽埠 |
| `JWT_SECRET` | — | JWT 簽名金鑰（必填） |
| `LEVELDB_PATH` | `./data` | LevelDB 資料目錄 |
