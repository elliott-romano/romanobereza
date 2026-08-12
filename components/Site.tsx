"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { INFO_TEXT } from "@/data/info";
import { WORKS } from "@/data/works";
import Popover from "./Popover";
import { useLenis } from "./SmoothScroll";
import WorkMedia from "./WorkMedia";

type Panel = "list" | "info" | null;

/** breathing room between the wordmark and the rule that joins the corners */
const RULE_INSET = 14;

/*
  The column is rendered twice. Lenis wraps scroll at its `limit`
  (scrollHeight - viewport), so <main> is clipped to exactly one cycle plus one
  viewport: that makes limit === one cycle, and the duplicate supplies the
  screenful of content the wrap lands on. See measure().
*/
const CYCLES = 2;
const ORIGIN = 0;

const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const readPx = (styles: CSSStyleDeclaration, name: string, fallback: number) => {
  const value = parseFloat(styles.getPropertyValue(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

/**
 * Ink box of the en dash, relative to its own layout box, at the given font.
 * The rule is drawn to these numbers at rest, so it *is* the dash rather than
 * something that has to be swapped in for it.
 */
const measureDash = (el: HTMLElement, advance: number, boxHeight: number) => {
  const fallback = { left: advance * 0.08, width: advance * 0.84, centre: boxHeight * 0.42, weight: 1 };

  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return fallback;

  const styles = getComputedStyle(el);
  ctx.font = `${styles.fontSize} ${styles.fontFamily}`;
  const m = ctx.measureText("–");

  const width = m.actualBoundingBoxRight + m.actualBoundingBoxLeft;
  const weight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  if (!(width > 0) || !(weight > 0)) return fallback;

  /* where the baseline sits inside the line box, then the ink centre off that */
  const baseline =
    (boxHeight - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 +
    m.fontBoundingBoxAscent;

  return {
    left: -m.actualBoundingBoxLeft,
    width,
    centre:
      baseline + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2,
    weight,
  };
};

export default function Site() {
  const lenis = useLenis();

  const romanoRef = useRef<HTMLSpanElement>(null);
  const dashRef = useRef<HTMLSpanElement>(null);
  const berezaRef = useRef<HTMLSpanElement>(null);
  const ruleRef = useRef<HTMLSpanElement>(null);
  const centreRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const worksRef = useRef<HTMLDivElement>(null);
  const figureRefs = useRef<(HTMLElement | null)[]>([]);

  /* layout constants, recomputed on resize — never read during a scroll frame */
  const metrics = useRef({
    scale: 1,
    /* per-part offsets from the corner rest state to the centred wordmark */
    dx: [0, 0, 0],
    dy: [0, 0, 0],
    restLeft: [0, 0, 0],
    restTop: [0, 0, 0],
    widths: [0, 0, 0],
    dash: { left: 0, width: 0, centre: 0, weight: 1 },
    tops: [] as number[],
    split: 1,
    /** height of one cycle — the distance Lenis wraps scroll by */
    loop: 0,
  });

  const activeRef = useRef<number | null>(null);
  const lenisRef = useRef(lenis);
  lenisRef.current = lenis;
  const [active, setActive] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);

  /* ---------------------------------------------------------------- paint */

  /*
    Only the split animates here. The chrome is pinned by CSS sticky, so nothing
    in this function has to keep pace with the scroll position — which is what
    makes it safe on touch, where scroll events trail the compositor.
  */
  const paint = useCallback((progress: number) => {
    const m = metrics.current;
    const { scale, dx, dy } = m;
    const parts = [romanoRef.current, dashRef.current, berezaRef.current];
    const rest = 1 - progress;
    const s = 1 + (scale - 1) * rest;

    for (let i = 0; i < parts.length; i++) {
      const el = parts[i];
      if (!el) continue;
      el.style.transform = `translate(${dx[i] * rest}px, ${dy[i] * rest}px) scale(${s})`;
    }

    /*
      The rule is the en dash. At rest it is drawn to the glyph's exact ink box;
      as the wordmark parts it stretches across the gap and thins to a hairline,
      so there is never a handoff between two marks.
    */
    if (ruleRef.current) {
      const romanoRight = m.restLeft[0] + dx[0] * rest + m.widths[0] * s;
      const berezaLeft = m.restLeft[2] + dx[2] * rest;

      const head = m.dash.left * s;
      const tail = (m.widths[1] - m.dash.left - m.dash.width) * s;
      const x = romanoRight + head + (RULE_INSET - head) * progress;
      const end = berezaLeft - (tail + (RULE_INSET - tail) * progress);

      const weight = 1 + (m.dash.weight * s - 1) * rest;
      const y = m.restTop[1] + dy[1] * rest + m.dash.centre * s - weight / 2;

      ruleRef.current.style.transform =
        `translate(${x}px, ${y}px) scale(${Math.max(0, end - x)}, ${weight})`;
    }

    if (centreRef.current) {
      centreRef.current.style.opacity = String(smoothstep(0.55, 1, progress));
    }
  }, []);

  /* -------------------------------------------------------------- measure */

  const measure = useCallback(() => {
    const romano = romanoRef.current;
    const dash = dashRef.current;
    const bereza = berezaRef.current;
    if (!romano || !dash || !bereza) return;

    const parts = [romano, dash, bereza];

    /* read the untransformed rest layout — the corner state */
    const previous = parts.map((el) => el.style.transform);
    parts.forEach((el) => {
      el.style.transform = "none";
    });
    /* the sticky layer is pinned to the viewport, so these are stable */
    const rects = parts.map((el) => el.getBoundingClientRect());

    const rootStyles = getComputedStyle(document.documentElement);
    const display = readPx(rootStyles, "--type-display", 44);
    const secondary = readPx(rootStyles, "--type-secondary", 26);
    const scale = display / secondary;

    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;

    /* where each part lands when the wordmark is set at 44px in the centre */
    const total = (rects[0].width + rects[1].width + rects[2].width) * scale;
    const lefts = [
      (vw - total) / 2,
      (vw - total) / 2 + rects[0].width * scale,
      (vw - total) / 2 + (rects[0].width + rects[1].width) * scale,
    ];
    const centred = vh / 2 - (rects[0].height * scale) / 2;

    metrics.current.scale = scale;
    metrics.current.dx = lefts.map((left, i) => left - rects[i].left);
    metrics.current.dy = rects.map((rect) => centred - rect.top);
    metrics.current.restLeft = rects.map((rect) => rect.left);
    metrics.current.restTop = rects.map((rect) => rect.top);
    metrics.current.widths = rects.map((rect) => rect.width);
    metrics.current.dash = measureDash(dash, rects[1].width, rects[1].height);

    parts.forEach((el, i) => {
      el.style.transform = previous[i];
    });

    /* document offsets of every image, so scroll frames stay read-free */
    const scrollY = window.scrollY;
    metrics.current.tops = figureRefs.current.map((el) =>
      el ? el.getBoundingClientRect().top + scrollY : Number.POSITIVE_INFINITY,
    );

    /* the split completes exactly as the first image reaches the centre line */
    metrics.current.split = Math.max(1, (metrics.current.tops[0] ?? vh) - vh / 2);

    /*
      Size the document to one cycle plus one viewport, so Lenis's wrap point
      (scrollHeight - viewport) lands exactly on the cycle boundary and the
      duplicate column below covers the screen the wrap arrives at.
    */
    const tops = metrics.current.tops;
    const cycle = (tops[WORKS.length] ?? 0) - (tops[0] ?? 0);
    metrics.current.loop = cycle > vh ? cycle : 0;

    if (mainRef.current) {
      mainRef.current.style.height =
        metrics.current.loop > 0 ? `${metrics.current.loop + vh}px` : "";
    }
  }, []);

  /* --------------------------------------------------------------- update */

  /**
   * Carry the loop across the seam when the browser is doing the scrolling.
   *
   * Lenis only wraps scroll it drives itself (the wheel). Touch scrolling is
   * native, and the browser clamps it at the document end — so without this the
   * column dead-ends on a phone. Content at 0 and at the limit is identical, so
   * the hop is invisible.
   */
  const hopSeam = useCallback(() => {
    const lenis = lenisRef.current;
    if (metrics.current.loop <= 0) return;
    if (lenis?.isScrolling === "smooth") return; // Lenis wraps this itself

    const max = document.documentElement.scrollHeight - window.innerHeight;
    const y = window.scrollY;
    const heading = lenis?.direction ?? Math.sign(lenis?.velocity ?? 0);
    if (max <= 0 || heading === 0) return;

    const to = heading > 0 && y >= max - 2 ? 1 : heading < 0 && y <= 2 ? max - 1 : null;
    if (to === null) return;

    if (lenis) lenis.animatedScroll = lenis.targetScroll = to;
    window.scrollTo({ top: to, behavior: "instant" });
  }, []);

  const update = useCallback(
    (y: number) => {
      const { tops, split, loop } = metrics.current;
      hopSeam();

      /*
        Within a cycle the wordmark splits on the way in and reassembles on the
        way out, so it is centred at both edges of the loop and the seam reads
        as continuous rather than snapping back.
      */
      const progress =
        loop > 0
          ? y <= split
            ? y / split
            : y >= loop - split
              ? (loop - y) / split
              : 1
          : y / split;

      paint(clamp(progress, 0, 1));

      const centre = y + window.innerHeight / 2;
      let next: number | null = null;
      for (let i = 0; i < tops.length; i++) {
        if (tops[i] <= centre) next = i % WORKS.length;
        else break;
      }

      if (next !== activeRef.current) {
        activeRef.current = next;
        setActive(next);
      }
    },
    [paint, hopSeam],
  );

  /* ---------------------------------------------------------------- wiring */

  useLayoutEffect(() => {
    /* a restored scroll position means nothing once the column repeats */
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, behavior: "instant" });

    measure();
    update(window.scrollY);
    setReady(true);
  }, [measure, update]);

  useEffect(() => {
    const remeasure = () => {
      measure();
      update(lenis?.scroll ?? window.scrollY);
    };

    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);

    const observer = new ResizeObserver(remeasure);
    if (worksRef.current) observer.observe(worksRef.current);

    document.fonts?.ready.then(remeasure).catch(() => {});

    return () => {
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("orientationchange", remeasure);
      observer.disconnect();
    };
  }, [measure, update, lenis]);

  useEffect(() => {
    document.body.dataset.panel = panel === null ? "closed" : "open";
  }, [panel]);

  useEffect(() => {
    if (!lenis) {
      const onScroll = () => update(window.scrollY);
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }

    const onScroll = ({ scroll }: { scroll: number }) => update(scroll);
    lenis.on("scroll", onScroll);
    update(lenis.scroll);
    return () => {
      lenis.off("scroll", onScroll);
    };
  }, [lenis, update]);

  /* ----------------------------------------------------------------- jump */

  const goTo = useCallback(
    (slug: string) => {
      setPanel(null);
      window.setTimeout(() => {
        const target = document.getElementById(slug);
        if (!target) return;

        /*
          Resolve to a number ourselves: in infinite mode Lenis normalises its
          own scroll before working out the short way round, which an
          element-relative target would be measured against inconsistently.
        */
        const top =
          target.getBoundingClientRect().top +
          window.scrollY -
          window.innerHeight / 2 +
          8;

        if (lenis) lenis.scrollTo(top, { duration: 1.2 });
        else window.scrollTo({ top, behavior: "smooth" });
      }, 60);
    },
    [lenis],
  );

  /* ------------------------------------------------------------------ jsx */

  return (
    <>
      <main ref={mainRef} inert={panel !== null}>
        {/* one sticky, blended layer — see the note in globals.css */}
        <div className="chrome" data-ready={ready}>
          <h1 className="chrome__top">
            <span className="wordmark">
              <span className="name" ref={romanoRef}>
                Romano
              </span>
              <span className="name name--dash" ref={dashRef} aria-hidden="true">
                –
              </span>
            </span>
            <span className="name" ref={berezaRef}>
              Bereza
            </span>
          </h1>

          <span className="rule" ref={ruleRef} aria-hidden="true" />

          <div className="centre" ref={centreRef} aria-hidden="true">
            <div className="centre__stack">
              {WORKS.map((work, i) => (
                <div
                  className="centre__item"
                  key={work.slug}
                  data-active={active === i}
                >
                  <h2 className="centre__title">{work.title}</h2>
                  <p className="centre__year">{work.year}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="chrome__bottom">
            <button
              type="button"
              className="corner"
              aria-haspopup="dialog"
              aria-expanded={panel === "list"}
              onClick={() => setPanel("list")}
            >
              List
            </button>
            <button
              type="button"
              className="corner"
              aria-haspopup="dialog"
              aria-expanded={panel === "info"}
              onClick={() => setPanel("info")}
            >
              Info
            </button>
          </div>
        </div>

        <div className="works grid" ref={worksRef}>
          {Array.from({ length: CYCLES }, (_, cycle) => (
            <Fragment key={cycle}>
              <div className="works__gap" aria-hidden="true" />
              {WORKS.map((work, i) => (
                <figure
                  className="work"
                  key={work.slug}
                  /* only the canonical cycle is addressable and announced */
                  id={cycle === ORIGIN ? work.slug : undefined}
                  aria-hidden={cycle !== ORIGIN}
                  ref={(el) => {
                    figureRefs.current[cycle * WORKS.length + i] = el;
                  }}
                >
                  <WorkMedia work={work} priority={cycle === ORIGIN && i === 0} />
                  <figcaption className="visually-hidden">
                    {work.title}, {work.year}
                  </figcaption>
                </figure>
              ))}
            </Fragment>
          ))}
        </div>

      </main>

      <p className="visually-hidden" aria-live="polite">
        {active === null
          ? "Romano–Bereza"
          : `${WORKS[active].title}, ${WORKS[active].year}`}
      </p>

      <Popover open={panel === "list"} onClose={() => setPanel(null)} label="Index of works">
        <ul className="list">
          {WORKS.map((work) => (
            <li className="list__item" key={work.slug}>
              <button
                type="button"
                className="list__link"
                onClick={() => goTo(work.slug)}
              >
                <span>{work.title}</span>
                <span className="list__year">{work.year}</span>
              </button>
            </li>
          ))}
        </ul>
      </Popover>

      <Popover open={panel === "info"} onClose={() => setPanel(null)} label="Information">
        <div className="info">
          <h2 className="info__title">Romano–Bereza</h2>
          <div className="info__body">
            {INFO_TEXT.split("\n\n").map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}
