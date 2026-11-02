import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { ActionNotification } from "../services/notificationService";

interface NotificationBellProps {
  key?: string;
  userId: string;
  notifications: ActionNotification[];
  onOpen: (notification: ActionNotification) => void;
}

export default function NotificationBell({ userId, notifications, onOpen }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const storageKey = `action-alerts:${userId}`;
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(storageKey) === "on"; } catch { return false; }
  });
  const [message, setMessage] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef(new Set<string>());
  const desktopAlerts = useRef(new Set<Notification>());
  const openModule = useRef(onOpen);
  openModule.current = onOpen;

  const chime = () => {
    const context = audio.current;
    if (!context || context.state !== "running") return;
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.setValueAtTime(1175, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.4);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.4);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  };

  useEffect(() => {
    const unlock = () => {
      if (enabled && typeof AudioContext !== "undefined") {
        audio.current ??= new AudioContext();
        void audio.current.resume().catch(() => {});
      }
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [enabled]);

  useEffect(() => () => {
    void audio.current?.close().catch(() => {});
    desktopAlerts.current.forEach(alert => alert.close());
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistration().then(async registration => {
        const alerts = await registration?.getNotifications({ tag: `actions:${userId}` });
        alerts?.forEach(alert => alert.close());
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const receive = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === "action-notification" && data.userId === userId
        && notifications.some(item => item.id === data.id && item.module === data.module)) {
        const item = notifications.find(item => item.id === data.id && item.module === data.module);
        if (item) openModule.current(item);
      }
    };
    navigator.serviceWorker.addEventListener("message", receive);
    return () => navigator.serviceWorker.removeEventListener("message", receive);
  }, [userId, notifications]);

  useEffect(() => {
    if (!enabled) return;
    const fresh = notifications.filter(item => !seen.current.has(item.id));
    if (!fresh.length) return;
    fresh.forEach(item => seen.current.add(item.id));
    chime();
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const item = fresh[0];
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      void navigator.serviceWorker.getRegistration().then(async registration => {
        if (!registration?.active) return;
        await registration.showNotification(fresh.length > 1 ? `${fresh.length} actions en attente` : item.title, {
          body: item.detail, tag: `actions:${userId}`, silent: audio.current?.state === "running",
          data: { type: "action-notification", userId, id: item.id, module: item.module },
        });
      }).catch(() => {});
      return;
    }
    try {
      const alert = new Notification(fresh.length > 1 ? `${fresh.length} actions en attente` : item.title, {
        body: fresh.length > 1 ? fresh.slice(0, 3).map(entry => entry.title).join("\n") : item.detail,
        tag: `actions:${userId}`, silent: true,
      });
      desktopAlerts.current.add(alert);
      alert.onclose = () => desktopAlerts.current.delete(alert);
      alert.onclick = () => { window.focus(); openModule.current(item); alert.close(); };
    } catch {
      // Some mobile browsers only support service-worker notifications.
    }
  }, [enabled, notifications, userId]);

  useEffect(() => {
    const active = new Set(notifications.map(item => item.id));
    desktopAlerts.current.forEach(alert => {
      if (active.size === 0) alert.close();
    });
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistration().then(async registration => {
        const alerts = await registration?.getNotifications({ tag: `actions:${userId}` });
        alerts?.forEach(alert => {
          if (!enabled || !active.has(alert.data?.id)) alert.close();
        });
      }).catch(() => {});
    }
  }, [notifications, enabled, userId]);

  const toggleAlerts = async () => {
    const next = !enabled;
    if (next) {
      // Request permission directly from the click, before awaiting audio setup.
      const permissionRequest = "Notification" in window
        ? Notification.requestPermission().catch(() => "denied" as NotificationPermission)
        : undefined;
      try {
        audio.current ??= new AudioContext();
        await audio.current.resume();
        chime();
      } catch { setMessage("Son indisponible sur cet appareil."); }
      if ("Notification" in window) {
        try {
          const permission = await permissionRequest;
          if (permission !== "granted") setMessage("Notifications système bloquées. Les alertes restent visibles ici.");
        } catch { setMessage("Notifications système indisponibles. Les alertes restent visibles ici."); }
      } else setMessage("Notifications système indisponibles. Les alertes restent visibles ici.");
    } else {
      desktopAlerts.current.forEach(alert => alert.close());
      setMessage("");
    }
    try { localStorage.setItem(storageKey, next ? "on" : "off"); } catch { /* Session-only preference. */ }
    setEnabled(next);
  };

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-label={`Notifications (${notifications.length})`}
        aria-expanded={open}
        title="Actions en attente"
        className="relative rounded-lg border border-slate-600 bg-slate-800 p-2 text-slate-200 transition hover:bg-slate-700"
      >
        <Bell className="h-4 w-4" />
        {notifications.length > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {notifications.length > 99 ? "99+" : notifications.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 max-h-96 overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 shadow-xl z-40">
          <div className="border-b border-slate-700 p-3">
            <button type="button" onClick={() => void toggleAlerts()} aria-pressed={enabled} className="text-xs font-semibold text-blue-300 hover:text-blue-200">
              {enabled ? "Désactiver les alertes sonores" : "Activer les alertes sonores"}
            </button>
            <p className="mt-1 text-[11px] text-slate-400">Alertes lorsque l’application est ouverte. Touchez une notification pour afficher les actions.</p>
            {message && <p role="status" className="mt-1 text-[11px] text-amber-300">{message}</p>}
          </div>
          {notifications.length === 0 ? (
            <p className="p-4 text-center text-xs text-slate-400">Aucune action en attente.</p>
          ) : (
            <ul className="divide-y divide-slate-700">
              {notifications.map(item => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); onOpen(item); }}
                    className="block w-full px-4 py-3 text-left hover:bg-slate-700"
                  >
                    <span className="block text-xs font-semibold text-white">{item.title}</span>
                    <span className="block text-[11px] text-slate-400">{item.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
