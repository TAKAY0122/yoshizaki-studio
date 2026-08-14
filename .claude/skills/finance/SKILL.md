---
name: finance-plugin
description: Reference for Anthropic's official Finance plugin (Claude Cowork/Claude Code) — journal entries, account reconciliation, financial statements, variance analysis, and SOX testing workpapers. Use when the user does month-end close, books accruals, needs a P&L, reconciles accounts, or asks what's available for finance/accounting workflows.
---

# Finance Plugin (Anthropic Verified)

Marketplace page: https://claude.com/plugins/finance

An Anthropic-verified plugin for Claude Cowork/Claude Code that supports the
full month-end close cycle: journal entry preparation, account reconciliation,
financial statement generation, variance analysis, and SOX compliance
testing.

## Commands

| Command | What it does |
|---|---|
| `/journal-entry` | Prepares accruals, fixed-asset entries, prepaids, and payroll with proper debits/credits |
| `/reconciliation` | Compares GL balances to subledger, bank, or third-party balances and flags reconciling items |
| `/income-statement` | Generates income statements with period-over-period comparison |
| `/variance-analysis` | Decomposes variances into drivers via waterfall analysis |
| `/sox-testing` | Creates SOX compliance testing workpapers |

## Connectors

Connect an ERP, data warehouse, or spreadsheet tool via MCP for direct data
access, or paste data / upload files for one-off analysis.

## Install

Install from the marketplace page in Claude Cowork:
https://claude.ai/desktop/customize/plugins/new?marketplace=anthropics/knowledge-work-plugins&plugin=finance

## Important

All outputs should be reviewed by a qualified financial professional before
use in reporting or filings. This tool assists with drafting and
organization; it does not replace an accountant's or auditor's sign-off.
