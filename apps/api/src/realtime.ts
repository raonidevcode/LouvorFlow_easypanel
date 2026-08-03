import { Server } from "http";
import { WebSocket, WebSocketServer } from "ws";

type SyncEvent = {
  type: "songs:changed" | "repertoires:changed" | "users:changed" | "sync:changed";
};

var syncSocketServer: WebSocketServer | null = null;

export function attachSyncSocket(server: Server) {
  syncSocketServer = new WebSocketServer({
    path: "/sync",
    server: server
  });

  syncSocketServer.on("connection", function (socket) {
    socket.send(JSON.stringify({ type: "sync:connected" }));
  });
}

export function broadcastSyncEvent(event: SyncEvent) {
  if (!syncSocketServer) {
    return;
  }

  var payload = JSON.stringify(event);

  syncSocketServer.clients.forEach(function (client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}
