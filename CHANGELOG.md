# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## How versioning works here

The version lives in one place: `version` in `.claude-plugin/plugin.json`. The release file is
named from it and the Release workflow checks the tag against it.

**To release a new version:**

1. Bump `version` in `.claude-plugin/plugin.json`.
2. Add a section below describing what changed.
3. Commit, then tag and push: `git tag v0.2.0` and `git push origin main v0.2.0`.
4. The Release workflow refuses a tag that does not match the version, validates and tests
   the mod, builds `usage-band-v0.2.0.plugin` with its checksum, and creates a **draft**
   release.
5. Edit the draft's notes, check the file, and publish it.

Installed copies pick up a new version with `claude plugin marketplace update`.

## [0.1.3] - 2026-10-28

### Added
- The picture version of the row in the VS Code extension, which had been getting the
  terminal's text version. Clicking the ring compacts there too.

## [0.1.2] - 2026-10-27

### Fixed

- Clicking the ring now compacts in the desktop app. Its sessions run headless, where the
  mod's compaction call is not available, so the ring runs `/compact` there instead.

## [0.1.1] - 2026-10-27

### Fixed

- When compaction cannot start, the toast now gives the reason Claude Code reported instead of
  only "Compaction could not start".

## [0.1.0] - 2026-10-27

### Added
- A row above the prompt with a bar for each plan limit: the 5-hour session window, the
  weekly limit and the weekly Fable limit. Green below 50%, amber from 50%, red from 80%,
  with the time left until each resets.
- A ring for the context window, filling clockwise. Clicking it compacts the conversation.
- Hover labels with the exact percentage and reset time, shortened to fit narrow windows.
- A text version of the same row for terminal sessions.
