# Agent Workflow

This repository uses a staged agent workflow for issue-driven delivery.

The local custom agents are:
- `refiner`
- `pm`

The review agent is system-wide and is not defined in this repository.

## Purpose

Use this workflow to keep planning, execution coordination, implementation, and review separated by responsibility.

The goal is to:
- refine work before coding starts,
- coordinate issue execution after refinement,
- keep implementation focused on already-approved scope,
- route completed work through structured review before closure.

## Workflow Order

1. `refiner`
2. `pm`
3. Coding agent
4. System-wide `review` agent
5. `pm` for closure coordination when needed

## Role Boundaries

### `refiner`

Use `refiner` when:
- an epic or issue is still ambiguous,
- acceptance criteria are not testable,
- dependencies are unclear,
- RFC-level decisions may still be unresolved,
- the work needs to be split into assignment-ready child issues.

`refiner` is responsible for:
- ambiguity removal,
- RFC gating,
- AC and DoD definition,
- dependency mapping,
- issue decomposition,
- implementation-ready issue specs.

`refiner` should stop when:
- an RFC blocker exists,
- the issue already appears refined and is ready for delivery coordination,
- coding work would be the next step rather than more specification work.

### `pm`

Use `pm` when:
- refined issues need execution sequencing,
- work needs to be assigned or recommended for assignment,
- dependency-aware rollout needs to be coordinated,
- review findings need to be translated into next actions,
- closure readiness needs to be assessed against AC and DoD.

`pm` is responsible for:
- assignment readiness checks,
- execution ordering,
- issue ownership coordination,
- review routing,
- blocker escalation,
- closure-readiness assessment.

`pm` should send work back to `refiner` when:
- AC or DoD is still ambiguous,
- issue boundaries are not safe for assignment,
- a new architecture or contract question appears,
- dependencies are unclear because refinement was incomplete.

### Coding agent

Use a coding agent when:
- the issue body is already implementation-ready,
- dependencies are satisfied,
- scope is explicit enough to implement without reopening product or architecture questions.

The coding agent is responsible for:
- implementation,
- tests,
- validation,
- documentation updates required by the issue,
- preserving repository guardrails while completing the assigned scope.

The coding agent should escalate back to `pm` or `refiner` when:
- the issue contract is incomplete,
- review requests conflict with issue non-goals,
- a new RFC-class blocker emerges,
- a dependency issue changes the shared contract mid-stream.

### System-wide `review` agent

Use the system-wide `review` agent after implementation is ready for product and engineering review.

The `review` agent is responsible for:
- checking AC and DoD coverage,
- finding regressions and merge risks,
- identifying missing validation or tests,
- assessing readiness to merge.

The `review` agent is not the owner of issue assignment, sequencing, or closure decisions. Those remain with `pm`.

## Recommended Hand-off Pattern

### 1. Start with `refiner`

Input:
- epic or issue URL or number,
- repo context,
- non-goals,
- deadlines or rollout constraints if relevant.

Expected output:
- refined issue body or epic,
- child issue breakdown if needed,
- explicit AC, DoD, and non-goals,
- RFC blockers or decisions,
- dependency order.

### 2. Move to `pm`

Input:
- refined epic or issue set,
- resolved RFCs,
- delivery or ownership constraints.

Expected output:
- assignment readiness status,
- execution order,
- parallelization guidance,
- owner recommendations,
- review path,
- blocker tracking plan.

### 3. Run coding work

Input:
- one assignment-ready issue,
- any dependency context that is already resolved.

Expected output:
- implementation,
- validation evidence,
- updated docs and tests as required,
- code ready for review.

### 4. Run system-wide `review`

Input:
- PR URL or PR number,
- any issue or epic references needed for context.

Expected output:
- findings ordered by severity,
- residual risks,
- merge-readiness recommendation.

### 5. Return to `pm` if coordination is still needed

Use `pm` again when:
- review findings need to be assigned or sequenced,
- follow-up issues need to be created,
- closure readiness needs a final evidence check,
- multiple child issues need coordinated completion handling.

## Decision Rules

Use `refiner` instead of `pm` when the main problem is specification quality.

Use `pm` instead of a coding agent when the main problem is coordination rather than implementation.

Use the coding agent instead of `pm` when the issue is already clear and the next useful action is code.

Use the system-wide `review` agent after implementation, not before refinement.

## Minimal Examples

### Example: ambiguous epic

Start with `refiner`.

Do not send this directly to `pm` or a coding agent.

### Example: refined epic with five child issues

Run `pm` to determine:
- which child issue starts first,
- which issues can run in parallel,
- which issue should wait for contract-producing work.

### Example: implemented issue with open PR

Run the system-wide `review` agent.

If review finds follow-up work or blocking changes, return to `pm` for coordination.

## Repository Guardrails

Across all stages:
- preserve the destination-first loading model,
- do not reintroduce unbounded trail loading,
- respect explicit non-goals,
- keep RFC decisions authoritative until a new blocker is opened,
- require evidence for issue closure instead of relying on status language alone.