---
name: social-media-toolkit
description: Index of an installable Claude Code Skills collection for personal-brand / creator social media operations — voice building, LinkedIn posts, Instagram Reels scripts, YouTube thumbnails, carousels, and analytics dashboards. Use whenever the user wants help writing or planning social posts, building a consistent content voice, scoring drafts, or asks what social-media Skills are available.
---

# Social Media Toolkit

GitHub: https://github.com/charlie947/social-media-skills (★1.5k)
By Charlie Hills (350k+ followers across LinkedIn/Instagram/Substack/X/YouTube)

17 Skills that power one creator's real content system, running from a single
newsletter out to every other channel.

## Foundation (run first)

- **`voice-builder`** — interviews the user + analyzes 3–5 writing samples to
  produce `about-me.md` and `voice.md`. Every other skill reads these two
  files before drafting anything.
- **`newsletter-voice`** — adds newsletter-specific writing rules on top of
  voice-builder, producing `newsletter-voice.md` (the source every other
  piece of content is derived from).

## By category

| Category | Skills |
|---|---|
| LinkedIn | `profile-optimizer`, `post-writer`, `graphic-designer`, `post-formatter` (PAS/AIDA/BAB/STAR/SLAY), `hook-generator`, `post-scorer`, `content-matrix`, `niche-research`, `gemini-infographic`, `gemini-carousel`, `quote-post` |
| Instagram Reels | `reels-scripting` (reverse-engineers an outlier Reel via Apify + Gemini 2.5 Flash) |
| YouTube | `youtube-thumbnail` |
| Community | `pinned-comment` |
| Analytics | `analytics-dashboard` (LinkedIn export → interactive React dashboard + 5 recommendations) |

## Prerequisites

A few skills call external services and need environment variables set first:

```
export APIFY_API_TOKEN=your_token       # post-scorer, reels-scripting
export GOOGLE_AI_API_KEY=your_key       # reels-scripting (Gemini video analysis)
```

The image-generation skills (`gemini-infographic`, `gemini-carousel`,
`quote-post`, `youtube-thumbnail`, `profile-optimizer`) output ready-to-paste
prompts — run those in a separate Gemini chat with image generation enabled;
no API key required for that part.

## Install

**Claude Code plugin marketplace:**
```
/plugin marketplace add charlie947/social-media-skills
/plugin install social-media-skills
```

**Or clone and copy:**
```
git clone https://github.com/charlie947/social-media-skills.git
cp -r social-media-skills/skills/* ~/.claude/skills/
```

## Usage once installed

Run `voice-builder` first — everything else depends on `about-me.md` and
`voice.md`. After that, describe the task in plain language:
```
"Write me a post about AI agents"          → post-writer
"Score this draft against my history"      → post-scorer
"Make me a carousel from this"             → gemini-carousel
"What should I post this week"             → niche-research or content-matrix
"Turn this outlier Reel into a script"     → reels-scripting
```
