# @vaultmesh/auth

VaultMesh 認證與授權模組。

## 概述

提供全棧共用的認證邏輯：

- `User`、`Session`、`VaultPermission` 型別定義
- JWT 簽發、驗證與解析（使用 `jose`）
- vault 角色模型：`owner`、`editor`、`viewer`
- 權限檢查工具函數

## 使用方式

```typescript
import { verifyToken, hasPermission } from '@vaultmesh/auth'

const payload = await verifyToken(token, secret)
if (hasPermission(payload, vaultId, 'editor')) {
  // 允許寫入操作
}
```

## 開發

```bash
pnpm build     # 編譯
pnpm typecheck # 型別檢查
```
