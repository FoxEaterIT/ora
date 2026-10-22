"use client";

import { useState } from "react";
import { Button, Modal } from "@/components/ui";

export function ConfirmModal({ title, message, confirmLabel, cancelLabel, danger = false, onConfirm, onCancel }: { title: string; message: string; confirmLabel: string; cancelLabel: string; danger?: boolean; onConfirm: () => void | Promise<void>; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  }
  return <Modal title={title} onClose={() => { if (!busy) onCancel(); }}><p>{message}</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={onCancel}>{cancelLabel}</Button><Button variant={danger ? "danger" : "primary"} disabled={busy} onClick={() => void confirm()}>{confirmLabel}</Button></div></Modal>;
}
