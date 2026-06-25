import { useEffect, useRef } from "react";
import { BACKEND_URL } from "@/lib/api";

// Custom hook: subscribe to WebSocket events. Auto-reconnects.
// callback(event) receives {type, payload, ts}
export function useWebSocket(callback) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let pingTimer = null;
    let closed = false;

    const wsUrl = BACKEND_URL.replace(/^http/, "ws") + "/api/ws";

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          pingTimer = setInterval(() => { try { ws.send("ping"); } catch {} }, 30000);
        };
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            cbRef.current?.(msg);
          } catch {}
        };
        ws.onclose = () => {
          if (pingTimer) clearInterval(pingTimer);
          if (!closed) reconnectTimer = setTimeout(connect, 3000);
        };
        ws.onerror = () => {};
      } catch {}
    };
    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (ws) try { ws.close(); } catch {}
    };
  }, []);
}
