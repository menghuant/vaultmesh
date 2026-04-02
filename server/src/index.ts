import { serve } from 'bun'
import { app } from './routes.js'
import { connectionManager, handleMessage, handleClose, handlePong, startAuthTimeout, type WSData } from './ws.js'
import { log } from '@vaultmesh/shared'

const PORT = parseInt(process.env.VAULTMESH_PORT || '4000', 10)

log('info', 'server', 'starting', { port: PORT })

const server = serve({
  port: PORT,
  fetch(req, server) {
    // WebSocket upgrade
    if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const connId = connectionManager.generateId()
      const ok = server.upgrade(req, {
        data: {
          connectionId: connId,
          authenticated: false,
        } satisfies WSData,
      })
      if (ok) return undefined
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    // HTTP requests handled by Hono
    return app.fetch(req, { ip: server.requestIP(req) })
  },
  websocket: {
    maxPayloadLength: 64 * 1024, // 64KB max for control messages
    open(ws: import('bun').ServerWebSocket<WSData>) {
      log('debug', 'ws', 'connection-opened', { connectionId: ws.data.connectionId })
      startAuthTimeout(ws.data.connectionId, ws)
    },
    message(ws: import('bun').ServerWebSocket<WSData>, message) {
      handleMessage(ws, message as string | Buffer).catch((err) => {
        log('error', 'ws', 'message-handler-error', { error: String(err) })
      })
    },
    close(ws: import('bun').ServerWebSocket<WSData>) {
      handleClose(ws)
    },
    pong(ws: import('bun').ServerWebSocket<WSData>) {
      handlePong(ws)
    },
  },
})

log('info', 'server', 'started', { port: PORT, ws: true })

// Graceful shutdown
function shutdown() {
  log('info', 'server', 'shutting-down')
  connectionManager.destroy()
  server.stop()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
