import { useEffect } from "react";

/** Download updates quietly; a browser refresh is the user's activation signal. */
export default function AppUpdateNotice() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    const cleanup: (() => void)[] = [];
    const refreshed = performance.getEntriesByType("navigation").some(entry => (entry as PerformanceNavigationTiming).type === "reload");
    const activate = () => {
      if (active && refreshed) registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
    };
    const check = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void registration?.update().catch(() => {});
    };
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(value => {
      if (!active) return;
      registration = value;
      activate();
      const found = () => {
        const worker = value.installing;
        if (!worker) return;
        const installed = () => { if (worker.state === "installed") activate(); };
        worker.addEventListener("statechange", installed);
        cleanup.push(() => worker.removeEventListener("statechange", installed));
        installed();
      };
      value.addEventListener("updatefound", found);
      cleanup.push(() => value.removeEventListener("updatefound", found));
      found();
    }).catch(error => console.warn("App update setup failed:", error));
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    const interval = window.setInterval(check, 300_000);
    return () => {
      active = false;
      cleanup.forEach(stop => stop());
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, []);
  return null;
}
