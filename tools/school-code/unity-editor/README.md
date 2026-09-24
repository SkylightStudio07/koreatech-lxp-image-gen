# Unity Editor 브리지

`School Code` 패널의 MCP 카탈로그에서 **Unity Editor MCP → 자동 준비**를 누르면 프로젝트의 `Assets/Editor/`에 브리지를 복사하고, 사용자별 토큰을 만들고, 설정된 Unity 실행 파일로 프로젝트를 엽니다. Unity Hub/Editor 로그인이 필요한 경우 한 번 로그인하면 됩니다. 브리지는 스크립트가 로드될 때 자동으로 시작하므로 별도의 토큰 복사나 `Start` 메뉴 실행이 필요하지 않습니다.

수동으로 설치하려면 `SchoolCodeMcpBridge.cs`를 Unity 프로젝트의 `Assets/Editor/`에 복사하고 Unity를 다시 로드하세요. 기존 메뉴 `School Code → MCP Bridge → Start`와 `Copy Token`도 계속 사용할 수 있습니다.

브리지는 `127.0.0.1:18777`에만 열리고 Bearer 토큰이 필요합니다. `unity_open_scene`, `unity_find_gameobjects`, `unity_get_component`, `unity_set_component`, `unity_create_gameobject`, `unity_save_scene`만 처리하며 C# 코드나 셸 명령은 실행하지 않습니다. `set_component`, `create_gameobject`, `save_scene`은 VS Code 승인 모드에 따라 별도 승인을 요구합니다.

포트는 VS Code 설정 `schoolCode.unityEditorPort`와 Unity `EditorPrefs`의 `SchoolCode.McpBridgePort`를 같은 값으로 맞추세요. 기본값은 18777입니다. 자동 준비에서 생성한 토큰은 VS Code SecretStorage와 사용자 홈의 `.school-code/unity-editor-token`에 저장되며 프로젝트 폴더에는 저장하지 않습니다.
