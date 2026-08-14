---
name: designers-toolkit
description: Index of installable Claude Code Skills for UI/UX design, visual "taste", frontend implementation, and screen transitions/animations. Use whenever the user wants to set up a "design department" of Skills, asks what's available for UI/UX or frontend styling work, or needs help choosing between UI UX Pro Max, Taste, Frontend Design, or Transitions.
---

# Designers Toolkit

Four installable tools that together form a "Designers department." All
verified to exist and actively maintained (star counts as of Aug 2026).

## UI UX Pro Max — design-system generation engine (★116k)

GitHub: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

An AI-powered reasoning engine that analyzes a project brief and generates a
complete, tailored design system in seconds: layout pattern, color palette,
typography pairing, key motion effects, anti-patterns to avoid, and a pre-
delivery accessibility checklist. Covers 192 industry-specific reasoning
rules, 79 searchable UI styles (Glassmorphism, Brutalism, Neumorphism, Bento
Grid, etc.), 192 color palettes, 74 font pairings, and 22 tech-stack targets
(React, Vue, Svelte, SwiftUI, Jetpack Compose, Flutter, and more).

**Note:** This is the free/open-source core. A separate paid "Premium"
version (branding, logos, presentation slides) exists at uupm.cc — the free
version covers UI/UX generation only.

**Install (Claude Code marketplace):**
```
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

## Taste — anti-"AI slop" frontend framework (★70.1k)

GitHub: https://github.com/Leonxlnx/taste-skill

Stops AI coding agents from producing generic, boilerplate-looking frontends.
Ships as several targeted skill variants rather than one monolith — install
only the ones you need:

| Install name | What it does |
|---|---|
| `design-taste-frontend` | Default (v2). Infers design language from the brief, tunes VARIANCE/MOTION/DENSITY dials |
| `gpt-taste` | Stricter GPT/Codex-oriented variant |
| `image-to-code` | Generate reference images, analyze, then implement to match |
| `redesign-existing-projects` | Audits an existing UI first, then fixes it |
| `high-end-visual-design` | Calm, premium, soft-contrast aesthetic |
| `minimalist-ui` | Notion/Linear-style editorial minimalism |
| `industrial-brutalist-ui` | Hard, Swiss-type, sharp-contrast brutalism |
| `full-output-enforcement` | Prevents truncated/placeholder output |

**Install (any one skill, or all):**
```
npx skills add https://github.com/Leonxlnx/taste-skill
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

## Frontend Design — Anthropic official design tokens & styling rules

GitHub: https://github.com/anthropics/skills/tree/main/skills/frontend-design

Anthropic's own guidance for distinctive, intentional visual design in newly
built or restyled UI: aesthetic direction, typography, and steering away from
templated-looking defaults (over-centered layouts, purple gradients,
cookie-cutter rounded corners).

**Install:**
```
/install anthropics/skills/frontend-design
```

## Transitions — CSS transition/animation library (★2.3k)

GitHub: https://github.com/Jakubantalik/transitions.dev
Site: https://transitions.dev/

18 reusable, copy-ready CSS transitions (card resize, number pop-in,
notification badge, menu dropdown, modal open/close, panel reveal, page
side-by-side, icon swap, success check, avatar-group hover, error shake, and
more), each shipped with semantic custom properties and a
`prefers-reduced-motion` guard baked in. Also ships as an installable Agent
Skill and a live "Refine" panel that lets a coding agent align an existing
transition to the library's motion tokens in real time.

**Install (CLI, per-transition):**
```
npx transitions-pro add card-resize
```
**Install (as an Agent Skill):**
```
npx skills add Jakubantalik/transitions.dev
```

## Suggested combo

Start a new UI: **UI UX Pro Max** (system) → **Taste** (avoid generic output)
→ **Transitions** (motion polish). Keep **Frontend Design** installed as a
baseline styling conscience across all of the above. See also
`animation-references/SKILL.md` for deeper motion inspiration and Apple-style
principles.
