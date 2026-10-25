"use client";

import { useEffect, useId, useRef } from "react";
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="min-w-0 text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow)]", className)}>{children}</section>;
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5 text-sm", className)}>
      <span className="font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

const control =
  "w-full min-w-0 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink shadow-sm outline-none transition placeholder:text-muted/70 hover:border-brand/50 focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(control, "[color-scheme:inherit]", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...propsWithoutClass } = props;
  return (
    <span className="relative block min-w-0">
      <select {...propsWithoutClass} className={cn(control, "cursor-pointer appearance-none pr-10", className)}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
    </span>
  );
}

export function Checkbox(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="relative inline-grid size-4 shrink-0 place-items-center">
      <input
        {...props}
        type="checkbox"
        className={cn("peer size-4 cursor-pointer appearance-none rounded-[5px] border border-line bg-surface shadow-sm transition checked:border-brand checked:bg-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50", props.className)}
      />
      <Check aria-hidden="true" size={12} strokeWidth={3} className="pointer-events-none absolute text-brand-ink opacity-0 peer-checked:opacity-100" />
    </span>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(control, "min-h-20 resize-y", props.className)} />;
}

export function Button({
  variant = "primary",
  busy = false,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger"; busy?: boolean }) {
  return (
    <button
      {...props}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-brand text-brand-ink hover:bg-[var(--brand-strong)]",
        variant === "ghost" && "border border-line bg-surface text-ink hover:bg-[var(--surface-sunken)]",
        variant === "danger" && "bg-danger text-brand-ink hover:brightness-95 focus-visible:ring-danger/25",
        className,
      )}
    >
      {busy ? <LoaderCircle aria-hidden="true" size={16} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () => dialog ? [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1']):not([disabled])")].filter((item) => item.getAttribute("aria-hidden") !== "true" && item.offsetParent !== null) : [];
    (focusable()[0] ?? dialog)?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key !== "Tab" || !dialog) return;
      const items = focusable();
      if (items.length === 0) { event.preventDefault(); dialog.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onMouseDown={(event) => event.stopPropagation()} className="max-h-[min(85vh,48rem)] w-full max-w-md overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow)] outline-none">
        <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
        <div className="mt-3 text-sm text-muted">{children}</div>
      </section>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-muted">{children}</p>;
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p role="alert" aria-atomic="true" className="text-sm text-danger">{children}</p>;
}

export function DataTable({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto rounded-xl border border-line bg-surface", className)}><table className="w-full min-w-[540px] text-left text-sm">{children}</table></div>;
}
