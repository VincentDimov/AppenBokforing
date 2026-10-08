"use client";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/** Keep searchable choices outside scrolling tables without escaping a modal's inert boundary. */
export function FloatingOptions({
  anchor,
  children
}: {
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    target: Element;
  } | null>(null);
  useEffect(() => {
    const update = () => {
      const element = anchor.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const height = Math.max(80, Math.min(224, below < 120 ? rect.top - 12 : below));
      const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 24);
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: below < 120 ? Math.max(12, rect.top - height - 4) : rect.bottom + 4,
        width,
        height,
        target: element.closest("dialog[open]") ?? document.body
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor]);
  if (!position) return null;
  return createPortal(
    <div
      className="floating-options"
      style={{
        position: "fixed",
        zIndex: 80,
        left: position.left,
        top: position.top,
        width: position.width,
        maxHeight: position.height,
        overflowY: "auto"
      }}
    >
      {children}
    </div>,
    position.target
  );
}
