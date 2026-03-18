---
name: Build iOS Project
description: "Build the Apple project with workspace MCP tools when apps/ios exists, then summarize build status and actionable failures."
agent: ask
---
Build the Apple project for a simulator using the workspace MCP server.

Procedure:

1. Discover projects and schemes.
2. Choose the main iPhone scheme.
3. Build for a simulator destination.
4. Summarize success or the top actionable build failures.

If `apps/ios/` does not exist yet, stop and say that the Apple subtree has not been created.