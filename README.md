# Romano–Bereza

Scroll-driven portfolio site. Next.js (App Router) + Lenis smooth scroll, Arial
throughout, 12-column grid with 20px margins.

```bash
npm run dev     # http://localhost:3000
npm run build
```

## How the scroll piece works

At rest the wordmark **Romano–Bereza** is set at 44px in the middle of the
viewport, with the first image peeking up from the bottom edge. Scrolling drives
a single progress value `p`, which reaches `1` exactly as the first image's top
edge touches the centre line. Over that distance:

- `Romano` and `Bereza` fly apart to the top corners of the grid and scale from
  44px down to 26px (a FLIP transform measured from the corner rest state, so it
  stays correct through resizes and type-scale changes)
- the en dash fades out early and hands off to the rule
- the rule is stretched between the two words every frame, so it reads as a line
  being drawn rather than one that snaps into place
- the work title fades in at centre

Past that point the centre text swaps to whichever work last crossed the centre
line — 44px title, 18px year.

The column loops forever. Approaching the end of a cycle the wordmark
reassembles in the centre, so it is centred at both edges of the loop and the
seam is continuous in both directions — scroll down past the last work and you
come back round to the first, scroll up from the first and you land on the last.

## Three things worth knowing before editing

**The chrome is absolutely positioned, not fixed.** Chromium composites
`position: fixed` subtrees into their own layer and then skips `mix-blend-mode`
entirely — the difference blend silently no-ops and the white chrome stays white
on white paper. So each chrome layer sits at the document origin and carries the
scroll offset in its own transform (`paint()` in `components/Site.tsx`). Making
any of it `fixed` again will break the difference effect.

**The paper is painted on `<html>` as well as `<body>`.** That stops `<body>`'s
background propagating to the canvas, which leaves `<body>` painting a real
backdrop for the blend to invert against.

**The loop is Lenis's `infinite` mode, and it wraps at `scrollHeight -
viewport`.** For that to land on a cycle boundary the column is rendered twice
and `<main>` is clipped, from JS, to exactly one cycle plus one viewport. The
chrome lives inside `<main>` for the same reason: its scroll-following
transform counts towards scrollable overflow, so if it sat outside, the document
height — and with it the wrap point — would drift as you scroll. If you move the
chrome out, or drop the clip, the loop will slowly go out of register.

## Tuning

| What | Where |
| --- | --- |
| Type scale (44 / 26 / 18) | `--type-display`, `--type-secondary`, `--type-body` in `app/globals.css` |
| Grid margin / gutter | `--margin`, `--gutter` |
| How far the first image peeks | `--peek` (default `88vh`) |
| Gap between images | `--work-gap` |
| Scroll feel | `lerp` / `duration` in `components/SmoothScroll.tsx` |
| Works and years | filenames in `public/works/`, then `npm run index` |
| Info panel copy | `data/info.ts` |

## Adding work

Drop the file in `public/works/`, then:

```bash
npm run index
```

That regenerates `data/works.ts` from the folder — **don't hand-edit it**, edit
the filenames. The filename carries the metadata:

```
TitleInCamelCase-YEAR.ext
```

- `DesirePath3-2024.jpg` → "Desire Path 3", 2024
- `OSCI-2025.png` → "OSCI" (acronyms are left alone)
- `Warps01–02-2024.JPG` → "Warps 01–02" — the **last hyphen-minus** separates
  the year, so en dashes inside a title survive

Order is newest first, then alphabetical. To order by hand, sort the array in
the generator or rename with a numeric prefix.

Stills and video are both supported (`.jpg .jpeg .png .webp .avif .gif`,
`.mp4 .webm .mov`). Dimensions are read with `ffprobe` (`brew install ffmpeg`)
and baked in, so the layout box is reserved before anything loads — that's what
keeps the scroll measurements honest.

Stills go through `next/image`, so full-resolution originals are fine to keep in
the repo; they're resized and served as WebP/AVIF at request time. **Video is
served raw** — Next does not transcode it, so compress before committing:

```bash
ffmpeg -i in.mp4 -vf scale=1600:-2 -c:v libx264 -crf 24 -preset slow -an out.mp4
```

Videos are muted, looped, and only fetch and play once they're near the
viewport; with reduced motion they don't autoplay and get controls instead.

Both panels (List, Info) share one `components/Popover.tsx` shell: blurred
backdrop, close button on the grid margin, escape and click-out to dismiss.
