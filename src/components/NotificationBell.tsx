import { useEffect, useRef, useState } from "react";
import * as Sheet from "@radix-ui/react-dialog";
import { Bell, X } from "lucide-react";
import { ActionNotification } from "../services/notificationService";

interface NotificationBellProps {
  key?: string;
  userId: string;
  notifications: ActionNotification[];
  onOpen: (notification: ActionNotification) => void;
}

export default function NotificationBell({ userId, notifications, onOpen }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
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

  return (
    <Sheet.Root open={open} onOpenChange={setOpen}>
      <Sheet.Trigger
        type="button"
        aria-label={`Notifications (${notifications.length})`}
        aria-expanded={open}
        title="Actions en attente"
        className="relative inline-grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mobile-accent"
      >
        <Bell className="h-4 w-4" />
        {notifications.length > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {notifications.length > 99 ? "99+" : notifications.length}
          </span>
        )}
      </Sheet.Trigger>
      <Sheet.Portal>
        <Sheet.Overlay className="fixed inset-0 z-[55] bg-slate-950/60" />
        <Sheet.Content className="mobile-surface fixed inset-x-0 bottom-0 z-[56] flex max-h-[85dvh] flex-col rounded-t-2xl border border-mobile-border bg-mobile-panel pb-[env(safe-area-inset-bottom)] text-mobile-ink shadow-xl lg:inset-y-0 lg:left-auto lg:max-h-none lg:w-full lg:max-w-md lg:rounded-none">
          <div className="border-b border-mobile-border px-4 pb-4 pt-2 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <Sheet.Title className="text-lg font-semibold">Notifications</Sheet.Title>
              <Sheet.Close aria-label="Fermer les notifications" className="ui-btn ui-btn-ghost ui-btn-square min-h-11 min-w-11">
                <X className="size-5" aria-hidden="true" />
              </Sheet.Close>
            </div>
            <button type="button" onClick={() => void toggleAlerts()} aria-pressed={enabled} className="ui-btn ui-btn-outline min-h-11">
              {enabled ? "Désactiver les alertes sonores" : "Activer les alertes sonores"}
            </button>
            <Sheet.Description className="mt-2 text-sm text-mobile-ink/75">Touchez une notification pour ouvrir l’action correspondante.</Sheet.Description>
            {message && <p role="status" className="mt-2 text-sm text-mobile-ink">{message}</p>}
          </div>
          {notifications.length === 0 ? (
            <p className="p-4 text-sm text-mobile-ink/75 sm:px-6">Aucune action en attente.</p>
          ) : (
            <ul className="min-h-0 overflow-y-auto divide-y divide-mobile-border">
              {notifications.map(item => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); onOpen(item); }}
                    className="block min-h-11 w-full break-words px-4 py-3 text-left hover:bg-mobile-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mobile-accent sm:px-6"
                  >
                    <span className="block text-sm font-semibold">{item.title}</span>
                    <span className="mt-0.5 block text-sm text-mobile-ink/75">{item.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Sheet.Content>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
