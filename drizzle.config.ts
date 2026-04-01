import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './packages/shared/src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.VAULTMESH_DB_URL || 'postgresql://vaultmesh:vaultmesh@localhost:5432/vaultmesh',
  },
})
