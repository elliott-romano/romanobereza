"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const LenisContext = createContext<Lenis | null>(null);

export function useLenis() {
  return useContext(LenisContext);
}

export default function SmoothScroll({ children }: { children: ReactNode }) {
  const [lenis, setLenis] = useState<Lenis | null>(null);
  const frame = useRef<number>(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const instance = new Lenis({
      duration: 1.1,
      lerp: reduced ? 1 : 0.09,
      smoothWheel: !reduced,
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
      /*
        The column loops. Lenis keeps an unbounded internal scroll and writes
        modulo(scroll, limit) to the page, so momentum carries straight through
        the seam. `lenis.scroll` is therefore already folded into [0, limit) —
        and Site sizes the document so that limit is exactly one cycle.
      */
      infinite: true,
    });

    setLenis(instance);

    const raf = (time: number) => {
      instance.raf(time);
      frame.current = requestAnimationFrame(raf);
    };
    frame.current = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame.current);
      instance.destroy();
      setLenis(null);
    };
  }, []);

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>;
}
