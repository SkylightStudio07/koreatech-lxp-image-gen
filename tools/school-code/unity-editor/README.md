# Unity Editor 브리지

`SchoolCodeMcpBridge.cs`를 Unity 프로젝트의 `Assets/Editor/`에 복사하면 현재 씬과 GameObject를 다루는 로컬 브리지가 생깁니다.

1. Unity에서 `School Code → MCP Bridge → Start`를 실행합니다.
2. `School Code → MCP Bridge → Copy Token`으로 토큰을 복사합니다.
3. VS Code 명령 팔레트에서 `School Code: Unity Editor 연결 설정`을 실행하고 토큰을 붙여넣습니다.
4. 프로젝트의 Unity Editor를 켜 둔 상태에서 학교 MCP 에이전트를 사용합니다.

브리지는 `127.0.0.1:18777`에만 열리고 Bearer 토큰이 필요합니다. `unity_open_scene`, `unity_find_gameobjects`, `unity_get_component`, `unity_set_component`, `unity_create_gameobject`, `unity_save_scene`만 처리하며 C# 코드나 셸 명령은 실행하지 않습니다. `set_component`, `create_gameobject`, `save_scene`은 VS Code 승인 모드에 따라 별도 승인을 요구합니다.

포트는 VS Code 설정 `schoolCode.unityEditorPort`와 Unity `EditorPrefs`의 `SchoolCode.McpBridgePort`를 같은 값으로 맞추세요. 기본값은 18777입니다.
