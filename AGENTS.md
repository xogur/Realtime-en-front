# Frontend project instructions

- Read `.codex-local/AGENTS.md` and `.codex-local/HANDOFF.md` before code changes; keep those local records ignored.
- `npm test` runs Vitest; `npx tsc --noEmit` checks TypeScript. Existing test-only TypeScript failures are recorded in the local handoff; distinguish them from changed-source failures.
- Mission learning v1 and guided v2 have separate validators/stores. Do not interpret v2 snapshots through the v1 contract.
- Guided voice begins only after server `guided_voice_ready`. `PROCESSING` starts at speech onset, so it must not close that utterance before its final transcript.
- Model/coach audio uses the acknowledged guide lease. Server role audio is allowed through that gate only for the matching role playback ID; completion requires both generation completion and natural audio drain.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
