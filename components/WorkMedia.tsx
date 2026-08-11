"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import type { Work } from "@/data/works";

/**
 * One item in the column. Videos only fetch and play once they are near the
 * viewport — the column holds a lot of footage, and the box is reserved from
 * the intrinsic size either way so the scroll measurements never shift.
 */
export default function WorkMedia({ work, priority }: { work: Work; priority: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /* React is unreliable about the muted property, and autoplay depends on it */
    el.muted = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.controls = true;
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { rootMargin: "25% 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (work.kind === "video") {
    return (
      <video
        ref={ref}
        src={work.src}
        width={work.width}
        height={work.height}
        aria-label={work.alt}
        preload="none"
        muted
        loop
        playsInline
        disablePictureInPicture
      />
    );
  }

  return (
    <Image
      src={work.src}
      alt={work.alt}
      width={work.width}
      height={work.height}
      sizes="(max-width: 700px) 100vw, 84vw"
      priority={priority}
      draggable={false}
    />
  );
}
