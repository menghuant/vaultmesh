import { readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const DEFAULT_IGNORES = [
  '.DS_Store',
  '*.swp',
  '*.tmp',
  '.git/',
  '.obsidian/workspace.json',
  'node_modules/',
  '.vaultmesh/',
  '*.lock',
  'Thumbs.db',
]

/**
 * Simple gitignore-style pattern matcher.
 * Supports: *, **, ?, leading /, trailing /, negation (!), comments (#)
 */
export class IgnoreFilter {
  private patterns: { pattern: string; negated: boolean; dirOnly: boolean; regex: RegExp }[] = []

  constructor(rules: string[] = []) {
    for (const rule of rules) {
      this.addPattern(rule)
    }
  }

  addPattern(raw: string): void {
    let line = raw.trim()
    if (!line || line.startsWith('#')) return

    let negated = false
    if (line.startsWith('!')) {
      negated = true
      line = line.slice(1)
    }

    const dirOnly = line.endsWith('/')
    if (dirOnly) line = line.slice(0, -1)

    // Remove leading slash (anchored pattern)
    if (line.startsWith('/')) line = line.slice(1)

    const regex = globToRegex(line)
    this.patterns.push({ pattern: raw, negated, dirOnly, regex })
  }

  isIgnored(filePath: string, isDir = false): boolean {
    // Normalize to forward slashes
    const normalized = filePath.replace(/\\/g, '/')
    const basename = normalized.split('/').pop()!
    let ignored = false

    for (const { negated, dirOnly, regex, pattern } of this.patterns) {
      // For dirOnly patterns: match the directory name OR any path under it
      // This ensures .git/ matches both ".git" (the dir) and ".git/config" (files inside)
      if (dirOnly) {
        // Get the effective pattern name (without trailing /)
        const dirName = pattern.replace(/^!/, '').replace(/\/$/, '').replace(/^\//, '')
        if (isDir && (regex.test(normalized) || regex.test(basename))) {
          ignored = !negated
        } else if (normalized === dirName || normalized.startsWith(dirName + '/') ||
                   basename === dirName || normalized.includes('/' + dirName + '/')) {
          ignored = !negated
        }
        continue
      }
      if (regex.test(normalized) || regex.test(basename)) {
        ignored = !negated
      }
    }

    return ignored
  }
}

function globToRegex(glob: string): RegExp {
  let regex = ''
  let i = 0

  while (i < glob.length) {
    const c = glob[i]!
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // ** matches any path segment
        if (glob[i + 2] === '/') {
          regex += '(?:.+/)?'
          i += 3
        } else {
          regex += '.*'
          i += 2
        }
      } else {
        regex += '[^/]*'
        i++
      }
    } else if (c === '?') {
      regex += '[^/]'
      i++
    } else if (c === '[') {
      // Character class
      const end = glob.indexOf(']', i + 1)
      if (end === -1) {
        regex += '\\['
        i++
      } else {
        regex += glob.slice(i, end + 1)
        i = end + 1
      }
    } else if ('.+^${}()|\\'.includes(c)) {
      regex += '\\' + c
      i++
    } else {
      regex += c
      i++
    }
  }

  return new RegExp(`^${regex}$`)
}

export async function loadIgnoreFilter(vaultPath: string): Promise<IgnoreFilter> {
  const filter = new IgnoreFilter(DEFAULT_IGNORES)

  try {
    const ignoreFile = join(vaultPath, '.vaultmeshignore')
    const content = await readFile(ignoreFile, 'utf-8')
    for (const line of content.split('\n')) {
      filter.addPattern(line)
    }
  } catch {
    // No .vaultmeshignore file, use defaults only
  }

  return filter
}

/** Get the relative path from vault root, normalized with forward slashes */
export function getRelativePath(vaultPath: string, filePath: string): string {
  return relative(vaultPath, filePath).split(sep).join('/')
}
