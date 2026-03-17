# VS Code Copilot Workflow

This repo uses VS Code Copilot-native chat customizations for planning, review, and future Apple workflow support.

## Workspace Layout

1. `AGENTS.md` is the only repo-wide workspace instruction file.
2. `.github/instructions/` contains on-demand and file-scoped instructions.
3. `.github/prompts/` contains reusable slash-invocable prompts.
4. `.github/agents/` contains custom role-based agents.
5. `.github/skills/` contains specialized on-demand workflows.
6. `.github/hooks/` contains deterministic session and policy hooks.
7. `.vscode/mcp.json` contains workspace-shared MCP server configuration for VS Code.

## Recommended Usage In VS Code

1. Open the repo in VS Code.
2. Open Chat and keep the default coding agent for normal work.
3. Use custom agents from the agent picker when the task is role-specific:
   - `refiner`
   - `pm`
   - `ios-architect`
   - `route-contract-reviewer`
   - `watch-sync-reviewer`
4. Use prompt files as slash commands for repeatable workflows:
   - `/Plan iOS Phase`
   - `/Review Route Contract`
   - `/Build iOS Project`
   - `/Test iOS Project`

## Skills

The repo includes Copilot skills for:

1. iOS phase planning
2. route contract review
3. watch transfer review

These are designed for on-demand loading when the task matches the relevant Apple scope.

## MCP Notes

`.vscode/mcp.json` configures `XcodeBuildMCP` for VS Code Copilot.

This becomes useful once `apps/ios/` exists, enabling:

1. Xcode project discovery
2. simulator builds
3. test runs
4. simulator boot, install, and launch
5. runtime logs and screenshots

Before `apps/ios/` exists, the MCP config can stay committed; there is simply no Apple project for the server to operate on yet.

## Repo Guardrails

1. Preserve destination-first loading.
2. Keep Sporet access centralized through existing Next.js API routes unless scope changes explicitly.
3. Do not treat GPX as canonical route identity or watch-transfer format.
4. Keep the watch app route-focused and non-authoring.
5. Keep Apple implementation under `apps/ios/`.

## Validation Defaults

1. Use `npm ci` when the lockfile is present.
2. Prefer targeted validation first for focused work.
3. Finish with `npm run test:coverage` and `npm run build` when shared logic or shipped behavior changes.