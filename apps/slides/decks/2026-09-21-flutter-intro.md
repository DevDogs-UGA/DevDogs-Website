---
theme: ../theme
title: Intro to Flutter — DevDogs Workshop
info: |
  DevDogs Framework Intros, Flutter room (with GDGC) — Mon 2026-09-21, DLW 124.
  Adapted by Sloan Finger from Nandan Praveen's slides.
colorSchema: dark
background: '#0c090c'
fonts:
  sans: 'Hanken Grotesk'
  mono: 'Cascadia Code'
  custom: 'Alan Sans'
  weights: '400,500,600,700,800'
  italic: true
  provider: google
transition: fade
mdc: true
hide: true
# `pnpm export:md` (scripts/export-md.ts) writes this deck's one track into
# the docs' Framework Intros workshop, beside the Next.js (2026-09-21-nextjs-intro.md) deck's track.
docs:
  description: Build a two-tab Flutter app (widgets, navigation, and a guestbook), one step at a time.
  url: /docs/workshops/framework-intros
  repos:
    mobile: DevDogsUGA/Mobile-Workshops
  tracks:
    mobile: { dir: flutter, name: Intro to Flutter, order: 2, start: main }
---

<!--
This first frontmatter block only supplies deck-wide headmatter; it is
`hide: true` so it does not render as a blank slide. Slides live in the
fragment below (see apps/slides/LAYOUTS.md).
-->

---
src: ./2026-09-21-flutter-intro/01-course.md
---
