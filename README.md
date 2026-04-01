# VaultMesh

Team AI memory sync. Your AI tools read local files. VaultMesh keeps those files in sync across your team, with permissions.

Install VaultMesh, and every team member's AI (Claude, Cursor, Copilot) sees the same up-to-date knowledge base. New person joins? They get the full context instantly.

## Quick Start

**Prerequisites:** Docker, Docker Compose

```bash
# Clone and start
git clone https://github.com/vaultmesh/vaultmesh.git
cd vaultmesh
cp .env.example .env
# Edit .env: set VAULTMESH_JWT_SECRET and VAULTMESH_SERVER_URL

docker compose up -d

# Create your team (admin)
vaultmesh admin signup --server https://your-server:4000 --email admin@company.com

# Invite team members
vaultmesh admin invite --email alice@company.com --role editor --group everyone
# Share the token with Alice

# Alice joins
vaultmesh setup --token vmsh_inv_...
# Files sync to ~/VaultMesh/your-team/
```

**Important:** Your server must be reachable by all team members. Use a public IP, domain name, or VPN.

## How It Works

- **Daemon** watches your local vault folder for changes (using chokidar)
- **Server** stores files and coordinates sync between team members
- **Permissions** control who sees what, per folder, via groups
- **Conflicts** detected automatically. Last-write-wins with conflict copies saved for review

## Architecture

```
packages/shared/   — Types, schema, utils (shared by server + daemon)
server/            — Hono HTTP server + sync engine + auth + permissions
daemon/            — File watcher + sync client (Phase 1b)
```

- **Transport:** WebSocket for events, HTTP for file transfer
- **Database:** PostgreSQL (metadata, users, permissions)
- **Storage:** Disk-based file storage with content-addressable versioning
- **Auth:** JWT (jose) + argon2 password hashing

## Development

```bash
bun install
bun run test        # Run unit tests
bun run lint        # Type check

# Start server locally (needs PostgreSQL)
docker compose up db -d
bun run server/src/index.ts
```

## License

Apache 2.0
