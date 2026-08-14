---
name: small-business-plugin
description: Reference for Anthropic's official Small Business plugin (Claude Cowork/Claude Code) — payroll planning, cash forecasts, month-end close, weekly business briefs, growth campaigns, contract review, and CRM hygiene. Use when the user runs a small business end-to-end and needs help with cash flow, invoicing, hiring, or a weekly operations snapshot, or asks what's available for running a small business.
---

# Small Business Plugin (Anthropic Verified)

Marketplace page: https://claude.com/plugins/small-business

An Anthropic-verified plugin for running an entire small business through
plain-English requests — a router picks the right workflow automatically.
Every step that touches money or customers requires explicit user approval.

## Commands

| Command | What it does |
|---|---|
| `/plan-payroll` | Forecasts cash and chases overdue invoices |
| `/close-month` | Reconciles accounts and writes the P&L narrative |
| `/run-campaign` | End-to-end growth campaign, including Canva assets |
| `/monday-brief` | Start-of-week snapshot: cash, sales, pipeline, top 3 to-dos |
| `/smb-onboard` | First-time setup / getting-started flow |

## Underlying building-block skills (auto-activate)

Cash-flow forecasting, margin analysis, lead triage, invoice chasing,
contract review, customer sentiment, tax prep, and a hiring-packet builder —
15 skills total behind the 5 commands above.

## Connectors

Best experience with QuickBooks, PayPal, and HubSpot connected. Add Canva,
DocuSign, Gmail/Outlook, Slack, Stripe, or Square as needed — most workflows
degrade gracefully when a given connector isn't available.

## Install

Install from the marketplace page in Claude Cowork:
https://claude.ai/desktop/customize/plugins/new?marketplace=anthropics/knowledge-work-plugins&plugin=small-business

Run `/smb-onboard` first after installing to get set up.
