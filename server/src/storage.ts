import { mkdir, writeFile, readFile, unlink, stat, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { sha256, log } from '@vaultmesh/shared'

const STORAGE_PATH = process.env.VAULTMESH_STORAGE_PATH || './data'

function tenantFilePath(tenantId: string, filePath: string): string {
  // Prevent path traversal
  const normalized = filePath.replace(/\.\./g, '').replace(/\/+/g, '/')
  return join(STORAGE_PATH, tenantId, 'files', normalized)
}

function tenantVersionPath(tenantId: string, contentHash: string): string {
  return join(STORAGE_PATH, tenantId, '.versions', contentHash)
}

export async function storeFile(tenantId: string, filePath: string, content: Buffer): Promise<string> {
  const contentHash = sha256(content)

  // Store content-addressable version
  const versionPath = tenantVersionPath(tenantId, contentHash)
  await mkdir(dirname(versionPath), { recursive: true })
  if (!existsSync(versionPath)) {
    await writeFile(versionPath, content)
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
  // Basic check: try to write a small file
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
