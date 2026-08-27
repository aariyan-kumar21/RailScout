# Rules — RailScout

These rules apply to every prompt in this project. Read this file, PRD.md, SCHEMA.md, and TECH_STACK.md before writing any code. If a request conflicts with these rules, flag it instead of silently proceeding.

## Hard Constraints (never violate these)
1. **Never write code that automates, scrapes, or interacts with irctc.co.in directly.** All train/availability data comes only from the RailRadar API. The only allowed interaction with IRCTC's own site is opening a link in a new tab for the user to manually search/book.
2. **Never implement any booking, checkout, or payment functionality.** This tool only displays availability information.
3. **Never expose the RailRadar API key on the client side.** It must only ever be read from environment variables in the backend. Do not hardcode it, log it, or send it in any response to the extension.
4. **Do not add a database.** Use in-memory caching only, as defined in SCHEMA.md.
5. **Do not add user accounts, login, or authentication.** This is a single-user local/demo tool.

## Scope Discipline
6. Stick to the MVP feature set defined in PRD.md. If a stretch goal (route visualization, content-script overlay, multi-train routing) seems useful, mention it as a suggestion — don't build it unless explicitly asked.
7. Follow the request/response shapes in SCHEMA.md exactly. If a change to the schema is needed, explain why before implementing it, don't change field names/types silently.
8. Follow the stack decisions in TECH_STACK.md (Node + Express, vanilla JS extension, no frameworks unless justified). Don't introduce new libraries/frameworks without flagging the addition and reason.

## Workflow
9. Work in small, reviewable increments — one feature or file at a time, not the whole project in one shot.
10. After implementing something, briefly summarize what was built and how to test it manually (e.g. a curl command or a test input) before moving to the next piece.
11. If a required detail is missing or ambiguous (e.g. exact station code format), ask rather than guessing silently.
12. Write comments explaining non-obvious logic (especially the station-scanning algorithm) — this project needs to be walk-through-able in a technical interview.

## Code Quality
13. Use clear, descriptive naming (no single-letter variables outside trivial loop counters).
14. Handle errors explicitly — no silent failures or swallowed exceptions.
15. Keep the backend and extension code in clearly separated folders (`/backend`, `/extension`).
16. Update README.md's Setup section as the project becomes runnable, so it never goes stale.
