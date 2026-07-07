# Drop Rate Calculator

Ever wonder if your loot luck is cursed? Enter any drop rate (3%, 1/512)
and your attempt count to see the real math: probability of at least one
drop, expected attempts, and how many runs you need for 50/90/99%
confidence — plus a verdict on whether the RNG gods have blessed or
forsaken you.

**Live app:** https://drop-rate-calculator--davonhensontech.replit.app/

## How it was built

Scaffolded with Replit Agent from a single prompt, then refined by hand:
fixed the attempts-vs-attempts-until-drop verdict logic, corrected
absolute asset paths that would break outside Replit's preview, and
deployed via the Shell when the UI push failed.

The actual app is three vanilla JS files — no frameworks:
`artifacts/drop-rate-calculator/index.html`, `style.css`, and `script.js`.
Everything else is Replit workspace scaffolding.

I also kept a log of everything that confused me as a first-time
free-tier user: see [NOTES.md](NOTES.md).

## The math

- P(at least one drop in n tries) = 1 − (1 − p)ⁿ
- Expected attempts = 1/p
- Attempts for X% confidence = ⌈ln(1 − X) / ln(1 − p)⌉