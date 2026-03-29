# @vaultmesh/web

VaultMesh Web 管理儀表板（佔位）。

## 概述

瀏覽器管理介面，預計功能：

- vault 建立與管理
- 成員邀請與權限設定（擁有者 / 編輯者 / 檢視者）
- 即時同步狀態監控
- 文件版本歷史瀏覽
- 衝突記錄查閱

## 狀態

目前為佔位套件，將在 Phase 2 正式開發。

## 技術規劃

- React + Vite
- Tailwind CSS
- 透過 REST API 與 `@vaultmesh/server` 通訊

## 開發

```bash
pnpm dev      # 啟動 Vite 開發伺服器
pnpm build    # 建置靜態資產
```
