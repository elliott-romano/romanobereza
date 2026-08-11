"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLenis } from "./SmoothScroll";

type PopoverProps = {
  open: boolean;
  onClose: () => void;
  /** accessible name for the dialog */
  label: string;
  children: ReactNode;
};

/**
 * Shared shell for both the List and the Info panels: blurred backdrop over the
 * page, close button on the grid margin, escape / click-out to dismiss.
 */
export default function Popover({ open, onClose, label, children }: PopoverProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const lenis = useLenis();

  /* mount → next frame → fade in; fade out → unmount after the transition */
  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const id = window.setTimeout(() => setMounted(false), 320);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!mounted || !open) return;
    closeRef.current?.focus();
  }, [mounted, open]);

  useEffect(() => {
    if (!open) return;
    lenis?.stop();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      lenis?.start();
      returnFocus.current?.focus?.();
    };
  }, [open, onClose, lenis]);

  if (!mounted) return null;

  return (
    <div
      className="popover"
      data-open={visible}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        className="popover__inner grid"
        data-lenis-prevent
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="popover__close">
          <button ref={closeRef} type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="popover__body">{children}</div>
      </div>
    </div>
  );
}
