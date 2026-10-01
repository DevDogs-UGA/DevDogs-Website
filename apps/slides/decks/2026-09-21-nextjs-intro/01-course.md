---
layout: section-divider
accent: rose
kicker: "Intro to Next.js"
docsPage:
  file: setup
  title: Get Set Up
  description: Clone the workshop repo and run the starter app.
---

# Get Set Up

<!-- Presenter notes: Adapted from Kyle Quach's Next.js room at Framework Intros (2026-09-21). The installs happened in the shared half of the night; this deck starts once everyone has Node and pnpm. -->

---
layout: bullets-card
accent: rose
cardTitle: Before you start
---

# What You'll Build

- A small personal site: a home page, an About section, and a Projects page
- A navigation bar shared by every page
- A guestbook visitors can sign

::card::

Install Git, VS Code, Node and pnpm first: the [Prerequisites](/docs/workshops/getting-started/prerequisites#for-the-nextjs-track) cover all of them.

This course is adapted by Sloan Finger from Kyle Quach's Next.js workshop at Framework Intros, Sep 21, 2026.

---
layout: terminal
accent: rose
heading: Get the Workshop Code
titlebar: Terminal
---

```bash {*}{cwd:'~'}
# Download the workshop repo
git clone https://github.com/DevDogsUGA/Web-Workshops
cd Web-Workshops
# Your own branch, starting from the course's first step
git switch -c <github-username>/01-nextjs-intro 01-nextjs-intro/00-start
# Install dependencies
pnpm install
```

The workshop started from `pnpm create next-app@latest my-app --yes`, which makes a fresh Next.js app. The repo's `main` branch is that same starter, trimmed down, so every step below has a checkpoint to catch up to if you fall behind.

---
layout: terminal
accent: rose
heading: Run It
titlebar: Terminal
---

```bash {*}{run: false}
# Start the dev server
pnpm dev
```

Open [localhost:3000](http://localhost:3000): a page with one heading. Leave the server running while you work; the page reloads every time you save a file.

---
layout: statement
accent: rose
chip: STEP 1
docsPage:
  file: 01-routes
  description: What Next.js adds to React, and how a folder becomes a page.
---

# Routes

React is a library for building user interfaces out of components. Next.js is a framework around React that adds what a whole site needs: routing, server rendering, and data fetching. This step covers routing, how a URL finds its page.

---
layout: bullets-card
accent: rose
cardTitle: "Pages Router: the traditional way"
---

# App Router, Not Pages Router

**App Router**, what we use:

- Lives in an `app/` directory
- The current default, and where the framework is heading
- Unlocks Server Components (step 5)

::card::

- Lives in a `pages/` directory
- Still supported, no longer the default
- Doesn't get the latest features

You'll see both in tutorials online. If a guide talks about `pages/`, it's the old router.

---
accent: rose
---

# Your Folder Is the URL

In the App Router, every folder inside `app` is a segment of the URL, and a `page.tsx` inside it is what that URL shows:

| Your folder                  | The URL         |
| ---------------------------- | --------------- |
| `app/page.tsx`               | `/`             |
| `app/create/page.tsx`        | `/create`       |
| `app/schedule/[id]/page.tsx` | `/schedule/123` |

A folder in square brackets, like `[id]`, matches any value in that spot, so one page serves every schedule.

---
accent: rose
---

# Special Files

A few file names mean something to Next.js wherever they appear in `app`:

| File            | What it is                                        |
| --------------- | ------------------------------------------------- |
| `page.tsx`      | The page itself.                                  |
| `layout.tsx`    | A shared wrapper around pages: a nav, a sidebar.  |
| `loading.tsx`   | Shown as a placeholder while the page loads.      |
| `error.tsx`     | Shown when something went wrong.                  |
| `not-found.tsx` | Shown when nothing matches the URL.               |

This workshop uses the first two.

---
layout: terminal
checkpoint: 01-nextjs-intro/01-routes
accent: rose
heading: Add an About Page
titlebar: Editor
file: ~/app/about/page.tsx
---

<<< web@01-nextjs-intro/01-routes:app/about/page.tsx

<CodeTips>
<template #0>

Make a folder `app/about` with a `page.tsx` inside. The folder's name is the URL, so this page lives at `/about`. A page is a React component exported as the file's `default`, and whatever it returns is the page. Make it about you.

</template>
</CodeTips>

---
accent: rose
---

# Try It

Open [localhost:3000/about](http://localhost:3000/about). There's no link to it yet, so type the URL; the next step adds links.

---
layout: statement
accent: rose
chip: STEP 2
docsPage:
  file: 02-layouts
  description: Link pages together, and wrap a section in a layout that stays put as you navigate.
---

# Layouts and Links

Your About page has room for more than one page. This step adds a second page beneath it, links the two, and wraps both in a layout.

---
layout: bullets-card
accent: rose
cardTitle: A link
---

# Link

- Import `Link` from `next/link`
- Use it like an `<a>`, with `href` set to the page's URL
- It moves between pages without reloading the whole site, so navigating feels instant

::card::

```tsx
<Link href="/about">About Me</Link>
```

---
layout: bullets-card
accent: rose
cardTitle: What this means
---

# Layout, Layout, Layout

- A `layout.tsx` wraps every page in its folder, and every folder beneath it
- Layouts nest: each layer wraps everything below it
- A layout doesn't re-render when you move between the pages it wraps

::card::

Whatever the layout holds, like a sidebar or a nav, doesn't flicker every time you click something.

---
layout: terminal
checkpoint: 01-nextjs-intro/02-layouts
accent: rose
heading: A Page Inside a Page
titlebar: Editor
file: ~/app/about/moreAbout/page.tsx
---

<<< web@01-nextjs-intro/02-layouts:app/about/moreAbout/page.tsx

<CodeTips>
<template #0>

A folder inside `about` is a URL inside `/about`: this page is `/about/moreAbout`. Swap in a fun fact about yourself.

</template>
</CodeTips>

---
layout: terminal
checkpoint: 01-nextjs-intro/02-layouts
accent: rose
heading: Wrap the About Section
titlebar: Editor
file: ~/app/about/layout.tsx
---

<<< web@01-nextjs-intro/02-layouts:app/about/layout.tsx

<CodeTips>
<template #0>

`layout.tsx` in `app/about` wraps both About pages. It gets the page being shown as `children`, and puts it in the `<section>`, beside a list of links. `Link` works for other sites too: put your own GitHub handle in the first one.

</template>
</CodeTips>

---
accent: rose
---

# Try It

Open [localhost:3000/about](http://localhost:3000/about) and click **Even More About Me**. The page changes, but the links beside it stay where they are: they belong to the layout, not the page.

---
layout: statement
accent: rose
chip: STEP 3
docsPage:
  file: 03-projects
  title: "Your Turn: Projects"
  description: Make a route on your own, then compare it with ours.
---

# Your Turn: Projects

Make a Projects page at `/projects` that lists a few projects, each with a name and a short description. Try it before you open our version below.

---
layout: bullets-card
accent: rose
cardTitle: Stuck?
---

# Hints

- It's a new folder under `app`, with a `page.tsx` in it
- Keep the projects in an array, and turn each into a list item with `.map`
- Give each list item a `key`

::card::

`key` is how React tells list items apart. Use something unique to each item, like its name.

---
layout: terminal
checkpoint: 01-nextjs-intro/03-projects
accent: rose
heading: Our Version
titlebar: Editor
file: ~/app/projects/page.tsx
---

<details>
<summary>Show our Projects page</summary>

<<< web@01-nextjs-intro/03-projects:app/projects/page.tsx

<CodeTips>
<template #0>

The projects live in an array above the component. `.map` turns each one into an `<li>`, keyed by its name.

</template>
</CodeTips>

</details>

---
accent: rose
---

# Try It

Open [localhost:3000/projects](http://localhost:3000/projects). Still no way to get there by clicking: the next step fixes that for every page at once.

---
layout: statement
accent: rose
chip: STEP 4
docsPage:
  file: 04-components
  description: Build a navigation bar once, and put it on every page.
---

# Components

A component is a reusable building block of a user interface: you write it once and use it anywhere. Every page so far is one. This step makes one that isn't a page: a navigation bar.

---
layout: bullets-card
accent: rose
cardTitle: Built in to Next.js
---

# Where Components Live

- Make a `components` folder beside `app`, not inside it
- Inside `app`, folders are routes. Outside it, a file is just code you import.

::card::

- **`Link`** (`next/link`) moves between pages without a full reload
- **`Image`** (`next/image`) resizes images and serves smaller formats, so pages load faster
- **`Script`** (`next/script`) controls when a script loads, so it doesn't slow the page down

---
layout: terminal
checkpoint: 01-nextjs-intro/04-components
accent: rose
heading: A Navigation Bar
titlebar: Editor
file: ~/components/Navbar.tsx
---

<<< web@01-nextjs-intro/04-components:components/Navbar.tsx

<CodeTips>
<template #0>

`Navbar` returns a `<nav>`: your name on the left, and a `Link` to each page on the right.

</template>
</CodeTips>

---
layout: terminal
checkpoint: 01-nextjs-intro/04-components
accent: rose
heading: Use It in the Root Layout
titlebar: Editor
file: ~/app/layout.tsx
---

<<< web@01-nextjs-intro/04-components:app/layout.tsx {build:1,2}

<CodeTips>
<template #0>

`app/layout.tsx` is the root layout: it wraps every page in the app. Import `Navbar` and put `<Navbar />` above the page, and every page gets it. `<main>` gives every page the same width and padding.

</template>
</CodeTips>

---
layout: terminal
checkpoint: 01-nextjs-intro/04-components
accent: rose
heading: Tidy the Home Page
titlebar: Editor
file: ~/app/page.tsx
---

<<< web@01-nextjs-intro/04-components:app/page.tsx {build:1,2}

<CodeTips>
<template #0>

The home page had its own `<main>`. The root layout provides one now, so the page's becomes a plain `<div>`.

</template>
</CodeTips>

---
accent: rose
---

# Try It

Every page now has the navbar. Click through Home, Projects and About: the navbar stays put, because the root layout holds it.

---
layout: statement
accent: rose
chip: STEP 5
docsPage:
  file: 05-interactivity
  description: Make a button work with state, and learn which components run in the browser.
---

# Interactivity

Everything so far renders on the server: Next.js sends finished HTML, and no JavaScript for those components. A button that counts its clicks has to run in the browser. This step adds one.

---
layout: terminal
checkpoint: 01-nextjs-intro/05-interactivity
accent: rose
heading: A Counter on the Home Page
titlebar: Editor
file: ~/app/page.tsx
---

<<< web@01-nextjs-intro/05-interactivity:app/page.tsx {build:1,2}

<CodeTips>
<template #0>

Swap the home page's heading for a `Counter` component. You'll write it next.

</template>
</CodeTips>

---
accent: rose
---

# Why Doesn't My Button Work?

Here's a first try at `components/Counter.tsx`:

```tsx
import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>Add One to Count: {count}</button>
  );
}
```

`useState` keeps a value between renders, and `setCount` changes it and redraws the button. But instead of a page, Next.js shows an error:

```text
You're importing a module that depends on `useState` into a React Server
Component module. This API is only available in Client Components. To fix,
mark the file (or its parent) with the "use client" directive.
```

---
layout: bullets-card
accent: rose
cardTitle: "Client Component: you ask for it"
---

# Server and Client Components

**Server Component**, the default:

- Runs on the server only
- Ships zero JavaScript to the browser
- Can fetch data directly, with no API layer in between

::card::

- Marked with `"use client"` at the top of the file
- Needed for state, effects, and event handlers like `onClick`
- For anything interactive: inputs, buttons, things that change

---
layout: terminal
checkpoint: 01-nextjs-intro/05-interactivity
accent: rose
heading: Make It a Client Component
titlebar: Editor
file: ~/components/Counter.tsx
---

<<< web@01-nextjs-intro/05-interactivity:components/Counter.tsx

<CodeTips>
<template #0>

`"use client"` on the first line makes `Counter` a Client Component, and the button counts. Keep the server the default: mark the smallest piece that needs to be interactive, like this button, not the page around it.

</template>
</CodeTips>

---
layout: statement
accent: rose
chip: STEP 6
docsPage:
  file: 06-guestbook
  description: Put routes, components and state together in a guestbook visitors can sign.
---

# Guestbook

A guestbook uses everything so far: a new route, a link in the navbar, and a Client Component that holds state. This time the state is a whole list.

---
layout: terminal
checkpoint: 01-nextjs-intro/06-guestbook
accent: rose
heading: Link It From the Navbar
titlebar: Editor
file: ~/components/Navbar.tsx
---

<<< web@01-nextjs-intro/06-guestbook:components/Navbar.tsx {build}

<CodeTips>
<template #0>

One more link in the navbar, to a page you'll make next.

</template>
</CodeTips>

---
layout: terminal
checkpoint: 01-nextjs-intro/06-guestbook
accent: rose
heading: The Guestbook Page
titlebar: Editor
file: ~/app/guestbook/page.tsx
---

<<< web@01-nextjs-intro/06-guestbook:app/guestbook/page.tsx

<CodeTips>
<template #0>

The page itself is a Server Component, like every page so far. It renders `<Guestbook />`, the interactive part, which lives in `components`.

</template>
</CodeTips>

---
layout: terminal
checkpoint: 01-nextjs-intro/06-guestbook
accent: rose
heading: The Guestbook Component
titlebar: Editor
file: ~/components/Guestbook.tsx
---

<<< web@01-nextjs-intro/06-guestbook:components/Guestbook.tsx {1-14|16-34|36-58|60-79}

<CodeTips>
<template #0>

`Guestbook` is a Client Component: it holds state, and its form reacts to typing. `Entry` describes one message. The component keeps three pieces of state: the list of entries, and what's typed in each field so far.

</template>
<template #1>

`handleSubmit` runs when the form is sent. `preventDefault` stops the browser's default for a form, which is to reload the page. An entry with nothing but spaces is turned away. A new entry goes at the front of a new array, so the newest shows first, and both fields clear.

</template>
<template #2>

Each field is controlled: its `value` comes from state, and `onChange` writes every keystroke back to it. That's how `handleSubmit` can read the fields and clear them.

</template>
<template #3>

The list renders with `.map`, like the projects did, with the time each entry was posted.

</template>
</CodeTips>

---
accent: rose
---

# Refresh It

Sign the guestbook a few times, then refresh the page. The entries are gone: they only ever lived in the component's state, in that one browser tab.

Giving them somewhere to live is what the [Supabase workshop](/docs/workshops/supabase/nextjs/setup) does next, starting from exactly this code.

---
layout: numbered-list
accent: rose
---

# Keep Going

- [nextjs.org/learn](https://nextjs.org/learn), a free course covering the whole framework
- [The App Router docs](https://nextjs.org/docs/app)
- [react.dev/learn](https://react.dev/learn), to learn React or brush up
- Ready to contribute? Start with DogDays' [Your first contribution](/docs/schedule-builder/getting-started/first-contribution)
