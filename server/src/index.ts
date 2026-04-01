import { serve } from 'bun'
import { app } from './routes.js'
import { log } from '@vaultmesh/shared'

const PORT = parseInt(process.env.VAULTMESH_PORT || '4000', 10)

log('info', 'server', 'starting', { port: PORT })

serve({
  fetch: app.fetch,
  port: PORT,
})

log('info', 'server', 'started', { port: PORT })
