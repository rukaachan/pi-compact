# pi-compact

Compact, semantic tool rows for Pi. Every tool call collapses to one intent line, plus a status line only when it adds signal, and ctrl+o restores Pi's full view.

This package is not published to npm. It is meant to be used from a local checkout.

## Requirements

- Pi 1.4.0 or newer, below 2.0
- Node.js 22.19 or newer

Tested with Pi 1.4.0 and 1.5.2.

## Install (local)

Clone or copy this directory somewhere permanent, then install it by path:

```bash
pi install /path/to/pi-compact
```

Restart Pi or run `/reload`. Check that Pi sees the package:

```bash
pi list
```

Pi records the package path in `~/.pi/agent/settings.json` and loads the extension from that directory. Moving or deleting the directory breaks the install. Run `pi install` again with the new path. Pi reads the files in place, so after `git pull` you only need `/reload`.

Project scope is also available. Pi loads it only after you trust the project:

```bash
pi install --local /path/to/pi-compact
```

Try it without installing:

```bash
pi -e /path/to/pi-compact
```

Remove it with:

```bash
pi remove /path/to/pi-compact
```

Pi loads the extension with jiti, so there is no build step. Run `npm ci` to get the dev dependencies for tests and type checking.

## Use

Pi's built-in rows print code, command previews, nested call lists, output previews, and truncation notices. On a busy session that is a lot of vertical space for information you rarely read.

pi-compact keeps the useful part and hides the rest:

| State     | Collapsed                                                              | Expanded (`ctrl+o`)                                                                           |
| --------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| All tools | One intent line, plus a status line for counts, exit codes, and timing | Pi's built-in renderer, or the full arguments and raw output when no built-in renderer exists |
| Failures  | One error line, so a broken call is visible without expanding          | Full error output                                                                             |

The extension only changes rendering. It does not replace tools, change their schemas, or alter execution.

Pi draws the row: its own `Box` supplies the background, the one-space indent, and a blank line above and below, and its `Spacer` adds the usual gap before each call. The extension only returns the text, so padding, colours, and spacing are exactly Pi's defaults. A call that never settles keeps the `… running` marker until its result arrives.

```text
$ cargo test --workspace
✗ exit 101 · 2.4s

read src/app.ts:10-40

grep TODO · src · *.ts
✓ 12 matches
```

## What changes

Codemode shows the nested intent, not the JavaScript:

```text
codemode $ cargo build --release
✓ 1 call
```

A `cd … && TMPDIR=… CARGO_TARGET_DIR=…` prefix is dropped, so the command that matters survives. Paths held in constants and loops keep their names, and an inline interpreter script collapses to its flag:

```text
codemode read src/app.ts
codemode read ~/repo/src/* ×7
codemode $ node -e …
```

Several nested calls are joined; many calls become a count:

```text
codemode write src/a.ts + read src/b.ts
✓ 2 calls
codemode 5 calls: bash, read, grep +2
✓ 5 calls · 1 failed
```

Bash, file, and search tools report what they did. A long command wraps to the row width, the same way Pi wraps its own rows:

```text
$ cargo build --release
✓ done · 1.2s

$ find crates/pi-bot-daemon crates/pi-bot-ui crates/pi-bot-store -name '*.rs' | sed …
✓ done · 1.4s

read src/app.ts:10-40

edit src/app.ts · 3 edits
✓ 3 edits

grep TODO · src · *.ts
✓ 12 matches
```

Empty results are explicit:

```text
find *.rs · crates
✓ no files

ls src
✓ empty

grep TODO · src
✓ no matches
```

Unknown and MCP tools get a generic compact row from the most meaningful argument, so no tool falls back to a wall of JSON. Images still render through Pi's built-in view. Without a built-in renderer, `ctrl+o` shows the full arguments as JSON and the raw result text.

## Rules

- Tool names are shortened only in the row title (`ask_user_question` → `ask`, `mcp__server__tool` → `server:tool`).
- Paths are shown relative to the project or home directory.
- A value too long for the row wraps inside the box; `ctrl+o` still shows the full value.
- Codemode fields follow local constants and literal loops; inline `node -e` and `python -c` scripts become `node -e …`.
- Timing appears only at one second or more; sub-second rows skip the noise.
- Failures keep one red line with the actionable message.
- Without a built-in renderer, `ctrl+o` shows the full arguments as JSON and the raw result text.
- Empty results say `no files` for `find`, `empty` for `ls`, and `no matches` for `grep` and `multi_grep`.

## Cost

A renderer returns a `Text` line, so Pi's box does the painting and keeps its own per-width cache. A summary is built once per result and reused while the result object stays the same, even when the output is thousands of lines.

Codemode costs are added as integer micro-dollars, so repeated small costs do not drift.

## Scope

- `codemode`: nested calls parsed from `tools.<name>({...})`, with constant, loop, and shell prefix cleanup.
- `bash`: command cleanup, exit code, timeout and truncation status.
- `read`, `write`, `edit`, `grep`, `find`, `ls`, `multi_grep`: paths, line ranges, match and entry counts.
- `ask_user_question`, `tool_search`, `recall`, `advisor`, goal, task, and MCP tools: semantic one-liners.
- Every other tool: generic argument summary.
- In the interactive `/export` HTML, Pi uses its own template for `bash`; compact rows apply to the other tools. The `pi --export` CLI does not load extensions.

## Develop

```bash
npm ci
npm run verify
npm run test:coverage
npm run lint
npm run format
```

`verify` runs the typecheck, Oxlint, the Oxfmt check, the coverage suite with 100% thresholds, and the package check. Lint and format use the [Oxc](https://oxc.rs) family: `oxlint` and `oxfmt`. The tests cover command and code summarization plus the collapsed and expanded renderer behavior. Pi loads the extension with jiti, so there is no build step.

## License

MIT
