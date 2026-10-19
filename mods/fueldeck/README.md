# Fueldeck

A variation of [Flightdeck](https://github.com/scasella/claude-flightdeck) by Stephen Casella: the same
live agent dashboard (context and cost, the permission gate, subagent cards and swimlanes, the turn
receipt, the session log) plus a **fuel** panel that shows where your tokens go.

It has its own name, state, pane and `/fueldeck` command, so it never clashes with an installed
Flightdeck, but it shows everything Flightdeck does: enable one of the two.

## Install

```
/plugin marketplace add ry-apollotech/arcade-mods
/plugin install fueldeck@arcade-mods
/reload-plugins
/fueldeck
```

Or for one session from a clone: `claude --plugin-dir ./mods/fueldeck`.

Fueldeck, Flightdeck and arcade-dash all draw above the prompt, so enable one at a time.

## The fuel panel

```
╭────────────────────────────────────────────────────────╮
│ Σ 1.2M                              ◎92%  ↓14k ↑61k    │
│ main            ▰▰▰▰▰▰▰▰  910k  ×48                    │
│ Explore         ▰▰▱▱▱▱▱▱  220k  ×12                    │
│ planner         ▰▱▱▱▱▱▱▱   70k  ×4                     │
│ ☰ 16k/req                                              │
│ everything-cla… ▰▰▰▰▰▰▰▰    8k  100◇ 17◈               │
│ memory files    ▰▰▰▰▱▱▱▱    4k  10▤                    │
│ context7        ▰▱▱▱▱▱▱▱    1k  2⎔                     │
│ ◇ brainstorming ×1 ~4k · plugin-authoring ×1 ~3k       │
╰────────────────────────────────────────────────────────╯
```

The whole pane uses glyphs in place of labels and hides counts that are zero. `/fueldeck legend` lists
what each glyph means; set `labels` to `words` in `/config` for Flightdeck's labelled layout.

| Row | Shows | From |
| --- | --- | --- |
| `Σ` header | every token this session's model requests processed (input, output, cache reads and writes); `◎` the cache hit rate (cache reads over all input); `↓ ↑` fresh input and output | each request's `usage` at `turn.step` |
| loops | the top three consumers, `×` their requests: the main loop and each subagent type (`Explore`, `planner`), the architect, and `other loops` (compactions, workflows) | the same, keyed by the loop that made the request |
| `☰` every request | what each request carries before you type anything, by source: each plugin's skill listings and agent descriptions together, each MCP server's loaded tool schemas, your memory files (CLAUDE.md, rules) | the `/context` breakdown, estimated locally (`summary`), refreshed at session start, after each turn and on `/fueldeck usage` |
| `◇` skills | each skill that ran this session, how often, and about how much text it put into the context | `skill.prompt`, at four characters a token |

The panel appears after the first model request. The inline mini layout and the status line show the
session total as `… tok`.

`/fueldeck usage` prints the full table in the transcript: totals, every loop and every model with
their four counts, the context's categories (system prompt, tools, messages…), every source of the
standing load, and every skill run.

### What is estimated

- **Request totals are measured**: they are the API's own counts. Cache reads are billed far below
  fresh input, so a large total with a high hit rate costs less than it looks; the main box's dollar
  figure is the real cost.
- **The total counts cache reads on every request**, so it grows much faster than the context
  gauge: thirty requests over a 100k context read 3M from the cache. `in` and `out` are the
  fresh tokens.
- **The standing load and skill runs are estimates**, as `/context` makes them. The standing load is
  what each request *carries*, not what it costs: most of it is read from the cache.
- A plugin's agents are matched to it by their `<plugin>:<agent>` name.

## Commands

| Command | Does |
| --- | --- |
| `/fueldeck` | open the pane |
| `/fueldeck usage` | print the full token table |
| `/fueldeck legend` | what each icon means |
| `/fueldeck close` | close it |
| `/fueldeck reset` | clear agents, checks, consults, log and the turn (cost, tokens, rate limits and compactions stay) |
| `/fueldeck layout auto\|compact\|wide\|mini` | override the layout for this session |

`/clear` starts the token totals over, as it does the session's cost.

## Configure

The options are Flightdeck's, under `pluginConfigs["fueldeck"].options`; see
[its README](../flightdeck/README.md#configure). `panels` defaults to
`main,fuel,architect,gate,agents,loops,receipt,log`; leave `fuel` out to hide the panel. Fueldeck adds
`labels`: `icons` (the default) or `words`.

## What it can reach

Everything Flightdeck can (see [its README](../flightdeck/README.md#what-it-can-reach)), plus:

| It sees | Through | Keeps |
| --- | --- | --- |
| each skill's prompt as it is injected | `skill.prompt` | the skill's name, its plugin and an estimated token count; never the text |
| the context breakdown | `$.session.usage({ breakdown: 'summary' })` | token counts per source and category |

Like Flightdeck it only watches: every hook passes its event on unchanged. It makes no network
requests (the `summary` breakdown is computed locally), and keeps nothing across sessions.

## Develop

```sh
claude --plugin-dir .
claude plugin validate .
claude plugin test .
```

The token accounting is in [`hooks/fuel.ts`](hooks/fuel.ts) as pure functions, tested in
[`tests/fuel.test.ts`](tests/fuel.test.ts); the rest is Flightdeck 0.4.0.

## Credits and license

Based on Flightdeck 0.4.0 (upstream commit `6150b9f`) by
[Stephen Casella](https://github.com/scasella), used under the MIT License. The original
copyright notice is kept in [LICENSE](LICENSE). Fueldeck's changes are also MIT.
