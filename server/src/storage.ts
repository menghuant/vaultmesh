import { mkdir, writeFile, readFile, unlink, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { sha256, log, AppError, ErrorCode } from '@vaultmesh/shared'

const STORAGE_PATH = process.env.VAULTMESH_STORAGE_PATH || './data'

function tenantFilePath(tenantId: string, filePath: string): string {
  const tenantDir = join(STORAGE_PATH, tenantId, 'files')
  const resolved = join(tenantDir, filePath)
  if (!resolved.startsWith(tenantDir + '/') && resolved !== tenantDir) {
    throw new Error(`Path traversal blocked: ${filePath}`)
  }
  return resolved
}

function tenantVersionPath(tenantId: string, contentHash: string): string {
  if (!/^[a-f0-9]{64}$/.test(contentHash)) {
    throw new Error(`Invalid content hash: ${contentHash}`)
  }
  return join(STORAGE_PATH, tenantId, '.versions', contentHash)
}

export async function storeFile(tenantId: string, filePath: string, content: Buffer): Promise<string> {
  const contentHash = sha256(content)

  // #24: Check disk space before writing
  const hasSpace = await checkDiskSpace()
  if (!hasSpace) {
    throw new AppError(ErrorCode.STORAGE_ERROR, 'Insufficient disk space', 507)
  }

  // Store content-addressable version
  // #16: Use wx flag (exclusive create) instead of existsSync
  const versionPath = tenantVersionPath(tenantId, contentHash)
  await mkdir(dirname(versionPath), { recursive: true })
  try {
    await writeFile(versionPath, content, { flag: 'wx' })
  } catch (err: any) {
    if (err.code !== 'EEXIST') throw err
    // Already exists (content-addressable dedup), fine
  }

  // Store current file
  const fullPath = tenantFilePath(tenantId, filePath)
  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, content)

  log('debug', 'storage', 'file-stored', { tenantId, filePath, contentHash, sizeBytes: content.length })
  return contentHash
}

export async function readStoredFile(tenantId: string, filePath: string): Promise<Buffer> {
  const fullPath = tenantFilePath(tenantId, filePath)
  return readFile(fullPath)
}

export async function readVersion(tenantId: string, contentHash: string): Promise<Buffer> {
  const versionPath = tenantVersionPath(tenantId, contentHash)
  return readFile(versionPath)
}

export async function deleteStoredFile(tenantId: string, filePath: string): Promise<void> {
  const fullPath = tenantFilePath(tenantId, filePath)
  try {
    await unlink(fullPath)
    log('debug', 'storage', 'file-deleted', { tenantId, filePath })
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err
  }
}

// #15: Delete version blob from disk (after DB version record is removed)
export async function deleteVersionBlob(tenantId: string, contentHash: string): Promise<void> {
  const versionPath = tenantVersionPath(tenantId, contentHash)
  try {
    await unlink(versionPath)
    log('debug', 'storage', 'version-blob-deleted', { tenantId, contentHash })
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err
  }
}

export async function getStoredFileSize(tenantId: string, filePath: string): Promise<number | null> {
  const fullPath = tenantFilePath(tenantId, filePath)
  try {
    const s = await stat(fullPath)
    return s.size
  } catch {
    return null
  }
}

export async function ensureStorageDir(tenantId: string): Promise<void> {
  await mkdir(join(STORAGE_PATH, tenantId, 'files'), { recursive: true })
  await mkdir(join(STORAGE_PATH, tenantId, '.versions'), { recursive: true })
}

export async function checkDiskSpace(): Promise<boolean> {
  try {
    const testPath = join(STORAGE_PATH, '.disk-check')
    await mkdir(STORAGE_PATH, { recursive: true })
    await writeFile(testPath, 'ok')
    await unlink(testPath)
    return true
  } catch {
    return false
  }
}
