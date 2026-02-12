# Deterministic AI UI Builder

AI-powered UI generation system that converts natural-language intent into working React UI code and live preview using a fixed deterministic component library.

## Architecture Overview

```text
User Prompt (Chat)
   |
   v
POST /api/agent (streaming or non-streaming)
   |
   +--> Planner (agent/planner.ts)
   |      - intent parsing
   |      - component/layout planning
   |      - edit-aware plan updates
   |
   +--> Generator (agent/generator.ts)
   |      - whitelist enforcement
   |      - React code generation
   |      - code safety checks
   |
   +--> Explainer (agent/explainer.ts)
   |      - plain-English rationale
   |      - change summary for edits
   |
   +--> Version Store (lib/versionStore.ts)
          - snapshot persistence in-memory
          - rollback and replay support

Frontend (app/page.tsx):
- Left panel: chat + mode controls
- Center: live preview
- Right panel: code editor + explanations + logs + versions
```

## Agent Design and Prompts

Prompts are separated and hard-coded in:
- `agent/prompts.ts`
  - `plannerSystemPrompt`
  - `generatorSystemPrompt`
  - `explainerSystemPrompt`

Pipeline stages:
1. Planner
   - Input: natural-language intent + optional prior plan
   - Output: structured `UIPlan` JSON
2. Generator
   - Input: plan
   - Output: React component code using only `@/components/ui`
3. Explainer
   - Input: intent + plan + code
   - Output: reasoning and change summary

## Deterministic Component System Design

Fixed component library (no AI-generated new components):
- `Button`
- `Card`
- `Input`
- `Table`
- `Modal`
- `Sidebar`
- `Navbar`
- `Chart`

Definitions:
- `components/ui/index.tsx` (fixed implementations)
- `types/agent.ts` (`ALLOWED_COMPONENTS`)

Enforcement:
- Planner and generator constrained by whitelist
- Schema and semantic validation in `lib/validation.ts`
- Generated code must import from `@/components/ui` only

Prohibited behavior:
- Inline styles in generated code
- `dangerouslySetInnerHTML`
- Non-whitelisted imports/components

## User Story Coverage

- Describe UI in plain English: implemented in chat input
- See working UI immediately: live preview updates after generation
- Iterative modification: Modify mode with prior version context
- Understand AI decisions: explanation + logs in right panel
- Roll back to previous versions: rollback action per snapshot

## Safety and Validation

- Prompt injection filter: `filterPromptInjection`
- Plan schema + per-component prop schema validation: `validatePlan`
- Safe render parse validation before preview: `parsePlanFromCode`
- Generated output safety checks: `validateGeneratedCode`
- Static analysis report: `analyzeGeneratedCode`

## Optional Bonus Coverage

- Streaming AI responses: `/api/agent?stream=1`
- Diff view between versions: line-level diff UI
- Component schema validation: zod-based strict checks
- Replayable generations: `/api/agent/replay`
- Static analysis of AI output: score/findings/metrics

## Run Instructions

1. Install:
   - `npm install`
2. Start dev server:
   - `npm run dev`
3. Open:
   - `http://localhost:3000`

Build validation:
- `npm run build`

Iterative behavior check:
- `npm run test:iterative`

## Environment Variables

Use `.env` locally and Vercel environment settings:
- `OPENAI_API_KEY` (required for live LLM mode)
- `OPENAI_MODEL` (optional, defaults in code)

## Known Limitations

- Version storage is in-memory; data resets on server restart.
- Planner fallback is deterministic heuristic logic when LLM is unavailable.
- Generator emits full code for each version; it does not produce textual patch hunks.
- Preview supports only the fixed deterministic component set.

## What I Would Improve With More Time

- Persist versions to a database with user/session scoping.
- Add richer AST-level structural diff for plan and generated code.
- Add stronger planner evaluation tests with golden prompt fixtures.
- Add policy tests to prevent regressions in deterministic constraints.
- Add better production observability (traces, metrics, error dashboards).

## Repository Structure

```text
app/
  api/
    agent/route.ts
    agent/replay/route.ts
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
```
