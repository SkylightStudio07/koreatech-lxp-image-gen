# Verification — School Code 0.6.0

- Version 0.6.0 adds read-only Notion tools, allowlisted Unity CLI tools, a loopback Unity Editor bridge template, and `.school-code/skills` loading. Version 0.5.0 adds Codex-style separated chat sessions and per-session approval modes. Version 0.4.0 made the connected project an on-demand workspace tool target with binary asset metadata, project instruction discovery (`AGENTS.md`, `CODEX.md`, `CLAUDE.md`), and an expanded MCP schema.
- All 22 automated tests pass, including Notion pagination/error handling, Unity CLI path and target restrictions, Unity Editor bridge authentication, skill-root isolation, session migration/isolation, workspace metadata/instruction tools, attachment snapshots/limits, sensitive and binary file rejection, unsaved-file rejection, project switching, folder selection and the coordinator's actual outgoing chat payload.

- The existing browser, protocol, coordinator, connector and MCP round-trip checks remain covered by the test suite. The 0.6.0 package was rebuilt successfully as `school-code-0.6.0.vsix`.
- Version 0.2.0 replaces the bookmarklet with a bundled Manifest V3 Chrome connector, based on the image connector at upstream commit b98345b. The two connectors use separate ports and worker names.
- Actual school chat through the new Chrome connector needs one-time Chrome extension installation and a logged-in school tab. Live Chrome installation/connection has not been verified automatically.
- School-to-MCP-to-VS Code live round trip still needs an externally reachable HTTPS relay and the school agent's MCP configuration.
- Docker deployment files are provided; Docker image execution has not been verified because the local Docker daemon was unavailable.

The browser automation helper could not establish the current Chrome URL and stopped. This does not establish that the extension's browser bridge is failing; that path has not yet been connected live.
