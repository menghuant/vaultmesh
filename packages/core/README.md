# @vaultmesh/core

VaultMesh 共用 Yjs CRDT 同步引擎。

## 概述

所有客戶端（Obsidian 插件、VS Code、CLI）與伺服器共享的核心邏輯：

- `VaultDocument`、`SyncState`、`VaultFile` 等核心型別
- Yjs Doc 包裝與檔案樹管理
- 增量 diff 計算與 checksum 驗證
- 三方合併演算法基礎

## 使用方式

```typescript
import { VaultDocument, createSyncEngine } from '@vaultmesh/core'

const doc = new VaultDocument('my-vault-id')
const engine = createSyncEngine(doc, { serverUrl: 'ws://localhost:4444' })
await engine.connect()
```

## 開發

```bash
pnpm build     # 編譯
pnpm typecheck # 型別檢查
```
