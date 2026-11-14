import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Native modal: keyboard focus stays inside and returns to its opener on close. */
export default function TreasuryDetailsDialog({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return <dialog ref={dialogRef} className="ui-modal p-3 sm:p-6" aria-labelledby={titleId} onClose={onClose} onClick={event => {
    if (event.target === event.currentTarget) dialogRef.current?.close();
  }}>
    <div className="ui-modal-box max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-4 text-slate-900 sm:p-6">
      <header className="mb-5 flex items-start justify-between gap-4">
        <h3 id={titleId} className="min-w-0 break-words text-lg font-semibold">{title}</h3>
        <button type="button" autoFocus className="ui-btn ui-btn-sm shrink-0" onClick={() => dialogRef.current?.close()}>Fermer</button>
      </header>
      <div className="space-y-4 break-words text-sm">{children}</div>
    </div>
    <form method="dialog" className="ui-modal-backdrop"><button aria-label="Fermer les détails">Fermer</button></form>
  </dialog>;
}
