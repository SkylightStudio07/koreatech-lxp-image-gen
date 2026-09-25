# Unity Editor 브리지

`School Code` 패널의 MCP 카탈로그에서 **Unity Editor MCP → 자동 준비**를 누르면 프로젝트의 `Assets/Editor/`에 브리지를 복사하고, 사용자별 토큰을 만들고, 설정된 Unity 실행 파일로 프로젝트를 엽니다. Unity Hub/Editor 로그인이 필요한 경우 한 번 로그인하면 됩니다. 브리지는 스크립트가 로드될 때 자동으로 시작하므로 별도의 토큰 복사나 `Start` 메뉴 실행이 필요하지 않습니다.

수동으로 설치하려면 `SchoolCodeMcpBridge.cs`를 Unity 프로젝트의 `Assets/Editor/`에 복사하고 Unity를 다시 로드하세요. 기존 메뉴 `School Code → MCP Bridge → Start`와 `Copy Token`도 계속 사용할 수 있습니다.

브리지는 `127.0.0.1` loopback에만 열리고 Bearer 토큰이 필요합니다. 기본 포트는 `18777`이며 이미 사용 중이면 `18778`부터 비어 있는 포트를 자동으로 선택합니다. 선택한 포트는 프로젝트 경로별로 사용자 폴더의 `.school-code/unity-editor-ports/<경로 해시>.port`에 기록되고 확장이 그 파일을 읽어 연결하므로 Unity Editor를 여러 개 동시에 열 수 있습니다. `unity_open_scene`, `unity_find_gameobjects`, `unity_get_component`, `unity_set_component`, `unity_create_gameobject`, `unity_save_scene`만 처리하며 C# 코드나 셸 명령은 실행하지 않습니다. `set_component`, `create_gameobject`, `save_scene`은 VS Code 승인 모드에 따라 별도 승인을 요구합니다.

일반적으로 포트를 수동으로 맞출 필요가 없습니다. `schoolCode.unityEditorPort`는 레지스트리가 아직 없을 때의 초기값(기본 18777)으로만 사용합니다. 자동 준비에서 생성한 토큰은 VS Code SecretStorage와 사용자 홈의 `.school-code/unity-editor-token`에 저장되며 프로젝트 폴더에는 저장하지 않습니다.

`각 소켓 주소 ... 하나만 사용할 수 있습니다` 오류가 계속 보이면 프로젝트의 `Assets/Editor/SchoolCodeMcpBridge.cs`가 최신 파일인지 확인하고 Unity에서 스크립트 재컴파일 또는 재시작을 하세요. 최신 브리지는 충돌 포트를 자동으로 건너뜁니다. 같은 프로젝트의 오래된 브리지가 남아 있으면 Unity 메뉴에서 **School Code → MCP Bridge → Stop**을 한 번 누른 뒤 다시 **Start**하세요.
