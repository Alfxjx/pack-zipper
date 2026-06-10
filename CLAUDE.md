# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`pack-zipper` is an [oclif](https://oclif.io) v3 CLI (`pkzip`) that packages a build output directory into a versioned zip file. It reads a `manifest.json` from the project subfolder, recursively zips its contents, and writes a Windows-named zip into the same `dist` directory.

- Package: `pack-zipper` v2.0.1, ESM (`"type": "module"`), Node ≥ 18
- Bin: `pkzip` → `./bin/run.js`; dev entry: `./bin/dev.js` (uses `ts-node`)
- Repo: `alfxjx/pack-zipper`

## Common Commands

- `yarn build` — `shx rm -rf dist && tsc -b` (clears dist, type-checks + emits to `dist/`)
- `yarn lint` — `eslint . --ext .ts` (also runs automatically as `posttest`)
- `yarn test` — `mocha --forbid-only "test/**/*.test.ts"` (60s timeout, ts-node ESM loader via `.mocharc.json`)
- `yarn prepack` — `build && oclif manifest && oclif readme` (regenerates `oclif.manifest.json` and README)
- `yarn version` — `oclif readme && git add README.md` (auto-run on `yarn version`)
- `bin/dev.js <args>` — run a command directly from TypeScript without building (e.g. `node bin/dev.js zip --name foo`)
- `bin/run.js <args>` — run the built CLI (requires `yarn build` first)

To run a single test file: `npx mocha --forbid-only "test/commands/zip.test.ts"`.

## Architecture

Single-command oclif CLI. All real code lives in `src/commands/zip.ts`; `src/index.ts` is a one-line re-export of `@oclif/core` and is not used at runtime (oclif loads commands directly from `dist/commands`).

### The `zip` command (`src/commands/zip.ts`)

Inputs (from CLI):
- `--name` / `-n` (required) — package/project name; used as the key to locate `./<dist>/<name>/manifest.json`
- `--type` / `-t` (default `version`) — controls output filename format
- `--dist` / `-d` (default `dist`) — base directory
- Positional `file` arg is declared but unused

Flow:
1. Read `./<dist>/<name>/manifest.json` and parse it as `IManifest` (`name`, `version`, `branch`, `buildTime`, `commitID`, `comment`).
2. Recursively walk `<cwd>\<dist>\<manifest.name>`, adding every file to a `JSZip` instance with paths relative to that root.
3. Generate the buffer (DEFLATE / nodebuffer) and write to `<cwd>\<dist>\<filename>`.
4. Filename:
   - `type === 'version'`: `<name>_Windows_<version>_<moment(buildTime, "YYYY-MM-DD-HH-mm-ss")>.zip`
   - otherwise: `<name>_Windows_<moment(now, "YYYYMMDDHHmm")>.zip`

Uses `ux.action.start/stop` to show a progress spinner, then returns the absolute zip path.

### Windows-specific path handling

`src/commands/zip.ts` hard-codes backslash separators when joining `cwd`, `dist`, and the package name (e.g. `` `${cwd}\\${dist}\\${manifest.name}` ``). The `build/` directory in the repo is a sample run of this tool on Windows. The output filenames are also hard-coded to `_Windows_`. If you make this tool portable to non-Windows, all of these joins need `path.join` and the `_Windows_` segment becomes platform-dependent.

### oclif config (from `package.json`)

- `commands`: `./dist/commands` (TS source compiles here; tests use ts-node and run from `src/`)
- `bin`: `pkzip`, `topicSeparator`: `" "` (space, not `:`) — so sub-commands would be `pkzip topic command`, not `pkzip topic:command`
- Loaded plugins: `@oclif/plugin-help`, `@oclif/plugin-plugins`

### Tests (`test/`)

- Uses `@oclif/test` + `chai` `expect`. `.mocharc.json` registers `ts-node` and the ESM loader.
- `test/commands/zip.test.ts` — the only test for the real command. **Note: it is stale scaffolding** that still asserts `hello world` output for `pkzip zip` / `pkzip zip --name jeff`; the actual `zip` command does not print those strings, so this test does not reflect current behavior and likely fails.
- `test/commands/hello/index.test.ts` and `test/commands/hello/world.test.ts` — leftover from the oclif `hello-world` template; there is no `hello` command in `src/commands/`, so these are dead tests.
- `test/tsconfig.json` extends the root `tsconfig.json` with `noEmit: true` and a project reference.

### TypeScript / lint config

- `tsconfig.json`: `target: es2022`, `module: Node16`, `moduleResolution: node16`, `strict: true`, `outDir: dist`, `rootDir: src`. ESM under `ts-node` (`"ts-node": { "esm": true }`).
- ESLint extends `oclif`, `oclif-typescript`, `prettier` (from `.eslintrc.json`); ignores `/dist` and `/tmp`.
- Prettier config: `@oclif/prettier-config`.

### CI (`.github/workflows/`)

- `test.yml` — runs on push (excluding `main`) and manual dispatch, delegates to `oclif/github-workflows/.github/workflows/unitTest.yml@main`.
- `onPushToMain.yml` — version/tag/GitHub release on push to `main`.
- `onRelease.yml` — npm publish on GitHub release.
- `automerge.yml`, `failureNotifications.yml`, `manualRelease.yml`, `notify-slack-on-pr-open.yml` — release automation helpers.
- Dependabot (`.github/dependabot.yml`) — weekly npm updates, `fix(deps)` for runtime, `chore(dev-deps)` for dev, ignores semver-major.

### Repo conventions

- `build/` is gitignored but a sample `cari.scada.products.people.orientation.ui_Windows_202310091532.zip` plus its source directory is checked in as a reference output of running the tool. Do not treat its contents as source.
- `dist/` is gitignored and produced by `yarn build`. `oclif.manifest.json` is generated by `prepack` and removed by `postpack`.
- The `package.json` description still reads `"oclif example Hello World CLI (ESM)"` — leftover from the oclif template; the `oclif.topics.hello` entry has the same origin and is also dead.
