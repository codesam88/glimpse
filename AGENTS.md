# AGENTS.md — project rules for Glimpse

Rules for any agent or developer working in this repo. Read once, follow
always. The plan of record is `.plan/variant-b-offline-viewer.md`.

## What this project is

Glimpse: a desktop markdown viewer for Linux (Tauri v2 + Svelte 5). Offline
rendering of markdown + diagrams (mermaid, PlantUML-JS, Graphviz-WASM,
wavedrom, nomnoml), live refresh on file change, review workflow
(CriticMarkup) on the rendered view, transclusion, menu-bar UI backed by an
action registry. Security model: renders untrusted files — DOMPurify after
every render, strict CSP, no network egress, narrow Tauri capabilities
(`src-tauri/capabilities/default.json`; any capability change needs a
justification comment in the file).

## Development environment

Self-contained — never resolve dependencies from outside the repo; never
touch other project directories. Scratch scripts: `e2e/scratch/` (gitignored)
or `/tmp/opencode`. System prereqs (Tauri Linux): libwebkit2gtk-4.1-dev,
libgtk-3-dev, librsvg2-dev, patchelf. Commands live in the README
("Development"); the canonical e2e check is `npm --prefix e2e test` against a
preview server on `127.0.0.1:4173`.

## Workflows

### Branching / commits

- `main` is protected: linear history, no force-push, required checks
  (Web build, trixie deb, ubuntu24 deb). Owner may push directly.
- **Commit in steps**: one logical unit per commit (feature / fix / types /
  test / chore). Never amend pushed history. Commit messages: imperative,
  scoped prefix (`feat(web):`, `fix(tauri):`, `ci:`, `types:`, `test:`,
  `docs:`, `chore:`).
- Behavior contract changes land in the **same commit** as the behavior
  (tests + `docs/markdown-flavor.md` + fixtures).

### Releases (automatic)

- Push to `main` → Release workflow builds Trixie deb + Ubuntu 24.04 deb and
  publishes/replaces the **rolling release** `Glimpse v0.1.0+head.<ref>`
  (prerelease, moving `rolling` tag).
- Tag `vX.Y.Z` → real release: all bundles incl. AppImage, per-distro
  filenames, `sha256sums.txt`. Changelog entry required in the same or prior
  commit; versions bumped in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`,
  `web/package.json`, `e2e/package.json` together.

### Delegation

- Implementation/test work goes to sub-agents: `worker-beam` primary,
  `worker-deepseek` fallback. One bounded task per invocation; the brief
  carries all needed context (agents start fresh).
- Workers never commit. The parent **verifies claims independently**
  (run the gates; spot-check with its own Playwright probes) before
  committing. Unverified "done" claims have repeatedly been wrong — trust
  transcripts, not summaries.
- If a worker edits outside its brief or the repo, stop it and clean up.

## Quality gates (all blocking in CI)

`npm test` (unit + property) · `npm run lint` (eslint) · `npm run check`
(svelte-check: 0 errors) · `npm run types` (tsc on pure modules) ·
`cargo fmt --check` + `cargo clippy -D warnings` · actionlint + shellcheck ·
cargo-deny (licenses/bans/sources) · license-checker (npm) · offline-egress
check · canonical e2e. Run the full set locally before pushing; local/CI
parity is required (CI runs the same commands in containers — Trixie floor).

## Testing practice

- **Property-based first** (fast-check): every test asserts a *law* derived
  from the spec — roundtrip, idempotence, totality, hygiene, determinism.
  No vacuous tests (nothing that asserts the implementation against itself;
  "does not throw" only as a totality property).
- New/changed suites get a **mutation check**: temporarily break the
  implementation, show the law fails, restore. A suite that cannot fail is
  decoration.
- Contract changes → update laws in the same commit.
- DOM/Tauri-bound behavior: Playwright e2e, not unit mocks. Pointer tests
  use `locator.click({ position })` (auto-scroll) — never raw viewport
  coordinates. Extend `e2e/verify.js` for recurring checks.
- Regression found in review → pin with a test before fixing.

## Documentation

- Describe **what is**, not history or alternatives ("what is", never
  "Variant B"-style codenames or rejected-design prose in user docs).
- `docs/markdown-flavor.md` is the user-facing behavior contract for
  markdown syntax — keep in sync with the parser in the same commit.
- Tool digests (per-tool knowledge: mental model, gotchas, sources) live in
  `docs/briefs/` — one file per significant tool, referenced from plans.
- `README.md`: user-facing (what/features/install/dev quickstart/credits).
- `SECURITY.md`: threat model + accepted-risk ledger; every accepted risk
  gets an entry with reasoning and tracking note.

## Planning

- `.plan/` holds plan files (frontmatter: `status`, `priority`, `area`;
  status flow: idea → open → in-progress → done; blocked names the blocker).
- No implementation without a plan for non-trivial work: problem/purpose,
  strategy with rejected alternatives + verified blockers, steps with
  scope/done-criteria/left-outs.
- Plans are living documents: progress lands in the file as steps complete.
- Open product decisions go to the user before build; record the answers in
  the plan.
