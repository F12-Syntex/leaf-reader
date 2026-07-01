@AGENTS.md

## Git workflow

Commit and push automatically after each logical change — don't wait for
explicit approval each time. Use Conventional Commits (`feat(scope): summary`,
`fix(scope): summary`, `chore(scope): summary`, etc.), and include the current
`package.json` version in the commit description when it changed, e.g.
`feat(reader): progressive chapter formatting via OpenRouter (v0.3.0)`. Bump
`package.json`'s `version` for any user-visible feature/fix and keep its
`description` accurate.
