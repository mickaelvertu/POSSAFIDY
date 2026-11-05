import { useEffect, useRef, useState } from "react";
import { paymentClockHint } from "../services/paymentAccess";

export default function DeviceClockNotice() {
  const [warning, setWarning] = useState("");
  const retry = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== "visible" || !navigator.onLine) return;
      checking = true;
      try {
        const hint = await paymentClockHint();
        if (active) setWarning(hint.trim());
      } finally {
        checking = false;
      }
    };
    retry.current = () => { void check(); };
    void check();
    window.addEventListener("focus", retry.current);
    window.addEventListener("online", retry.current);
    document.addEventListener("visibilitychange", retry.current);
    const interval = window.setInterval(retry.current, 300000);
    const listener = retry.current;
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", listener);
      window.removeEventListener("online", listener);
      document.removeEventListener("visibilitychange", listener);
      retry.current = () => {};
    };
  }, []);

  if (!warning) return null;
  return <aside role="alert" className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-950">
    <p>{warning}</p>
    <button type="button" onClick={() => retry.current()} className="rounded-lg border border-amber-500 px-3 py-1.5">Vérifier à nouveau</button>
  </aside>;
}
