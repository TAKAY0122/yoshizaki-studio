---
name: marketing-toolkit
description: Index of an installable Claude Code Skills collection covering copywriting, SEO, conversion optimization, paid ads, email, retention, and growth engineering. Use whenever the user needs marketing help for a SaaS/product — landing page copy, SEO audits, A/B tests, pricing, onboarding, referral programs — or asks what marketing Skills are available.
---

# Marketing Toolkit

GitHub: https://github.com/coreyhaines31/marketingskills (★44k)
By Corey Haines

A large collection of AI agent Skills for marketing tasks, aimed at technical
marketers and founders. Works with Claude Code, OpenAI Codex, Cursor,
Windsurf, and any Agent-Skills-compatible tool.

## How it's organized

Every skill reads a shared `product-marketing.md` context file first (product,
audience, positioning), then applies its own specialized workflow. Skills
cross-reference each other (e.g. `copywriting` ↔ `cro` ↔ `ab-testing`).

| Category | Skills |
|---|---|
| Conversion Optimization | `cro`, `signup`, `onboarding`, `popups`, `paywalls` |
| Content & Copy | `copywriting`, `copy-editing`, `cold-email`, `emails`, `social`, `image` |
| SEO & Discovery | `seo-audit`, `ai-seo`, `programmatic-seo`, `site-architecture`, `competitors`, `schema` |
| Paid & Distribution | `ads`, `ad-creative`, `social` |
| Measurement & Testing | `analytics`, `ab-testing` |
| Retention | `churn-prevention` |
| Growth Engineering | `co-marketing`, `free-tools`, `referrals` |
| Strategy & Monetization | `marketing-ideas`, `marketing-psychology`, `launch`, `pricing` |
| Sales & RevOps | `revops`, `sales-enablement` |

Foundational skill: **`product-marketing`** — every other skill reads it first
to understand your product, audience, and positioning. Run this one first.

## Install

**Claude Code plugin marketplace (recommended):**
```
/plugin marketplace add coreyhaines31/marketingskills
/plugin install marketing-skills
```

**Or install specific skills only via the `npx skills` CLI:**
```
npx skills add coreyhaines31/marketingskills --skill cro copywriting
```

**List everything available first:**
```
npx skills add coreyhaines31/marketingskills --list
```

> If installing from inside an active Claude Code session rather than a
> plain terminal, pass the agent explicitly so it installs to the right
> directory: `npx skills add coreyhaines31/marketingskills -a claude-code`

## Usage once installed

Just describe the task in plain language and the matching skill activates
automatically:
```
"Help me optimize this landing page for conversions"   → cro
"Write homepage copy for my SaaS"                       → copywriting
"Set up GA4 tracking for signups"                        → analytics
"Create a 5-email welcome sequence"                       → emails
```
Skills can also be invoked directly, e.g. `/cro`, `/seo-audit`.
