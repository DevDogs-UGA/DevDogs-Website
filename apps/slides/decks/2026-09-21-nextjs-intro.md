---
theme: ../theme
title: Intro to Next.js — DevDogs Workshop
info: |
  DevDogs Framework Intros, Next.js room — Mon 2026-09-21, DLW 124.
  Adapted by Sloan Finger from Kyle Quach's slides.
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
# the docs' Framework Intros workshop, beside the Flutter (2026-09-21-flutter-intro.md) deck's track.
docs:
  description: Build a small personal site with the App Router (pages, layouts, components, and a guestbook), one step at a time.
  url: /docs/workshops/framework-intros
  repos:
    web: DevDogsUGA/Web-Workshops
  tracks:
    web: { dir: nextjs, name: Intro to Next.js, order: 1, start: main }
---

<!--
This first frontmatter block only supplies deck-wide headmatter; it is
`hide: true` so it does not render as a blank slide. Slides live in the
fragment below (see apps/slides/LAYOUTS.md).
-->

---
src: ./2026-09-21-nextjs-intro/01-course.md
---
