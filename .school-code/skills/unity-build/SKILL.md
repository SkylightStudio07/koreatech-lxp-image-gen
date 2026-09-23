---
name: unity-build
description: Run the allowlisted Unity tests and builds for the connected project.
---

# Unity build

Run `unity_project_info` before a build. Prefer `unity_run_tests` with `editmode` first, then `playmode` when the project supports it. Use `unity_build` only with an allowlisted target and an output path inside the project. Summarize the exit code and relevant log lines; do not expose or invent arbitrary shell commands or `-executeMethod` values.
