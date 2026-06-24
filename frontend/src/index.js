import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

// v2.5.38 emergency login fix:
// Previous PWA service worker could return an invalid Response for /login on Vercel.
// This app does not need offline caching, so remove old registrations and caches.
async function unregisterLegacyServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length > 0) {
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // Ignore cleanup failures; the app must still render and login normally.
  }

  try {
    if (typeof caches !== "undefined") {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("agriwarung"))
          .map((name) => caches.delete(name)),
      );
    }
  } catch {
    // Ignore cleanup failures.
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("load", () => {
    unregisterLegacyServiceWorkers();
  });
}
