import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@vaultmesh/shared'

const DATABASE_URL = process.env.VAULTMESH_DB_URL || 'postgresql://vaultmesh:vaultmesh@localhost:5432/vaultmesh'

const queryClient = postgres(DATABASE_URL)
export const db = drizzle(queryClient, { schema })
export type Database = typeof db
