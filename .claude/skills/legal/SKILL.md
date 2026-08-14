---
name: legal-plugin
description: Reference for Anthropic's official Legal plugin (Claude Cowork/Claude Code) — contract review against a configured playbook, NDA triage, compliance workflows, legal briefings, and templated responses for in-house legal teams. Use when the user needs contract clause review, NDA pre-screening, vendor agreement status checks, or asks what's available for legal/compliance workflows.
---

# Legal Plugin (Anthropic Verified)

Marketplace page: https://claude.com/plugins/legal

An Anthropic-verified plugin built for commercial counsel, product counsel,
privacy/compliance, and litigation support teams. Configurable to your
organization's own negotiation playbook and risk tolerances.

## Commands

| Command | What it does |
|---|---|
| `/review-contract` | Clause-by-clause review against your configured playbook, with GREEN/YELLOW/RED flags and specific redline suggestions |
| `/triage-nda` | Rapid NDA pre-screening → standard approval, counsel review, or full review |
| `/vendor-check` | Checks vendor agreement status |
| `/brief` | Generates contextual briefings — daily briefs, topic research, or incident response |
| `/respond` | Templated responses for common inquiries (data subject requests, discovery holds, etc.) |

## Configuration

Define standard positions, acceptable ranges, and escalation triggers in a
local settings file (the playbook `/review-contract` checks against). Connect
document management, chat, and project tracking tools via MCP for richer
context.

## Install

Install from the marketplace page in Claude Cowork:
https://claude.ai/desktop/customize/plugins/new?marketplace=anthropics/knowledge-work-plugins&plugin=legal

## Important

All outputs should be reviewed by a licensed attorney before being relied on
or sent externally. This tool assists with triage and drafting; it does not
provide legal advice or replace attorney review.
