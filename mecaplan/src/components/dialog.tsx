"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function Dialog({
  title,
  children,
  close,
  className = "",
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null),
    closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button,a[href],input,select,textarea,[tabindex="0"]',
        ) ?? [],
      ).filter(
        (n) => !n.hasAttribute("disabled") && n.getClientRects().length > 0,
      );
    (focusable()[0] ?? ref.current)?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const nodes = focusable(),
          first = nodes[0],
          last = nodes.at(-1);
        if (!nodes.length) {
          e.preventDefault();
          ref.current?.focus();
        } else if (
          e.shiftKey &&
          (document.activeElement === first ||
            !ref.current?.contains(document.activeElement))
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !ref.current?.contains(document.activeElement))
        ) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const focus = (e: FocusEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        (focusable()[0] ?? ref.current).focus();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("focusin", focus);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener("keydown", key);
      document.removeEventListener("focusin", focus);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + className}
      >
        <header>
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={close}
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
