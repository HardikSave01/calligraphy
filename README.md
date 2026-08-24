# Calligraphy — an AR handwriting guide for Specs

An augmented-reality calligraphy tutor built for Snap Spectacles ("Specs"). It teaches capital letters **A, B, C** by showing you exactly how each stroke is written, then watching you trace it in the air and telling you, in plain words, what to fix.

▶️ **Demo video:** https://youtu.be/q4SrO5GDG3M

## Why "Guide"

Calligraphy is a guide in the most literal sense: it shows you the path before asking you to walk it. Every part of the experience is built around guidance that adapts to you —

- A stroke-by-stroke animated demo traces each letter at natural writing speed, with a travelling dot and numbered start badges, before you ever try it yourself.
- A **guidance ladder** watches how you're doing: a full ghost outline while you're learning, fading to just a start-point cue once you're getting it, and disappearing entirely once you've shown you don't need it — then stepping back up if you slip.
- When you finish a letter, you don't just get a score — you get one sentence telling you the single biggest thing to fix ("crossbar sits too high", "left diagonal drawn upward"), because a number alone doesn't guide anyone.

## Who it's for

Anyone practicing handwriting fundamentals in AR — students learning letterforms, calligraphy hobbyists warming up on basic strokes, or educators looking for a hands-free, screen-free way to teach stroke order and direction. It's also a compact reference implementation for anyone building guided-practice or skill-coaching experiences on Specs.

## Key features

- **World-space dual panel** — a Learn box and a Practice box side by side, each with ruled ascender / midline / baseline / descender lines, just like a handwriting workbook.
- **Animated stroke demo** — every letter is drawn stroke-by-stroke from real path data (no font glyphs), with synced step-pill instructions and numbered start badges.
- **Pinch-to-write drawing** — write directly in the air; your strokes render live in the Practice box.
- **Automatic scoring** — resamples your strokes against the target path, checks stroke count, start position, and direction, and grades you generously (a wobbly-but-correct letter should pass).
- **Dashed ghost overlay** — after scoring, the target letter is overlaid on your attempt so the difference is visible at a glance.
- **Adaptive guidance ladder** — three levels of help per letter that rise and fall with your performance.
- **Mouse/touch fallback** — the same drawing path also runs on mouse/touch input, so the Practice box is fully testable inside the Lens Studio Preview panel, not just on-device.
- **Undo / erase / redo-the-erase** — full control over your practice attempt without ever touching the ruled lines or the reference letter.

## Built with

This Lens was built end-to-end with **[Claude Code](https://claude.com/claude-code)** using **CLAD**, the Lens Studio agent toolkit — from scene construction and runtime mesh rendering through hand-tracking input, scoring logic, and iterative in-preview verification.

## Getting started

1. Open `Calligraphy.esproj` in [Lens Studio](https://ar.snap.com/lens-studio) (5.22+).
2. Press Preview — the Lens opens directly on letter **A** with the demo animation playing, no menu.
3. Try the Practice box with mouse drag in Preview, or pinch-to-write on a connected Spectacles device.

## Project structure

```
Assets/Scripts/
  CalligraphyTutor.ts   — scene construction, input handling, state machine
  LetterData.ts         — the A/B/C stroke path data that drives everything
  Geometry.ts           — polyline math (resampling, distance, smoothing)
  MeshPainter.ts        — runtime vertex-colored mesh rendering
  Scoring.ts            — stroke scoring and plain-language diagnostics
  Slate.ts              — one ruled writing slate (Learn or Practice box)
  Theme.ts              — layout and color constants
```
