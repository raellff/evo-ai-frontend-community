# Story EVO-995: Agent Creation UX — Role Dropdown & Onboarding Flow

Status: in-review

## Story

As an end user creating an AI agent,
I want the wizard to validate required fields inline and let me create custom tools without losing my progress,
so that I can complete agent setup without hitting silent errors or navigation dead-ends.

## Acceptance Criteria

1. Role field is required in the LLM wizard flow; empty submission is blocked with inline error message.
2. Instructions field has an optional AI helper (Generate / Review) that drafts or improves the prompt.
3. "Add tool" dialog has an inline "Create new tool" sub-dialog that preserves wizard state.
4. Agent-type cards show clear differentiators per type across all supported locales.
5. Field-level validation is surfaced inline in all wizard steps.

## Tasks / Subtasks

- [x] AC #1 + #5 — Add required validation to `Step4_RoleGoal.tsx` (AC: 1, 5)
  - [x] Inline error message on Continue click when role is empty
  - [x] Continue button disabled while role is blank
  - [x] Remove skip button that allowed empty role submission
- [x] AC #3 — Rework "Create new tool" in `CustomToolsSelectionDialog.tsx` (AC: 3)
  - [x] Add `showCreateDialog` state
  - [x] Open `CustomToolForm` in a sub-dialog on click
  - [x] On successful creation: reload tool list, auto-select new tool
  - [x] Remove all `navigate('/agents/custom-tools')` calls
- [x] AC #4 — Fix translation inconsistencies (AC: 4)
  - [x] pt-BR + pt: "chata" → "conversa" in LLM card description
  - [x] pt-BR, pt, es, fr, it: translate Sequential/Parallel labels
- [x] Accessibility — `Step5_Instructions.tsx`
  - [x] Remove `<span tabIndex>` wrappers around disabled buttons
  - [x] Add `aria-disabled` directly to Button elements
  - [x] Remove redundant `onClick` guard (dead code)
- [x] Tests
  - [x] `Step5_Instructions.spec.tsx` — disabled/aria-disabled state per OpenAI config
  - [x] `CustomToolsSelectionDialog.spec.tsx` — header button presence + inline sub-dialog flow

## Dev Notes

- Role is always a free-text `<Input>` across all agent creation entry points (`Step4_RoleGoal`, `ProfileSection`, `BasicInfoForm`). No dropdown exists; the original 500 was caused by empty-string `role` reaching the backend.
- `CustomToolForm` already existed at `src/components/customTools/CustomToolForm.tsx` with `onSubmit: (data: CustomToolFormData) => void`. `CustomToolFormData extends CustomToolCreate`, so it is directly compatible with `createCustomTool()` from `customToolsService`.
- Toast messages for tool creation use the `customTools` i18n namespace (`messages.createSuccess`, `messages.createError`), loaded via a second `useLanguage('customTools')` call aliased as `tTools`.
- Loop label kept as "Loop" across all locales — consistent with existing usage throughout the codebase (e.g., "Agente Loop", "Agentes em Loop").
- Test runner: Vitest v2.1.8 with jsdom. Radix UI Dialog renders correctly in jsdom without mocking the design system.

### Project Structure Notes

- Wizard steps: `src/pages/Customer/Agents/Agent/wizard/`
- Custom tools dialog: `src/components/ai_agents/Dialogs/`
- Custom tool form: `src/components/customTools/`
- i18n: `src/i18n/locales/{en,pt-BR,pt,es,fr,it}/aiAgents.json`

### References

- Linear issue: EVO-995
- PR: https://github.com/evolution-foundation/evo-ai-frontend-community/pull/45
- Review comment: daniel.paes@etus.com.br, 2026-05-11

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Investigated all role field usages — confirmed no dropdown exists anywhere; text input is the canonical implementation.
- All 5 ACs covered in this delivery (previous PR #45 covered ACs 2 and 4; this delivery covers 1, 3, 5 plus all review corrections).

### File List

- `src/pages/Customer/Agents/Agent/wizard/Step4_RoleGoal.tsx`
- `src/pages/Customer/Agents/Agent/wizard/Step5_Instructions.tsx`
- `src/pages/Customer/Agents/Agent/wizard/Step5_Instructions.spec.tsx`
- `src/components/ai_agents/Dialogs/CustomToolsSelectionDialog.tsx`
- `src/components/ai_agents/Dialogs/CustomToolsSelectionDialog.spec.tsx`
- `src/i18n/locales/pt-BR/aiAgents.json`
- `src/i18n/locales/pt/aiAgents.json`
- `src/i18n/locales/es/aiAgents.json`
- `src/i18n/locales/fr/aiAgents.json`
- `src/i18n/locales/it/aiAgents.json`
