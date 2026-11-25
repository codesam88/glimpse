# Security Policy — Glimpse

## Reporting a vulnerability

Do **not** open a public issue for security problems.

Use GitHub's private vulnerability reporting:
<https://github.com/codesam88/glimpse/security/advisories/new>

Include: affected version/commit, reproduction steps, impact assessment.
You will get an acknowledgment within 7 days. Fixes land as a patch release
when a fix is ready; credit given unless you prefer otherwise.

## Scope

Glimpse is a desktop markdown viewer that renders **untrusted local files**.
The primary threat model is a malicious markdown document attempting to
escape the render sandbox. Out of scope: local attacks requiring an already-
compromised OS user.

### Security-relevant design points (where to look)

| Area | Decision | Rationale / risk |
|---|---|---|
| CSP | `default-src 'self'`, no remote origins | no egress by design; `unsafe-eval` + `wasm-unsafe-eval` currently required by wavedrom/TeX — tracked as tech debt |
| Sanitization | DOMPurify after every render, SVG profile; mermaid runs with `securityLevel: 'strict'`, `htmlLabels: false` (no `foreignObject`) | diagram output is untrusted SVG |
| fs plugin scopes | `$HOME/**`, `$TEMP/**`, `/**` (read + write-text) | Glimpse is an arbitrary-path viewer; widest-scope tradeoff is deliberate and documented in `src-tauri/capabilities/default.json` |
| Diagram cache | keyed by (lang, theme, source hash) | prevents stale-SVG theme bugs |
| Edit/save | only via explicit user action (Save / Ctrl+S); disk-conflict banner guards watcher clobber | write access is narrow by design |

### Known accepted risks

- **RUSTSEC / GHSA-wrw7-89jp-8q8g (glib < 0.20, `VariantStrIter` unsoundness,
  medium):** transitive via Tauri's gtk-0.18 stack; the patch (glib 0.20)
  is semver-incompatible with gtk 0.18, so it lands only when Tauri bumps
  the gtk-rs stack (tracked: Tauri 2.12.7 is latest stable, still gtk 0.18).
  Glimpse never calls `VariantStrIter`; the unsound iterator is not reachable
  from attacker-controlled markdown content. Accepted until upstream ships
  the fix — Dependabot will raise the cargo bump automatically.
- `unsafe-eval` in CSP while wavedrom is a bundled renderer.
- Widest-practical fs scope (above) — a compromised webview could read/write
  user files within those scopes. Mitigated by strict sanitization upstream.
- Review-mode source mapping uses first-occurrence text match within a block.

## Supported versions

Only the latest tagged release + `main`.
