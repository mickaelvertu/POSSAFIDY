import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  active: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
}

/** Reuse the module's existing controls, permissions and confirmation forms. */
export default function NotificationActionWindow({ active, title, onClose, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!active) return;
    const element = dialog.current;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [active]);

  if (!active) return <>{children}</>;
  return (
    <dialog ref={dialog} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}
      className="m-auto max-h-[92dvh] w-[96vw] max-w-6xl overflow-y-auto rounded-2xl border border-slate-600 bg-slate-900 p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/75">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-700 bg-slate-900 p-4">
        <h2 className="text-sm font-bold">{title}</h2>
        <button type="button" autoFocus onClick={onClose} className="rounded-lg border border-slate-600 px-3 py-2 text-xs hover:bg-slate-800">Fermer</button>
      </div>
      <div className="p-4 sm:p-6 [&>section>button]:hidden">{children}</div>
    </dialog>
  );
}
