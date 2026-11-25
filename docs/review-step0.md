# Review Step 0 — CriticMarkup render record

- markdown-it-critic version: 1.0.1 (exact pin, MIT)
- Plugin order: taskLists, footnote, deflist, texmath, markdownItCritic (silent-mode wrapped), diagramPlugin
- DOMPurify HTML_PROFILE: unchanged (del/ins/mark/span.critic.comment pass)
- Build: `npm --prefix web run build` exit 0 (built ~3.1s)
- Offline: dev + preview = 0 remote requests, 0 page errors
- Render evidence: screenshot /tmp/opencode/review-step0.png; all five marks render; fence-internal marks stay literal; broken marks show source
- Bundle: total JS 10.76 MB (index chunk 1.63 MB)
