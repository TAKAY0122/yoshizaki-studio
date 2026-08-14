---
name: developers-toolkit
description: Index of installable Claude Code Skills/plugins for the software development lifecycle — design, implementation, debugging, live documentation lookup, webapp testing, and cross-session memory. Use whenever the user wants to set up a "dev team" of Skills, asks what's available for coding workflows, or needs help choosing between Superpowers, Context7, Skill Creator, Webapp Testing, or Claude-Mem.
---

# Developers Toolkit

Five installable tools that together form a "Developers department" for a
Claude-Code-based AI workflow. All were verified to exist and are actively
maintained (star counts as of Aug 2026).

## Superpowers — full SDLC methodology (★272k)

GitHub: https://github.com/obra/superpowers
By Jesse Vincent / Prime Radiant

A complete software-development methodology built on composable Skills:
brainstorming (Socratic design refinement) → writing-plans (bite-sized tasks,
2–5 min each) → subagent-driven-development (fresh subagent per task, two-
stage review) → test-driven-development (strict RED-GREEN-REFACTOR) →
requesting-code-review → finishing-a-development-branch. Skills trigger
automatically once installed — no special invocation needed.

**Install (official marketplace):**
```
/plugin install superpowers@claude-plugins-official
```

## Context7 — live, version-accurate documentation (★60.7k)

GitHub: https://github.com/upstash/context7
By Upstash

Pulls up-to-date, version-specific docs and code examples directly into the
model's context at generation time, instead of relying on stale training data
or hallucinated APIs. Works as a CLI+Skill (no MCP needed) or as an MCP
server.

**Install:**
```
npx ctx7 setup
```
Add `use context7` to a prompt, or add a standing rule to `CLAUDE.md`:
`Always use Context7 when I need library/API documentation, code generation,
setup or configuration steps without me having to explicitly ask.`

## Skill Creator — build and evaluate new Skills (Anthropic official)

GitHub: https://github.com/anthropics/skills/tree/main/skills/skill-creator

Anthropic's own guide/toolkit for creating new Skills from scratch, iterating
on them with test prompts and evals, and optimizing a Skill's `description`
field for correct auto-triggering.

**Install:**
```
/install anthropics/skills/skill-creator
```

## Webapp Testing — automated browser verification (Anthropic official)

GitHub: https://github.com/anthropics/skills/tree/main/skills/webapp-testing

Uses Playwright to test local web applications: functional verification, UI
behavior debugging, and before/after screenshot comparison during
development.

**Install:**
```
/install anthropics/skills/webapp-testing
```

## Claude-Mem — persistent memory across sessions (★90k)

GitHub: https://github.com/thedotmack/claude-mem
By Alex Newman

Captures everything an agent does during a session, compresses it with AI,
and injects the relevant slice back into future sessions — so Claude doesn't
re-learn the same project context every time a chat restarts. Ships a
3-layer search workflow (`search` → `timeline` → `get_observations`) for
token-efficient recall, plus a local web viewer and optional cloud sync.

**Install:**
```
npx claude-mem install
```
Or via the plugin marketplace:
```
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
```

## Suggested combo

For a solo developer running Claude Code as a full "dev department":
Superpowers (workflow) + Context7 (accuracy) + Claude-Mem (continuity) is the
core trio. Add Skill Creator when you start building your own custom Skills,
and Webapp Testing once you have a running local web app to verify.
