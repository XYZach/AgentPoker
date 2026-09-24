# 🦑 AgentPoker — Texas Hold'em · Cash · Tournament · Squid Game

English | **[中文](README.md)**

A single-page Texas Hold'em poker game in pure vanilla JS (2D table rendering). No build step, no backend — just open and play. Bilingual (Chinese/English).

**Play online**: https://xyzach.github.io/AgentPoker/

## Features

### Three Game Modes
- **Cash Game** — Fixed blinds, rebuy anytime you bust, leave the table whenever you like with a P&L summary
- **Tournament** — Blinds escalate through 12 levels (with antes), play until one player remains; top 3 split the prize 50%/30%/20%
- **Squid Game 🦑** — Tournament + squid rules:
  - **Elimination Clock**: every N hands, the shortest stack is force-eliminated (chips go straight into the piggy bank)
  - **Knockout Bounty**: instantly earn a bounty of half the buy-in for every opponent you eliminate
  - **Final Showdown** (optional hardcore rule): on the clock hand, everyone is forced all-in
  - Prize pool visualization: coins fly into the hanging piggy bank 🐷

### Professional Table Mechanics
Full No-Limit Hold'em rules: blinds/antes/heads-up rules, minimum raise sizing, short all-ins don't reopen betting,
**precise side-pot calculation** (including dead money from folds), odd-chip handling on split pots, simultaneous bust-outs ranked by stack size.

### Hand Review
Enable "Hand Review": after each hand, choose to continue or review first —
see everyone's hole cards (including folders), made hands, net results, and a street-by-street action timeline.

### Card Tracker
Real-time tracking of all 52 cards: your hole cards (blue) / community cards (green) / revealed folds (red).
With "Reveal Folds" enabled, folded dead cards are excluded from equity simulations.

### Live Equity
Monte Carlo simulation (~2,200 iterations per update, chunked to avoid frame drops): shows win/tie/lose probabilities,
pot odds comparison ("worth calling / calling loses"), and your current made hand. During all-in runouts, live win bars are shown for each player.

### Six AI Styles
TAG / LAG / Rock / Fish / Balanced / Maniac.

AI decisions = **style parameters × Monte Carlo equity × pot odds × position × random noise**,
including short-stack push/fold, semi-bluffs, and survival mode under squid-clock pressure. Each AI also gets a random "mood" tweak per game.

### LLM Integration
Works with any OpenAI-compatible API (DeepSeek / Zhipu GLM / Moonshot / Qwen / OpenAI / custom):
- Click **🤖 AI Advice** on your turn for a decision suggestion (action + reasoning + confidence, one-click apply)
- Bot players consult the LLM at a configurable rate, blended with the style algorithm (adjustable weight)
- Configuration is stored locally in your browser only — nothing is uploaded to any server

### Bilingual (Chinese / English)
Every piece of UI text — lobby, in-game, review, results — supports Chinese/English switching. Defaults to Chinese; your choice is remembered.

### Misc
2D table rendered with DOM/CSS (clockwise seating, nameplates with automatic collision-avoidance layout);
WebAudio synthesized sound effects (deal/chips/elimination/squid alarm); 0.5×–4× speed control; hotkeys F/C/R/A/D.

**Fairness**: AI players and advice only use public information plus their own hole cards — never the deck.

## Tech
- Pure vanilla JS: no build, no framework, zero dependencies; DOM/CSS 2D table + custom tween animation system
- Hand evaluator: bit-operation direct 7-card evaluation; event-driven engine fully decoupled from rendering
- i18n: keys are Chinese source strings with a one-way EN dictionary, `PK.t()` + `data-i18n` static replacement
- `tests/run-tests.js`: 308 Node tests (evaluator / equity benchmarks / 3-mode fuzz / per-hand chip accounting / side-pot conservation / squid clock / review snapshots)
- `tests/check-i18n.js` / `tests/check-ids.js`: static checks for dictionary completeness and DOM ID references

## Layout
```
index.html          entry
css/style.css       styles
js/core/            cards / evaluator / engine / Monte Carlo / i18n
js/ai/              style AI + LLM integration
js/render/          tween / 2D scene
js/ui/              HUD
tests/              Node tests + LLM mock server
```
