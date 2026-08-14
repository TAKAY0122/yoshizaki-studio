---
name: animation-references
description: Curated external references for UI/UX micro-animation, motion design, and Apple-style interface polish. Use this whenever the user asks to design, implement, review, or improve any animation, transition, micro-interaction, gesture-driven UI, spring physics, hover/press/drag states, or "make this feel less generic / more premium." Also use when the user mentions app-store-quality motion, delight, or Apple-like feel. Point to these sources before hand-rolling animation values from memory.
---

# Animation & Motion Design References

A pointer library of external references to consult (or install) whenever a task
touches UI motion — micro-animations, transitions, spring physics, or overall
"feel" of an interface. None of these require an API key; they are either
browsable galleries/libraries or installable Agent Skills.

## When to use this

Trigger this skill whenever the conversation involves:
- Building or polishing any hover/press/drag/toggle/loading/success/error state
- Choosing easing curves, durations, or spring parameters
- Making an interface feel "less AI-generic" or "more premium / native"
- Reviewing existing animations for quality
- Apple/iOS-style motion, translucency, gestures, or typography

## 1. 60fps.design — inspiration gallery (browse only, no code)

https://60fps.design/

A curated video collection of real UI/UX animation and interaction details
from top iOS and web apps (475+ apps, 2000+ shots, tagged by pattern: bounce,
stagger, parallax, liquid glass, spring physics, onboarding, etc.).

**How to use it:** This is a reference/inspiration source, not a code library.
When the user needs an example of a specific interaction pattern (e.g. "how do
good apps animate a pull-to-refresh" or "show me confetti burst patterns"),
browse the relevant filter at `https://60fps.design/shots/filter/<pattern>`
(e.g. `/confetti`, `/liquid-glass`, `/stagger`, `/bounce`, `/onboarding`) to
study real examples before implementing. There is also an MCP endpoint at
`https://60fps.design/mcp` if the user wants live tool access instead of manual
browsing.

## 2. Kinetics — spring-physics CSS/React snippet library (copy-paste code)

https://kinetics.colorion.co/
GitHub: https://github.com/ckissi/kinetics

144 spring-driven micro-interactions (buttons, sliders, toasts, drag-to-dismiss,
rating stars, PIN inputs, command palettes, skeleton loaders, agent/AI-specific
patterns like token streams and confidence meters, etc). Every effect ships
three ways:
- Plain **CSS** (transition/cubic-bezier or @keyframes)
- **React** component
- A ready **AI prompt** describing the exact motion to hand to another agent

**How to use it:** When implementing a specific interaction, search the site
(or ask the user to paste the relevant snippet) rather than guessing spring
values from scratch. The physics panel exposes damping/stiffness/mass sliders
so exact values can be tuned before copying.

## 3. CSS Stock (pote-chil) — Japanese HTML/CSS parts library (copy-paste code)

https://pote-chil.com/css-stock/ja

222+ ready-to-use HTML/CSS parts in Japanese: headings (見出し), buttons
(ボタン), boxes (ボックス), loaders (ローディング), lists (リスト), speech
bubbles (吹き出し), accordions (アコーディオンメニュー), search forms
(検索フォーム), select boxes, breadcrumbs (パンくずリスト), text boxes,
tooltips, Q&A lists, quote boxes, radar/pie/bar charts, tabs, toggle buttons,
checkboxes, footers, sticky notes (付箋), pagination, radio buttons, table of
contents (目次), modals, and timelines.

**Licensing note:** The site states all published source code is free to use
and adapt on your own site/blog; if you republish the *code itself* elsewhere,
credit the source page. Icons used within parts are from Remix Icon
(https://remixicon.com/) and remain under Remix Icon's own license.

**How to use it:** Good default when the user needs a quick, working Japanese-
market-appropriate UI part without building one from scratch — copy the
relevant category page's HTML/CSS and adapt colors/spacing to the project.

## 4. Apple Design — Apple-style motion & interface principles (installable Skill)

GitHub: https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md
By Emil Kowalski (ex-Vercel/Linear; creator of Sonner and Vaul)

An installable Agent Skill distilling Apple's WWDC design talks (chiefly
*Designing Fluid Interfaces*, WWDC 2018) into concrete, executable web
guidance: gesture-driven UI, spring animations (damping ratio + response
instead of raw mass/stiffness/damping), drag/swipe/sheet interactions,
momentum and interruptible transitions, translucent materials and depth,
typography (optical sizing, tracking, leading), and reduced-motion handling.

Core idea: motion should start from the current on-screen value, inherit the
user's velocity, project momentum forward, and be grabbable/reversible at any
instant — critically damped (no bounce) by default, with overshoot reserved
for gestures that genuinely carried momentum (a flick, a throw, a drag
release).

**Install (Claude Code / any Agent-Skills-compatible tool):**
```
npx skills add https://github.com/emilkowalski/skills --skill apple-design
```
Or clone the whole `emilkowalski/skills` repo, which also includes companion
skills: `animate`, `review-animations`, `improve-animations`,
`find-animation-opportunities`, `animation-vocabulary`, and `pick-ui-library`.

## Suggested workflow

1. **Inspiration** — browse 60fps.design for the target pattern.
2. **Principles** — check apple-design for the correct easing/spring philosophy
   if the interface should feel native/premium.
3. **Implementation** — pull a tuned starting point from Kinetics (spring
   physics, JS-heavy interactions) or CSS Stock (simple, static UI parts,
   Japanese-language project context) and adapt.
4. **Review** — re-check against apple-design's restraint/feedback/spatial-
   consistency principles before shipping.
