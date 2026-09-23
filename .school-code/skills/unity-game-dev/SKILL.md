---
name: unity-game-dev
description: Inspect and edit a Unity project through workspace and Unity Editor tools.
---

# Unity game development

Start with `unity_project_info` and `workspace_info`. Use `list_files`, `read_file`, and `search_text` for source and project settings. For live scenes use `unity_find_gameobjects` and `unity_get_component`; use `unity_set_component`, `unity_create_gameobject`, and `unity_save_scene` only when the requested change is explicit. Never guess a GameObject ID or serialized property: inspect it first, then report the exact change.
