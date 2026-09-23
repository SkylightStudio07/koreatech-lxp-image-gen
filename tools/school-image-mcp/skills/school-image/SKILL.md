---
name: school-image
description: Generate PNG assets through the KOREATECH school-image MCP using project art direction and optional reference images. Use when the user requests school AI image generation or explicitly selects this backend for game art. Does not configure MCP connections or automatically import assets into Unity.
---

# School image production

Use the connected `school-image` MCP as the image renderer. The calling agent owns the art direction: derive composition, colors, style, background, and consistency requirements from the user's request and relevant project art guidelines. Preserve explicit choices; do not invent project-wide art rules from a single example.

## Prepare the request

- Confirm the server's tools are available. Claude Code may expose them as `mcp__school-image__generate_image` and similarly prefixed names. Use the names actually advertised by the client. If absent, point to the package README's connection instructions; a skill cannot register or approve an MCP server.
- Read the project's MCP configuration for `ALLOWED_OUTPUT_ROOT` and `ALLOWED_REFERENCE_ROOT` when choosing paths. The installer defaults to `GeneratedAssets/SchoolAI` for output and the project directory for references. A relative output or reference path resolves under its corresponding root, not necessarily the current working directory.
- Select only reference images relevant to the requested asset. These files are uploaded to the school service. Supported inputs are PNG, JPEG, or WebP, at most four files and 20 MiB each. Do not upload unrelated project files.
- Choose a new `.png` filename by default. Set `overwrite: true` only when replacing that specific asset is part of the user's request. The tool rejects paths outside configured roots and traversal/link-based paths.

## Generate and inspect

For a standalone brief, call `generate_image` with `prompt` and `output_path`. When there is reusable art direction, call `generate_image_with_context` with `art_direction`, `task`, and `output_path`; the server concatenates these without rewriting them. Both accept `reference_images`, optional `conversation_id`, `locale` (`ko` or `en`), and `overwrite`.

Make the request explicitly ask for an image, with the required subject, composition, palette, background, and text treatment. Do not promise exact dimensions or transparency: this implementation has no dedicated size or transparency parameter. Omit `conversation_id` for a new asset; reuse a returned ID only when its conversation context is wanted.

```json
{
  "art_direction": "Minimal geometric game UI icons; white background; clean blue facets.",
  "task": "Create an image of a single hexagonal crystal, centered, without lettering.",
  "output_path": "crystal-blue-v1.png",
  "reference_images": [],
  "locale": "ko",
  "overwrite": false
}
```

The school request uses `gpt-5.6-sol`; the service may route image work to `gpt-image-2`. Report the returned model rather than assuming the route succeeded. On success, inspect the saved image against the brief and report its actual path. Several attachments may be returned; the server saves the first image, and `download_attachment` can save additional returned file IDs inside the output root.

Saving a PNG does not import it into Unity, configure a Sprite, set transparency, or integrate a UI. Perform those steps only when requested and using the project's applicable Unity workflow.

## Failure and quota handling

- `BROWSER_OFFLINE`: the bridge must be running and the logged-in school tab connected. The Chrome connector normally restores the worker after a tab reload or bridge restart. Ask the user to run `start-school-image.bat`, open the extension popup, and use **지금 다시 연결** if automatic recovery does not succeed. Chrome extension/site permission and Claude MCP approval are separate setup steps. The legacy bookmarklet is only a fallback.
- `AUTH_EXPIRED` / `CSRF_INVALID`: direct the user to the normal school login/connection flow. A 403 can also mean a service policy refusal. Never extract or print credentials to work around a failure.
- `NO_ATTACHMENT`: do not claim an image was produced. Reference upload and payload are verified, but two reference-edit tests returned ordinary chat with no image. Reference-based generation remains unverified; this is not proof it never works. Do not silently remove references or claim visual consistency.
- `NETWORK_ERROR` / `GENERATION_FAILED`: the request may already have consumed quota. The server attempts a bounded conversation recovery when it has usable IDs. Check the school conversation or use a known returned attachment ID before considering another generation; do not automatically repeat uncertain requests.
- `QUOTA_EXHAUSTED`: stop generation and report it. Use `get_remaining_quota` when quota is relevant; a zero daily limit/remaining value alone does not mean exhaustion—inspect the exceeded flags.
- `OUTPUT_EXISTS` / `INVALID_OUTPUT_PATH`: correct the destination within the configured root; do not broaden filesystem permissions automatically.

Use `list_models` for model availability questions. Never put cookies, CSRF values, local bridge keys, or account data in prompts, source files, reports, or Git. Loading this skill does not authorize additional generations beyond the user's task.
