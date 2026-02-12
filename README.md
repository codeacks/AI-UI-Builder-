# Deterministic AI UI Builder

## 1. High-level architecture diagram (text)

```text
[Chat Intent] --> [API /api/agent]
                     |
                     +--> [Planner Stage]
                     |       - hard-coded planner prompt
                     |       - prompt-injection filter
                     |       - strict schema validation (zod)
                     |       - edit-aware merge or full regenerate
                     |
                     +--> [Generator Stage]
                     |       - component whitelist enforcement
                     |       - deterministic React code generation
                     |       - safe code validation
                     |
                     +--> [Explainer Stage]
                     |       - hard-coded explainer prompt
                     |       - rationale + change summary
                     |
                     +--> [Version Store]
                             - in-memory snapshots with version id
                             - rollback support

[Code Editor] --extract+validate plan--> [Live Preview Renderer]
[Version Panel] -----------------------> [Rollback]
[Chat History] <------------------------ [Agent responses]
```

## 2. Folder structure

```text
app/
  api/
    agent/route.ts
    versions/route.ts
  globals.css
  layout.tsx
  page.tsx
agent/
  planner.ts
  generator.ts
  explainer.ts
  prompts.ts
components/
  ui/index.tsx
  PreviewRenderer.tsx
lib/
  llm.ts
  logger.ts
  validation.ts
  versionStore.ts
tests/
  iterative-edit.example.ts
types/
  agent.ts
package.json
tsconfig.json
next.config.mjs
tailwind.config.ts
postcss.config.mjs
```

## 3. Run instructions

1. `npm install`
2. `npm run dev`
3. open `http://localhost:3000`

## 4. New capabilities

- Streaming AI responses (`POST /api/agent?stream=1` with NDJSON event stream)
- Diff view between any two saved versions (line-level LCS diff in UI)
- Strict component schema validation by component type and props
- Replayable generations (`POST /api/agent/replay` with `sourceVersionId`)
- Static analysis for generated code with score, metrics, and findings

Optional LLM mode:
- set `OPENAI_API_KEY`
- optional `OPENAI_MODEL`

## 5. Example intents

- `Build a dashboard with navbar, sidebar, chart and quick action card`
- `Add a settings modal and make the layout minimal`
- `Regenerate from scratch with a table-centric admin view`

## 6. Iterative edit test

Run:

```bash
npm run test:iterative
```
# AI-UI-Builder-
