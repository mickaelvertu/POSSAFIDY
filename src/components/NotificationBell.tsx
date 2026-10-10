import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { ActionNotification, NotificationModule } from "../services/notificationService";

interface NotificationBellProps {
  notifications: ActionNotification[];
  onOpen: (module: NotificationModule) => void;
}

export default function NotificationBell({ notifications, onOpen }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
          {notifications.length === 0 ? (
            <p className="p-4 text-center text-xs text-slate-400">Aucune action en attente.</p>
          ) : (
            <ul className="divide-y divide-slate-700">
              {notifications.map(item => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); onOpen(item.module); }}
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
