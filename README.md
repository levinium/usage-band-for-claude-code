<img src="assets/icon.svg" width="72" alt="">

# Usage Band for Claude Code

**Your plan limits and context window, always in view above the prompt.**

A mod for the Claude Code desktop app. It adds one quiet row above the prompt showing how much
of your session, weekly and Fable limits you have used, when each one resets, and how full the
conversation's context is.

[![Latest release](https://img.shields.io/github/v/release/levinium/usage-band-for-claude-code?label=download&color=2B5CE6)](https://github.com/levinium/usage-band-for-claude-code/releases/latest)
![Platform](https://img.shields.io/badge/Claude%20Code-desktop-555)
[![CI](https://github.com/levinium/usage-band-for-claude-code/actions/workflows/ci.yml/badge.svg)](https://github.com/levinium/usage-band-for-claude-code/actions/workflows/ci.yml)

![The band](docs/band.svg)

This is an independent project. It is not made or supported by Anthropic.

## Install

In a terminal:

```bash
claude plugin marketplace add levinium/usage-band-for-claude-code
claude plugin install usage-band@usage-band-for-claude-code
```

Or, at the prompt of a Claude Code terminal session:

```
/plugin install usage-band --marketplace levinium/usage-band-for-claude-code
```

Answer `y` to add the marketplace, then pick a scope. **User** puts it in every session on the
computer, which is what you want for this.

Start a new session and the band is there. That is the whole installation. To update later,
run `claude plugin marketplace update usage-band-for-claude-code`. To remove it, run
`claude plugin uninstall usage-band`.

You need a Claude Code version that loads mods (function hooks). It was built and tested on
2.1.308. The limits shown are the ones a Claude subscription has; with an API key there are
none to show, and the bars stay grey.

### Without the command line

Each [release](https://github.com/levinium/usage-band-for-claude-code/releases/latest) also
carries `usage-band-v<version>.plugin`, the same mod as a single file, with a `.sha256` beside
it. Add it to your account wherever your Claude app offers to save a plugin file, and it follows
your account to other computers.

## Why this exists

How close you are to a limit is the kind of thing you want to know before it matters, not after
a message is refused. The desktop app does show your usage, but on a settings screen you have to
go and open. This puts the same numbers where you are already looking, small enough to ignore
until one of them turns amber.

## What it does

### One row, three limits

Each limit gets an icon and a bar: a clock for the 5-hour session window, a calendar for the
weekly limit across all models, and a spark for the weekly Fable limit. The bars stretch to
share the width of the window evenly. Each one is green below 50%, amber from 50% and red from
80%. The time left until that limit resets sits at the end of its bar.

### Hover for the figures

The row shows no numbers until you ask. Hover a bar and a label replaces it with the exact
figure and the exact reset time.

![Hovering the weekly bar](docs/band-hover.svg)

When the window is too narrow for the whole sentence, the label drops words until it fits:
first the long reset time, then the limit's name, down to the bare percentage.

### The ring is the context window

The ring at the left fills clockwise as the conversation's context fills, coloured by the same
rules as the bars. Hover it to see the percentage. **Click it to compact the conversation**, the
same as typing `/compact`. During a turn it waits and tells you so.

### In a terminal

The terminal has no pictures, so there the band draws as text: a coloured `█` bar per limit
with its reset time, and a circle glyph for the context that compacts on click.

## Status

Early, and honest about it.

**Works:** the bars, the colours, the reset times, the hover labels, the ring and its
click-to-compact, light and dark themes, resizing, and the text version in a terminal.

**Known rough edges:**

- The Fable bar shows only when your account reports a Fable limit. Until then it stays grey
  and its hover says "no data yet".
- The desktop app reports the band's width in text columns, not pixels, so the band converts
  at 8 pixels a column. If the bars stop short of the right edge or run past it, that number is
  the one to change, in `hooks/svg.ts`.
- When the mod is reloaded in the middle of a session, the app does not show the band again
  until the next turn starts. A new session shows it straight away.
- The figures update when a response arrives. While nothing is happening they do not change,
  even as a reset time passes.
- Mods are an early-access feature of Claude Code, and their interface may change between
  releases.

## Building from source

There is nothing to compile. The mod is TypeScript that Claude Code loads directly.

```bash
claude plugin validate .     # reads the manifests and the hooks module as a session would
claude plugin test .         # runs tests/band.test.tsx against the engine
python tools/package.py      # builds dist/usage-band-v<version>.plugin and its checksum
```

To try a change without installing it, start a session with `claude --plugin-dir .` from this
folder. When Claude Code loads the mod it writes its own type declarations into
`.claude-plugin/types/`, and from then on `tsc -p .` type-checks the code.

Releases are cut by tagging: bump `version` in `.claude-plugin/plugin.json`, add a section to
[CHANGELOG.md](CHANGELOG.md), then `git tag v0.2.0` and `git push origin main v0.2.0`. The
Release workflow refuses a tag that does not match the version, runs the checks, builds the
`.plugin` file and creates a **draft** release to review and publish.

## How it is put together

```
.claude-plugin/plugin.json        the mod's manifest
.claude-plugin/marketplace.json   makes this repository installable as a marketplace
hooks/register.tsx                reads the usage, draws the band, compacts on click
hooks/svg.ts                      the band, its hover labels and the ring, as SVG
hooks/ring-hit.tsx                an invisible layer over the ring that takes the click
types/index.d.ts                  the values the mod keeps for the session
tests/band.test.tsx               the drawing and the click, checked against the engine
tools/package.py                  builds the release file
```

### The design that matters

The band is one plain SVG image. Hover and clicks live in separate layers above it. That split
is what keeps it steady: the image only changes when a figure does, so moving the mouse never
redraws it, and a resize swaps one image for another instead of rebuilding a live frame. The
hover labels are opaque pills that appear and disappear over their bar.

An image cannot be clicked, so the ring carries an invisible element exactly its size that can.
That element reports the click to the mod, which asks Claude Code to compact.

The figures come from Claude Code itself: it reports the rate-limit windows and the context fill
with every response, and the mod redraws when one of them moves by a whole point. Nothing is
fetched, stored or sent anywhere.

## Licence

MIT. See [LICENSE](LICENSE).
