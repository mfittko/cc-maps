---
name: Test iOS Project
description: "Run Apple-side tests with workspace MCP tools when apps/ios exists, then summarize failures with next actions."
agent: ask
---
Run the Apple project's relevant tests using the workspace MCP server.

Procedure:

1. Discover projects and schemes.
2. Choose the main testable iPhone or package target.
3. Run tests on a simulator when applicable.
4. Summarize results and actionable failures.

If `apps/ios/` does not exist yet, stop and say that the Apple subtree has not been created.