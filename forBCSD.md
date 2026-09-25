# BCSD용 School Code·학교 AI MCP 설치 및 연결 가이드

이 문서는 BCSD 구성원이 Windows에서 **KOREATECH School Code VS Code 확장**을 설치하고, 운영 중인 `bcsd-nai` MCP 중계 서버를 학교 AI에 등록하는 전체 절차를 정리한 문서입니다. 설치만 하면 학교 AI 채팅을 VS Code에서 사용할 수 있고, MCP까지 연결하면 선택한 프로젝트의 파일·셸·Unity 도구를 학교 에이전트가 호출할 수 있습니다.

구성원에게는 GitHub 저장소의 소스 링크보다 **최신 GitHub Release 페이지 링크**를 전달하세요. Release에서 `school-code-0.19.0.vsix`와 `school-code-connector-0.3.0.zip`을 내려받아 설치하면 됩니다. 저장소 소스는 개발·검토용이고, Release 첨부 파일이 일반 구성원의 설치용입니다.

이 문서에서 말하는 서버 주소는 현재 BCSD 서버 기준입니다. 0.10.0부터는 구성원이 정적 토큰을 복사하지 않고 BCSD 계정으로 브라우저 승인하는 개인 페어링 방식이 권장됩니다.

| 용도 | 주소 |
|---|---|
| 중계 서버 기본 주소 | `https://bcsd-nai.mywire.org:3010` |
| 서버 상태 확인 | `https://bcsd-nai.mywire.org:3010/health` |
| 학교 AI에 등록할 MCP 주소 | `https://bcsd-nai.mywire.org:3010/mcp` |

토큰은 이 문서에 적지 않습니다. 운영자가 권한이 있는 구성원에게 개인적으로 전달해야 합니다.

## 1. 먼저 구분해야 하는 네 가지

### School Code 확장

VS Code 안에 채팅 화면과 프로젝트 도구를 설치하는 확장입니다. 학교 API를 직접 호출하지 않고 로그인된 Chrome 탭을 통해 학교 AI에 요청합니다.

### Chrome Connector

학교 AI 로그인 쿠키를 가진 탭과 VS Code 사이를 연결하는 Manifest V3 확장입니다. 학교 계정 쿠키나 CSRF 값을 NAS로 보내지 않고, 로그인 탭 안에서 학교 API 요청을 실행합니다.

### 학교 Workspace MCP

`/mcp`에 등록하는 외부 MCP 서버입니다. 학교 에이전트가 `read_file`, `search_text`, `propose_edit`, Unity 도구 등을 호출하면 중계 서버가 현재 연결된 VS Code 워커로 작업을 전달합니다.

### 토큰과 계정 페어링

| 이름 | 어디에 입력하는가 | 의미 |
|---|---|---|
| `MCP_TOKEN` | 학교 AI의 **리소스 → MCP** 등록 화면 | 학교 에이전트가 `/mcp`에 접속할 때 쓰는 Bearer 토큰 |
| `WORKER_TOKEN` | VS Code School Code의 **학교 Workspace 연결** 화면 | VS Code 워커가 `/worker/*`에 접속할 때 쓰는 Bearer 토큰 |

기존 정적 토큰 모드에서는 두 토큰이 반드시 서로 달라야 합니다. 새 페어링 모드에서는 VS Code가 로그인 승인 뒤 개인 `WORKER_TOKEN`과 `MCP_TOKEN`을 자동 발급받아 SecretStorage에 저장하므로 직접 복사할 필요가 없습니다. 토큰은 학교 로그인 쿠키와 별도이며, 사용자·기기·워크스페이스에 연결됩니다.

## 2. 준비물

- Windows 10/11
- VS Code 1.95 이상
- Chrome
- KOREATECH 학교 AI 계정
- BCSD 릴레이에 등록된 계정(처음이면 브라우저에서 가입)
- 최신 GitHub Release의 `school-code-0.19.0.vsix`
- 최신 GitHub Release의 `school-code-connector-0.3.0.zip`

채팅만 사용할 사람은 MCP 토큰이나 Workspace 토큰 없이도 학교 브라우저 연결과 모델 대화까지 설정할 수 있습니다. 프로젝트 파일·Unity·셸 도구를 사용할 사람은 아래 절차를 끝까지 진행해야 합니다.

## 3. VS Code 확장 설치

### 방법 A: Release에서 VSIX 설치 (권장)

최신 Release에서 VSIX를 내려받은 뒤 파일을 VS Code 창으로 끌어 놓거나 명령 팔레트의 **Extensions: Install from VSIX...**로 설치합니다. 설치 후 **Developer: Reload Window**를 실행합니다.

### 방법 B: 저장소에서 직접 설치

PowerShell에서 저장소 루트로 이동한 뒤 VSIX를 설치합니다.

```powershell
cd G:\Koreatech-Codex\school-ai
code --install-extension .\tools\school-code\school-code-0.19.0.vsix --force
code --list-extensions --show-versions | Select-String koreatech-school-code
```

정상 결과에는 다음과 비슷한 항목이 표시됩니다.

```text
skylight-local.koreatech-school-code@0.19.0
```

VS Code가 `code` 명령을 찾지 못하면 VS Code에서 `Ctrl+Shift+P` → **Shell Command: Install 'code' command in PATH**를 실행하거나, VSIX 파일을 VS Code 창으로 끌어 놓아 설치합니다.

### 방법 C: VSIX 파일 직접 선택

1. VS Code를 엽니다.
2. `Ctrl+Shift+P`를 누릅니다.
3. **Extensions: Install from VSIX...**를 선택합니다.
4. Release에서 내려받은 `school-code-0.19.0.vsix`를 선택합니다.
5. 설치가 끝나면 **Developer: Reload Window**를 실행합니다.

설치 후 왼쪽 Activity Bar에서 `School Code` 아이콘을 선택하고 **학교 AI** 뷰를 엽니다. 아이콘이 보이지 않으면 명령 팔레트에서 **School Code: 채팅 열기**를 실행합니다.

## 4. Chrome Connector 설치

1. 최신 Release의 `school-code-connector-0.3.0.zip`을 압축 해제합니다. 또는 School Code 패널의 **설정 → 연결 및 외부 MCP → Chrome 확장 폴더 열기**로 설치된 VSIX 안의 폴더를 엽니다.
2. Chrome 주소창에 `chrome://extensions`를 입력합니다.
3. 오른쪽 위 **개발자 모드**를 켭니다.
4. **압축해제된 확장 프로그램을 로드**를 누릅니다.
5. 압축 해제한 `chrome-extension` 폴더(또는 VS Code가 연 폴더)를 선택합니다.

이미 설치되어 있다면 새로 설치하지 말고 `chrome://extensions`의 **새로고침** 버튼을 누릅니다. Chrome Connector를 삭제하면 안 됩니다. School Code 확장은 이 Connector가 로그인된 학교 탭에 주입하는 워커를 통해 학교 API를 호출합니다.

## 5. 학교 브라우저 연결

1. Chrome에서 다음 주소를 엽니다.

   `https://ai.koreatech.ac.kr/AiCA/chat`

2. 학교 계정으로 로그인합니다.
3. 로그인된 탭을 닫지 않습니다.
4. VS Code School Code의 **설정 → 브라우저 연결**을 누릅니다.
5. Chrome에서 로컬 네트워크 접근 권한을 묻는 경우 허용합니다.
6. **모델·에이전트 새로고침**을 누릅니다.
7. **채팅** 탭의 모델 또는 에이전트를 선택합니다.

연결이 완료되면 `학교 브라우저 연결됨`이 표시되고 모델 목록에 Astra/Fable 등이 나타납니다. 여러 학교 탭을 열어 두면 Connector는 첫 번째로 검색된 학교 채팅 탭을 사용하므로, 다른 학교 탭은 닫아 두는 편이 안전합니다.

### 작업 목표 사용

채팅 입력창에 Codex식 목표 명령을 보낼 수 있습니다. 목표는 현재 대화 세션에 저장되고 다음 요청부터 모델·워크플로우 에이전트에 전달됩니다.

```text
/goal 이 프로젝트의 플레이어 이동 버그를 수정하고 테스트까지 통과시키기
/goal status
/goal done
/goal clear
```

채팅 화면의 **현재 작업 목표 → 설정** 버튼으로 입력해도 됩니다. `/goal`만 입력하면 목표 입력 창이 열립니다.

## 6. BCSD 중계 서버와 VS Code Workspace 연결

이 단계는 VS Code 프로젝트를 학교 에이전트의 도구 대상으로 사용할 때만 필요합니다.

1. VS Code에서 작업할 프로젝트 폴더를 엽니다.
2. School Code의 **설정** 탭에서 **연결된 프로젝트 → 프로젝트 선택**을 누릅니다.
3. 실제 작업할 폴더를 선택합니다.
4. **MCP 카탈로그**를 펼칩니다.
5. **학교 Workspace → 연결**을 누릅니다. 구버전 패널에서는 **외부 MCP 연결** 버튼으로 표시될 수 있습니다.
6. 서버 선택에서 **bcsd-nai (기본 서버)**를 선택합니다.
7. 주소를 직접 묻는 경우 다음 기본 주소를 입력합니다.

   `https://bcsd-nai.mywire.org:3010`

   주소 끝에 `/health`나 `/mcp`를 붙이지 않습니다. `/health`는 상태 확인용이고 `/mcp`는 학교 리소스 등록용입니다.

8. 인증 방식에서 **BCSD 계정으로 브라우저 승인**을 선택합니다. 브라우저에서 로그인·가입 후 **이 기기를 연결**을 누르면 확장이 개인 토큰을 자동 저장합니다. 구버전 릴레이를 쓰는 경우에만 **수동 WORKER_TOKEN 입력**을 선택합니다.
9. VS Code 승인 창이 나오면 연결을 승인합니다.

정상 상태는 다음과 같습니다.

- 설정 탭의 브라우저 상태: `학교 브라우저 연결됨`
- MCP 카탈로그의 학교 Workspace: `연결됨`
- 프로젝트 카드의 도구 상태: `MCP 프로젝트 도구 사용 가능`
- 채팅 탭 상단의 상태: `학교 브라우저 연결됨`

### 승인 버튼을 여러 번 눌렀을 때

브라우저에 `School Code 연결` 탭이 여러 개 열렸다면 이전 탭은 모두 닫습니다. 각 탭의 코드는 서로 다른 연결 요청이므로, VS Code가 현재 표시하는 코드와 다른 탭에서 **이 기기를 연결**을 눌러도 현재 요청은 승인되지 않습니다. 최신 VS Code 확장에서는 첫 요청이 승인 대기 중일 때 **학교 Workspace → 연결**을 다시 눌러도 새 코드를 만들지 않고 기존 요청을 계속 확인합니다. 브라우저 승인 후 페이지에 `이 기기가 연결되었습니다`가 표시되고, VS Code에서 `승인 대기 중`이 `연결됨`으로 바뀌는지 확인합니다.

승인 페이지가 계속 버튼만 보여 주거나 MCP 카드가 즉시 `오류`로 바뀌면 VS Code를 `Developer: Reload Window`로 다시 로드하고 최신 `0.19.0` VSIX를 설치하세요. NAS 릴레이도 최신 `dist/relay.cjs`로 재빌드해야 승인 토큰을 잃어버린 경우 재시도할 수 있습니다.

페어링 모드에서는 사용자·기기·워크스페이스별 워커를 분리합니다. 같은 계정·워크스페이스에서 두 번째 VS Code 창이 연결되면 기존 워커를 보호하기 위해 `409`가 반환됩니다. 정적 토큰 모드의 구버전 릴레이는 여전히 한 인스턴스당 워커 한 개이므로, 구성원별 페어링을 쓰려면 릴레이를 0.10.0으로 업데이트해야 합니다.

## 7. 학교 AI에 BCSD MCP 등록

이 단계가 학교 에이전트가 BCSD 서버의 도구를 호출하도록 만드는 단계입니다.

1. 학교 AI 웹사이트를 엽니다.
2. **리소스** 또는 **Resources** 탭으로 이동합니다.
3. **MCP**를 선택합니다.
4. **새로 만들기**, **Add MCP**, 또는 비슷한 등록 버튼을 누릅니다.
5. 다음처럼 입력합니다.

| 항목 | 입력값 |
|---|---|
| 이름 | `BCSD School Code Workspace` |
| 전송 방식 | `HTTP` 또는 `Streamable HTTP` |
| 서버 URL | `https://bcsd-nai.mywire.org:3010/mcp` |
| 인증 방식 | `Bearer` |
| 토큰 | 페어링 후 VS Code **MCP 인증 JSON 복사**로 복사한 개인 `MCP_TOKEN` (구형 서버는 운영자가 전달한 토큰) |

이 서버는 SSE 전용 주소가 아닙니다. 전송 방식에서 `SSE`만 선택하면 연결되지 않을 수 있습니다. 페어링을 마친 뒤 VS Code 설정에서 **MCP 인증 JSON 복사**를 누르고, 학교 화면이 인증 JSON을 요구하면 클립보드 내용을 그대로 붙여 넣습니다. 정적 토큰 모드의 운영자는 기존 `MCP_TOKEN`을 사용합니다.

```json
{"type":"bearer","token":"페어링으로_발급된_개인_MCP_TOKEN"}
```

화면이 헤더 직접 입력을 요구하면 다음 헤더를 사용합니다.

```text
Authorization: Bearer 페어링으로_발급된_개인_MCP_TOKEN
```

실제 토큰은 이 문서, GitHub, Discord/Slack 공개 채널, 스크린샷에 넣지 않습니다. 등록 후 **저장 → 연결 확인 → 도구 목록 새로고침**을 실행합니다.

## 8. 에이전트에 MCP 연결

MCP를 등록하는 것만으로 모든 에이전트가 도구를 사용하는 것은 아닙니다.

1. 학교 AI의 MCP 상세 화면에서 `BCSD School Code Workspace`를 사용할 에이전트를 선택합니다.
2. 에이전트의 연결된 리소스 또는 MCP 목록에 해당 항목이 보이는지 확인합니다.
3. 학교 AI 에이전트 목록을 새로고침합니다.
4. VS Code School Code의 **채팅** 탭에서 같은 에이전트를 선택합니다.
5. 먼저 `현재 연결된 프로젝트의 이름과 사용 가능한 도구를 알려줘`라고 테스트합니다.

에이전트가 `workspace_info`를 호출하면 프로젝트 이름, 도구 목록, 승인 정책이 반환됩니다. 워크플로우 에이전트를 선택한 경우에는 일반 채팅이 아니라 서버의 단계형 실행이 사용되고, VS Code 답변에 LLM/MCP 단계와 완료 상태가 표시됩니다. 이어서 다음처럼 테스트할 수 있습니다.

워크플로우가 `run_end`와 단계 목록만 표시되고 답변 본문이 비어 있으면 VS Code에서 **보기 → 출력 → School Code**를 엽니다. 다음 로그의 길이만 확인해 운영자에게 전달하세요.

```text
[workflow] run_end text_length=… accumulated_length=… node_output_length=… output_shape=…
```

세 텍스트 길이가 모두 `0`이면 학교 Workflow API가 최종 답변 텍스트를 보내지 않은 경우입니다. `output_shape`는 값이 아니라 중첩 키와 자료형·길이만 보여 줍니다. 값이 하나라도 양수인데 화면만 비면 확장 창을 `Developer: Reload Window`로 새로고침하고 같은 요청을 다시 실행합니다. 로그에는 토큰·답변 본문·Notion 내용이 기록되지 않습니다.

### Figma MCP 연결

Figma 디자인을 에이전트가 읽게 하려면 **MCP 카탈로그 → Figma MCP**를 선택합니다. 공식 원격 주소 `https://mcp.figma.com/mcp`가 기본으로 입력됩니다.

1. 학교 AI **리소스 → MCP**에서 Figma MCP를 새로 등록합니다.
2. 서버 URL에 `https://mcp.figma.com/mcp`를 입력합니다.
3. 학교 등록 화면이 OAuth를 지원하면 토큰을 붙여 넣지 말고 Figma 로그인·승인을 진행합니다.
4. Figma MCP를 사용할 학교 에이전트에 연결합니다.
5. VS Code에서 같은 에이전트를 선택한 뒤 Figma 디자인 링크를 질문에 붙여 넣습니다.

Figma Desktop/로컬 MCP 주소는 학교 서버가 사용자 PC의 localhost에 접근할 수 없으므로 학교 에이전트용으로 사용할 수 없습니다. Bearer 방식의 별도 원격 Figma MCP 서버를 쓰는 경우에만 해당 서버의 개인 토큰을 입력합니다.

프로젝트에 `AGENTS.md`·`CODEX.md`·`CLAUDE.md`가 없으면 첫 `workspace_info` 호출 때 School Code가 기본 루트 `AGENTS.md`를 자동으로 생성합니다. 이 파일은 최초 하네스 부트스트랩용으로 승인 창을 띄우지 않으며, 이미 지침 파일이 있으면 덮어쓰지 않습니다. 생성된 초안은 에이전트에게 프로젝트를 조사한 뒤 `propose_edit`으로 보강하도록 요청하면 됩니다.

```text
현재 프로젝트에서 Assets와 Scripts 아래의 파일 구조를 요약해줘.
```

파일을 읽는 작업은 기본 승인 모드에서 VS Code에 확인 창이 표시됩니다. 파일 수정, 셸 명령, Unity 빌드/씬 변경은 쓰기 승인 대상입니다. 처음에는 **매번 확인** 또는 **읽기는 자동 승인 · 수정은 확인**을 사용하세요.

폴더를 만들 때는 `create_directory` 도구를 사용합니다. `Assets/Generated/UI`처럼 프로젝트 루트 안의 상대 경로만 허용하며, 생성 전 파일 수정과 같은 승인 창이 표시됩니다. 이미 있는 폴더는 성공으로 처리하고, 프로젝트 밖 경로·숨김/비밀 경로·링크·파일 경로는 거부됩니다.

### Git CLI

Git은 NAS가 아니라 각 구성원의 VS Code PC에서 실행됩니다. **MCP 카탈로그 → Git CLI → 경로 설정**에서 기본값 `git`을 사용하면 됩니다. Git이 PATH에 없을 때만 `git.exe` 전체 경로를 입력합니다.

- 읽기: `git_info`, `git_status`, `git_diff`, `git_log`, `git_branches`
- 승인 작업: `git_create_branch`, `git_stage`, `git_commit`, `git_fetch`, `git_pull`, `git_push`

에이전트는 사용자가 요청하지 않으면 commit·pull·push를 수행하지 않습니다. 파일을 stage할 때도 지정한 파일만 처리하고, `.env`, 토큰, 인증 JSON, SSH 키는 거부합니다. 강제 push와 `reset --hard`, `clean -fd`는 제공하지 않습니다. GitHub 인증 정보는 PC의 Git Credential Manager나 SSH 설정을 그대로 사용하며 NAS로 전달하지 않습니다.

Git 저장소가 아닌 프로젝트에서는 `NOT_A_REPOSITORY`가 정상 결과로 표시됩니다. “게임 구조”처럼 사용자가 설명한 이름은 실제 경로라고 가정하지 않고 `path_info`, `list_files`, `search_text`로 먼저 확인합니다. 없는 폴더를 조회한 결과는 `PATH_NOT_FOUND`로 반환되며 워크플로우 전체를 실패시키지 않습니다.

### 프로젝트 이미지 확인

프로젝트 폴더 안의 이미지도 필요한 파일만 에이전트가 직접 볼 수 있습니다.

1. 먼저 `list_visual_assets`를 요청해 이미지 경로·가로세로·SHA-256·Unity 텍스처 `.meta` 정보를 확인합니다.
2. 필요한 파일에 대해서만 `read_image`를 요청합니다. PNG, JPEG, GIF, WebP, SVG, ICO를 지원하고 한 장의 최대 크기는 16 MiB입니다.
3. `read_image`는 메타데이터 텍스트와 MCP `image` 콘텐츠를 함께 반환하므로, 이미지 내용을 묻는 질문에 에이전트가 실제 픽셀을 참고할 수 있습니다.

생성 폴더(`Library`, `Temp`, `Build` 등)는 이미지 목록에서 제외됩니다. SVG에 스크립트·이벤트 속성·외부 URL이 있거나 프로젝트 밖 경로·심볼릭 링크를 가리키면 거부합니다. 폴더 전체를 자동 업로드하지 않으며, 목록 확인 후 필요한 이미지만 전송합니다.

### Unity 시각·편집 도구

Unity Editor MCP를 자동 준비한 뒤 다음 요청을 사용할 수 있습니다.

- `unity_capture_scene`, `unity_capture_game`: Scene/Game 화면을 이미지로 확인
- `unity_model_preview`: Unity가 임포트한 FBX/OBJ/GLB/GLTF 미리보기 확인
- `unity_play`, `unity_pause`, `unity_stop`: Play Mode 제어
- `unity_get_console_logs`, `unity_project_status`: Console, 컴파일·임포트 상태, 현재 씬·빌드 설정 확인
- `unity_add_component`, `unity_remove_component`, `unity_duplicate_gameobject`, `unity_delete_gameobject`, `unity_move_gameobject`: 기본 오브젝트 편집
- `unity_instantiate_prefab`, `unity_assign_material`, `unity_get_animator_info`, `unity_set_animator_parameter`: Prefab·Material·Animator 작업

Scene/Game 캡처와 모델 미리보기는 MCP 이미지 콘텐츠로 반환됩니다. 오브젝트·씬·Play Mode를 변경하는 요청은 쓰기 승인 창을 거칩니다. FBX/OBJ/GLB/GLTF 파일 자체는 `list_model_assets`와 `read_model_metadata`로 크기·해시·기본 구조를 먼저 확인하고, 원본 바이너리를 그대로 대화에 보내지 않습니다.

## 9. 연결 구조

전체 흐름은 다음과 같습니다.

```text
학교 AI 에이전트
    │  HTTPS POST /mcp
    │  Authorization: Bearer MCP_TOKEN
    ▼
https://bcsd-nai.mywire.org:3010
    ▲
    │  HTTPS /worker/* 장기 폴링
    │  Authorization: Bearer WORKER_TOKEN
    │
VS Code School Code 워커
    │
    │  로그인 세션을 가진 Chrome 탭에서 실행
    ▼
KOREATECH 학교 AI API
```

학교 MCP 서버가 VS Code의 `localhost`에 직접 접속하는 구조가 아닙니다. VS Code가 외부 릴레이에 outbound polling으로 연결하고, 학교 에이전트의 도구 요청을 워커가 받아 처리합니다. 따라서 VS Code PC에 별도의 inbound 포트포워딩은 필요하지 않습니다. 운영자 NAS에서는 외부 HTTPS 도메인과 NAS 내부 릴레이 포트 사이의 역방향 프록시만 필요합니다.

## 10. 서버 상태 확인

PowerShell에서 서버가 살아 있는지 확인합니다.

```powershell
$health = Invoke-RestMethod 'https://bcsd-nai.mywire.org:3010/health'
$health.ok
$health.version
$health.tool_count
```

`True`가 나오면 릴레이 HTTP 서버가 응답한다는 뜻입니다. `version`은 실행 중인 릴레이 버전이고 `tool_count`는 실제 MCP 도구 수입니다. 설치한 릴리즈와 값이 다르면 컨테이너 재빌드가 적용되지 않았거나 역방향 프록시가 다른 인스턴스를 가리키는 상태입니다. 이것만으로 VS Code 워커 연결이나 학교 MCP 인증까지 성공했다는 뜻은 아닙니다.

`/mcp`는 인증이 필요한 POST endpoint입니다. 브라우저에서 URL을 직접 열었을 때 `401` 또는 `405`가 나와도 반드시 서버 고장은 아닙니다. 학교 MCP 등록 화면에서 `MCP_TOKEN`으로 연결 테스트를 해야 합니다.

## 11. 문제 해결

| 증상 | 가장 흔한 원인 | 조치 |
|---|---|---|
| School Code 아이콘이나 채팅 뷰가 없음 | VSIX 설치 후 창이 재로드되지 않음 | `Developer: Reload Window` 실행 후 `School Code: 채팅 열기` 실행 |
| `브라우저 연결 대기`가 계속됨 | 학교 채팅 탭 미로그인, Connector 미로드, 로컬 네트워크 권한 거부 | 학교 채팅 URL에서 로그인 → `chrome://extensions` Connector 새로고침 → 탭 새로고침 → 연결 권한 허용 |
| 모델 목록이 비어 있음 | 브라우저 연결 전 새로고침, 학교 세션 만료 | 설정 탭에서 브라우저 연결 후 모델·에이전트 새로고침 |
| `/health`는 정상인데 Workspace가 연결 안 됨 | 기본 주소에 `/health`를 입력했거나 `WORKER_TOKEN`이 틀림 | VS Code에는 `https://bcsd-nai.mywire.org:3010`만 입력하고 WORKER_TOKEN 재입력 |
| Workspace 연결 시 `401` | WORKER_TOKEN 오류 또는 프록시가 Authorization 헤더를 제거 | 운영자에게 WORKER_TOKEN 확인 요청, `/worker/heartbeat`에 Authorization 전달 여부 확인 |
| Workspace 연결 시 `409 Another VS Code window is connected` | 같은 릴레이에 다른 워커가 이미 연결됨 | 기존 사용자가 MCP 연결을 해제하거나 운영자가 별도 릴레이를 제공해야 함 |
| 학교 MCP 등록 시 `401` | MCP URL/토큰 오류, 두 토큰 혼동 | URL은 `/mcp`까지, 인증은 MCP_TOKEN, Bearer 형식 확인 |
| 학교 MCP 등록 시 404 | `/health` 또는 기본 주소를 MCP URL로 등록 | `https://bcsd-nai.mywire.org:3010/mcp` 사용 |
| 도구 목록은 보이지만 호출이 `Worker offline` | VS Code School Code가 Workspace에 연결되지 않음 | VS Code 설정 탭에서 프로젝트 선택 → 학교 Workspace 연결 → 브라우저 연결 확인 |
| `workspace_info`에는 새 도구가 보이지만 실제 호출 목록에 없음 | NAS 릴레이가 구버전이거나 학교 MCP 리소스가 이전 `tools/list`를 캐시함 | `/health`의 `version`·`tool_count` 확인 → NAS 컨테이너 재빌드 → 학교 리소스에서 MCP를 해제 후 다시 등록 → 새 에이전트 세션 시작 |
| 워크플로우 중 `중계 HTTP 410` | 여러 MCP 도구 실행 또는 승인 대기가 구버전 제한 시간(120초)을 초과 | NAS 릴레이를 최신 버전으로 재빌드하고 `JOB_TIMEOUT_MS=1800000` 설정; `/mcp`·`/worker/*` 프록시 타임아웃도 30분 이상으로 설정 |
| 도구 목록은 보이지만 파일이 엉뚱함 | 다른 VS Code 창/프로젝트가 워커로 연결됨 | 연결된 프로젝트 경로와 활성 VS Code 창 확인; 한 릴레이당 한 워커 원칙 적용 |
| Unity 도구만 실패 | Unity CLI 경로 또는 Editor 브리지 미설정 | 설정 탭에서 Unity CLI 경로 설정, 필요한 경우 Unity Editor 자동 준비 실행 |
| Chrome 탭을 여러 개 열었더니 요청이 이상함 | Connector는 학교 채팅 탭 하나만 사용 | 사용하지 않는 학교 AI 탭을 닫고 로그인 탭 하나만 새로고침 |

오류를 운영자에게 보낼 때는 토큰을 포함하지 말고 다음 정보만 전달합니다.

- 발생한 화면과 정확한 오류 문구
- `health` 응답 상태 코드
- VS Code 설정 탭의 상태 문구
- 학교 MCP 등록 화면의 상태 코드
- VS Code 창이 한 개인지 여부
- 연결한 프로젝트의 이름(비밀 경로 제외)

## 12. 운영자용 배포 확인

서버를 직접 운영하는 경우 0.10.0 릴레이는 계정 페어링을 기본으로 사용합니다. 기존 클라이언트 호환을 위해 두 정적 토큰을 함께 둘 수 있지만, 구성원에게 직접 전달하지 않는 편이 안전합니다.

```powershell
cd tools/school-code
npm ci
npm run keys
```

`npm run keys`는 `.local/relay.env`에 서로 다른 `MCP_TOKEN`과 `WORKER_TOKEN`을 생성합니다. 이 파일은 Git에 추가하지 않습니다. Docker나 NAS 서비스에는 두 값을 환경 변수로 주입합니다. 페어링 계정을 활성화하려면 다음 값도 설정합니다.

```dotenv
AUTH_STORE_PATH=/data/auth.json
PUBLIC_URL=https://bcsd-nai.mywire.org:3010
ALLOW_REGISTRATION=true
JOB_TIMEOUT_MS=1800000
# 선택: 초대 코드가 필요할 때 설정하고 ALLOW_REGISTRATION=false로 변경
REGISTRATION_CODE=동아리-초대코드
```

Docker Compose를 쓰면 `/data`를 NAS의 별도 쓰기 가능한 `auth-data` 폴더에 마운트합니다. 이 파일에는 비밀번호·토큰 원문이 아니라 해시만 저장되지만, 계정 복구와 페어링 발급에 필요한 인증 저장소이므로 공개 공유하지 않습니다.

역방향 프록시는 다음 경로를 같은 릴레이로 전달해야 합니다.

- `/health` → 상태 확인
- `/auth/*` → 페어링 페이지, 로그인·가입·승인·상태 확인
- `/mcp` → 학교 AI의 Streamable HTTP POST
- `/worker/heartbeat`
- `/worker/poll`
- `/worker/status`
- `/worker/result`
- `/worker/disconnect`

프록시 설정에서 `Authorization`과 `X-Worker-Id` 헤더를 보존하고, `/worker/poll`은 20초 이상, `/mcp`와 `/worker/*` 응답 타임아웃은 `JOB_TIMEOUT_MS`보다 길게 설정합니다(기본 30분). TLS 인증서는 외부에서 신뢰할 수 있어야 하며, `/mcp`와 `/worker/*`의 경로를 임의로 `/api` 아래로 바꾸거나 Authorization 헤더를 제거하면 안 됩니다.

운영자는 정적 `MCP_TOKEN`을 구성원에게 전달하는 대신 각 구성원이 페어링 후 VS Code의 **MCP 인증 JSON 복사**를 사용하도록 안내합니다. Workspace 릴레이는 연결된 VS Code 프로젝트의 파일 읽기·수정·셸·Unity 도구까지 요청할 수 있으므로, 학교 MCP 에이전트 연결 대상과 VS Code 승인 모드를 함께 관리합니다.

## 13. 최종 체크리스트

- [ ] VS Code에 `skylight-local.koreatech-school-code@0.19.0`이 설치됨
- [ ] Chrome `chrome://extensions`에 KOREATECH School Code Connector가 로드됨
- [ ] 로그인된 `https://ai.koreatech.ac.kr/AiCA/chat` 탭이 하나 열려 있음
- [ ] VS Code 설정 탭에서 브라우저가 `연결됨`으로 표시됨
- [ ] 모델·에이전트 목록을 새로고침함
- [ ] 프로젝트 폴더를 연결함
- [ ] Workspace를 사용할 경우 `https://bcsd-nai.mywire.org:3010`에서 BCSD 계정 페어링을 완료함
- [ ] 학교 AI 리소스에 `https://bcsd-nai.mywire.org:3010/mcp`를 등록함
- [ ] 학교 MCP 인증에 MCP_TOKEN을 사용함
- [ ] MCP를 사용할 에이전트에 연결함
- [ ] VS Code 채팅 탭에서 같은 에이전트를 선택함
- [ ] `workspace_info` 또는 파일 목록 질문으로 테스트함
- [ ] 수정·셸·Unity 작업은 승인 창을 확인한 뒤 실행함

## 보안 원칙

`MCP_TOKEN`, `WORKER_TOKEN`, Notion Integration Secret, Unity Editor 토큰은 저장소·README·스크린샷·공개 채팅에 기록하지 않습니다. 이 문서는 주소와 절차만 공유하고 토큰은 개인 메시지나 승인된 비밀 저장소로 전달합니다. 토큰이 노출되면 운영자는 즉시 새 토큰을 생성하고 학교 MCP 등록 값과 NAS 서비스 환경 변수를 교체해야 합니다.

