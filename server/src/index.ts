import { WebSocketServer } from "ws";
import type { VaultDocument } from "@vaultmesh/core";

const PORT = Number(process.env.PORT ?? 4000);

const wss = new WebSocketServer({ port: PORT });

wss.on("listening", () => {
  console.log(`VaultMesh sync server listening on ws://localhost:${PORT}`);
});

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (data) => {
    // TODO: parse protocol message, apply Yjs update, broadcast
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === 1) {
        client.send(data);
      }
    });
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});
