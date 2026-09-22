---
layout: section-divider
accent: emerald
kicker: "01 · Tour"
---

# Supabase, the tour

<!-- Presenter notes: We're starting with a tour of what Supabase is, where it fits in your app architecture, and the key building blocks that make it work. This is the foundation for everything we'll do tonight. -->

---
layout: statement
accent: emerald
---

# A hosted Postgres database with auth, storage, realtime, and APIs.

<!-- Presenter notes: That's the one-liner. Supabase is the open-source Firebase alternative, but underneath it's just Postgres — so everything you learn here is real SQL and transfers anywhere. It's not magic; you get a normal Postgres database plus a set of services that talk to it for you. -->

---
layout: diagram
accent: emerald
---

# Where it fits

<div style="display: flex; align-items: center; justify-content: center; gap: 1.5rem; margin: 3rem 0; font-family: 'Cascadia Code', monospace; font-size: 0.95rem;">
  <div style="text-align: center; padding: 1.2rem 0.8rem; border: 2px solid #00D492; border-radius: 6px; min-width: 130px; background: rgba(0, 212, 146, 0.05);">
    <div style="font-size: 0.85rem; color: #888; margin-bottom: 0.5rem;">Your app</div>
    <div style="font-weight: 600; color: #fff;">Next.js /<br/>Flutter</div>
  </div>
  
  <div style="font-size: 1.4rem; color: #00D492; font-weight: 600;">→</div>
  
  <div style="text-align: center; padding: 1.2rem 0.8rem; border: 2px solid #00D492; border-radius: 6px; min-width: 130px; background: rgba(0, 212, 146, 0.05);">
    <div style="font-size: 0.85rem; color: #888; margin-bottom: 0.5rem;">Supabase</div>
    <div style="font-weight: 600; color: #fff; font-size: 0.9rem;">Auth, API<br/>Storage<br/>Realtime</div>
  </div>
  
  <div style="font-size: 1.4rem; color: #00D492; font-weight: 600;">→</div>
  
  <div style="text-align: center; padding: 1.2rem 0.8rem; border: 2px solid #00D492; border-radius: 6px; min-width: 130px; background: rgba(0, 212, 146, 0.05);">
    <div style="font-size: 0.85rem; color: #888; margin-bottom: 0.5rem;">Postgres</div>
    <div style="font-weight: 600; color: #fff;">Your tables,<br/>your data</div>
  </div>
</div>

<!-- Presenter notes: This is the mental model. Your app talks to Supabase over HTTPS using a public anon key. Postgres decides what that request is allowed to see — that's Row Level Security (RLS), which we'll cover in a few slides. The key insight: you ship an app with real users and persistent data without standing up your own server. -->

---
layout: default
accent: emerald
---

# The building blocks

- **Database** — Postgres tables, relationships, SQL. The foundation.

- **Auth** — who the user is; issues a session/JWT. *(We wire ours to DevDogs' OAuth server.)*

- **Storage** — files (images, uploads) with the same permission rules as your tables.

- **Realtime** — subscribe to row changes and get pushed updates live.

- **Auto APIs** — every table gets a REST and GraphQL endpoint for free.

- **Edge Functions** — server-side code for things that can't live in the client. *(Mention only.)*

Tonight we go deep on **Database + RLS + Auth**; Realtime and Storage get a quick "these exist and here's the shape."

<!-- Presenter notes: These are the six main building blocks of Supabase. In a normal Firebase app, you'd use these in various combinations. Tonight, we're focusing on the three that matter most for building real features: the database itself, Row Level Security (which we'll cover in detail), and authentication. Realtime and Storage are powerful tools that we'll touch on briefly so you know they exist and understand the shape of the API. Edge Functions are for server-side code — things your client can't do safely or efficiently — and we'll just mention them tonight. -->
