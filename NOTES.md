# Friction Log — Building on Replit as a New Free-Tier User

Context: I built this drop-rate calculator with Replit Agent (one prompt,
~8 minutes), then refined and deployed it by hand. These are the friction
points I hit as a first-time free-tier user — logged because confusion
like this is what ends up in a support queue.

## Agent
1. **Prompt said "plain HTML/CSS/JS, no frameworks" — Agent scaffolded a
   TypeScript/React pnpm monorepo anyway** (73 files, 60+ dependencies).
   The final app *was* three vanilla files, but they sit inside unused
   React scaffolding (`src/`, `vite.config.ts`), so a beginner can't tell
   which files are the real app.
2. **Logic bug from an ambiguous spec:** the "luck verdict" congratulated
   me on being lucky based on attempt count alone — it conflated
   "attempts so far" with "attempts until the drop." Fixed by clarifying
   the input label and verdict copy.
3. Leftover design-phase folders (`artifacts/mockup-sandbox`, `.local/skills`)
   ship with the project and aren't explained anywhere.

## Deployment
4. **Absolute asset paths** (`/style.css`, `/script.js`) worked in Replit's
   preview but would break on any static host serving from a subpath.
   Classic works-in-dev, breaks-in-prod.
5. **Publishing initially appeared to require a subscription.** The error
   didn't distinguish "needs a paid plan" from "needs configuration" —
   going through the Publishing pane later resolved it on free tier.

## Git integration
6. **"Create Repository on GitHub" dialog failed repeatedly with a stale
   error** (it referenced a repo name from a *previous* attempt), and no
   repo was ever created. Creating the repo manually and adding the
   remote URL worked.
7. **The Git pane's push failed silently; `git push -u origin main` from
   the Shell worked on the first try.**

## What worked well
The Agent's one-shot output quality was genuinely strong: correct geometric
distribution math, confidence-threshold cards, and a hand-drawn canvas
chart, all from a single prompt. Every problem above was recoverable from
inside the workspace — the Shell and editor made self-rescue possible.