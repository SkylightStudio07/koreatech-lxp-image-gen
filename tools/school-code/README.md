# KOREATECH School Code — 0.6.0 preview

VS Code에서 학교 Astra/Fable 모델과 대화하고, 코덱스식 프로젝트 도구로 현재 프로젝트를 검색·읽거나 수정안을 승인하는 확장입니다. OpenAI API 키 없이 학교 로그인 세션을 사용합니다. 학교·Microsoft가 제공하는 공식 확장은 아닙니다.

> **공유 전 확인:** 학교 AI 채팅 자체는 기존처럼 동아리 사람들과 함께 사용할 수 있습니다. 이 문서의 외부 MCP는 연결된 한 대의 VS Code 프로젝트에 파일·Unity 도구 요청을 전달하는 별도 권한입니다. 현재 릴레이는 한 번에 한 VS Code 워커만 연결하므로 여러 사람이 동시에 같은 릴레이를 사용할 수 없습니다. `MCP_TOKEN`, `WORKER_TOKEN`, Notion 토큰, Unity Editor 토큰은 공개 저장소나 단체 채팅에 올리지 마세요.

## 설치와 채팅

1. VS Code에 school-code-0.6.0.vsix를 설치합니다.
2. School Code 채팅 패널의 **연결 및 외부 MCP → Chrome 확장 폴더 열기**를 누릅니다.
3. Chrome chrome://extensions에서 개발자 모드를 켜고 **압축해제된 확장 프로그램 로드**로 열린 chrome-extension 폴더를 선택합니다.
4. VS Code의 **브라우저 연결**을 눌러 로그인된 학교 탭을 엽니다. Chrome 확장이 자동 연결합니다.
5. **모델·에이전트 새로고침**을 누르고 대화합니다.

북마크나 연결 코드 복사는 더 이상 필요 없습니다. 학교 탭은 열어 두세요. 페이지 새로고침, VS Code 재시작 후 자동 재연결합니다. Chrome에서 로컬 네트워크 권한을 요청하면 직접 허용해야 합니다.

기존 이미지 MCP Connector(18765)와 별도로 School Code Connector(18766)를 함께 사용할 수 있습니다. Chrome 팝업에서 브리지·탭·연결 상태를 확인하거나 다시 연결할 수 있습니다. 포트를 바꾸면 VS Code 설정과 Chrome 팝업 설정을 동일하게 맞추세요. 여러 학교 탭 중 첫 번째 탭 하나만 사용합니다.

- **기본 / 빠른 / 깊은 / 다이렉트**를 학교 API의 `fast`, `deep`, `direct` 필드로 전달합니다. 빠른 모드의 최종 모델 라우팅은 학교 서버가 결정합니다. 학교 웹 UI는 빠른 모드 선택 시 모델도 자동 변경하지만 이 확장은 선택 모델을 유지합니다.
- 깊은 응답은 `/models`의 고급 모델만 허용합니다. 에이전트는 기본 모드를 사용합니다.
- **선택 코드**는 입력창에 추가되며, 전송 버튼을 누를 때 학교 AI로 전송됩니다.
- 대화 ID를 유지하여 후속 질문을 이어갑니다. **＋**는 확장에 표시된 대화를 초기화합니다. 학교 서버의 기존 대화는 삭제하지 않습니다.
- 대화 세션은 패널의 세션 목록에서 분리됩니다. 새 대화·이름 변경·삭제가 가능하며 세션마다 학교 대화 ID, 모델, 에이전트, 응답 모드와 도구 승인 설정을 따로 저장합니다.
- 도구 승인은 `매번 확인`, `읽기는 자동 승인 · 수정은 확인`, `모두 자동 승인` 중에서 세션별로 선택합니다. 기본값은 `매번 확인`이며, 자동 승인 모드에서도 프로젝트 루트·비밀 경로 제한은 유지됩니다.
- 중단 시 브라우저가 진행 중인 요청을 취소합니다. 이미 학교 서버에서 처리된 이용량까지 취소되는 것은 아닙니다. 자동 재전송하지 않습니다.
- 대화는 VS Code의 해당 작업 영역 로컬 상태에 최근 100개 메시지까지 저장됩니다.

## 연결된 프로젝트와 작업 공간 도구

패널 상단에 **연결된 프로젝트**가 표시됩니다. 처음에는 VS Code에서 열린 로컬 프로젝트를 사용합니다. **변경**에서 열린 프로젝트 또는 다른 디렉터리를 선택할 수 있으며 선택은 이 VS Code 작업 영역에 기억됩니다. 프로젝트 전체를 대화에 업로드하지 않고, MCP 에이전트가 필요한 시점에 파일 목록·검색·줄 범위 읽기를 요청합니다.

직접 파일 첨부는 MCP를 사용할 수 없는 일반 모델을 위한 보조 기능입니다.

1. **＋ 파일**에서 파일을 직접 고르거나, **＋ 폴더에서 선택**으로 폴더를 고른 뒤 첨부할 파일을 체크합니다.
2. 입력창 위 첨부 목록에서 파일명과 글자 수를 확인합니다. 파일명을 누르면 **실제로 전송할 저장본**을 읽기 전용 편집기로 볼 수 있습니다. × 또는 모두 빼기로 제외할 수 있습니다.
3. 질문을 입력하고 **전송**을 누르면 선택한 파일 내용만 질문과 함께 학교 AI로 전송됩니다. 전송 후 첨부 목록은 비워집니다. MCP 에이전트를 선택한 경우에는 첨부 없이도 연결된 프로젝트를 도구로 조사할 수 있습니다.

프로젝트 연결만으로 파일이 업로드되지는 않습니다. 첨부는 최대 10개, 파일당 30,000자, 합계 60,000자입니다. UTF-8 텍스트 파일을 지원하며 저장되지 않은 편집은 먼저 저장해야 합니다. 첨부 후 파일이 바뀌어도 미리 본 저장본이 전송됩니다. 최신 내용이 필요하면 파일을 다시 첨부하세요. 목록은 폴더당 최대 500개를 표시하므로 큰 프로젝트는 소스 하위 폴더를 선택하는 것이 좋습니다. Unity Library/Temp, 빌드 폴더, 비밀 파일, 링크 경로는 제외합니다. 사용자 정의 .gitignore 전체 해석은 아직 지원하지 않습니다.

프로젝트를 바꾸면 기존 첨부 목록을 비우고 외부 MCP 연결도 해제합니다. MCP를 다시 연결할 때도 이 패널에 선택된 프로젝트가 대상이 됩니다. 기존 채팅은 유지되므로 다른 프로젝트 이야기를 새로 시작하려면 **＋ 새 대화**를 사용하세요.

이 파일 첨부 기능에는 학교 MCP 등록이나 중계 서버가 필요하지 않습니다. 학교 AI가 스스로 파일을 검색하고 수정하도록 하려면 아래 외부 MCP 연결과 MCP가 연결된 학교 에이전트를 사용합니다.

## 외부 MCP 연결

채팅만 할 때는 중계 서버가 필요 없습니다. 학교 에이전트가 VS Code 도구를 호출할 때 중계 서버가 필요합니다.

```text
VS Code 채팅 → PC의 브라우저 연결 → 학교 AI
학교 에이전트 → HTTPS /mcp → 중계 서버 ← VS Code의 outbound polling
                                               ↓
                                      승인 후 프로젝트 작업
```

중계는 작업·결과를 메모리에만 보관합니다. NAS에 프로젝트 파일이나 학교 로그인 쿠키를 저장하지 않습니다. 등록 토큰 소지자는 도구 요청을 보낼 수 있습니다. 실제 파일 내용은 건별 승인 후 전달되므로 본인이 관리하는 HTTPS 서버를 사용하세요.

### PC에서 중계 실행

Node.js 22 이상:

```powershell
npm ci
npm run build
npm run keys
node --env-file=.local/relay.env dist/relay.cjs
```

`npm run keys`는 기존 키 파일을 덮어쓰지 않습니다. `.local/relay.env`에 서로 다른 `MCP_TOKEN`, `WORKER_TOKEN`을 생성합니다. 학교 인증 토큰이 아니라 이 프로그램 전용 키입니다.

VS Code 명령 팔레트의 **School Code: 외부 MCP 중계 연결**에서 `http://127.0.0.1:18880`과 `WORKER_TOKEN`을 입력하면 로컬 개발 테스트를 할 수 있습니다. 학교 서버에서 내 PC의 localhost에는 접속할 수 없으므로 학교 등록 실연결은 외부 HTTPS 주소가 필요합니다.

### 헤놀로지 / Synology Container Manager

이 `school-code` 폴더 전체를 NAS로 복사하되 `node_modules`는 필요 없습니다. `.local/relay.env`를 준비한 뒤:

```sh
docker compose -f deploy/compose.yaml up -d --build
```

DSM 역방향 프록시에서 **내 HTTPS 도메인 → HTTP 127.0.0.1:18880**으로 연결합니다. `/mcp`와 `/worker/*` 경로, Authorization 헤더를 유지하고 응답 타임아웃을 150초 이상으로 설정하세요. 유효한 TLS 인증서가 필요합니다. Compose는 NAS loopback에만 포트를 공개합니다. Docker 설치 구조상 역방향 프록시에서 NAS loopback에 접근할 수 없다면 해당 NAS 네트워크에 맞춰 배포 구성을 조정해야 합니다.

### 학교 등록

학교 **리소스 → MCP → 새로 만들기**:

| 항목 | 값 |
|---|---|
| 이름 | School Code Workspace |
| 전송 방식 | HTTP (Streamable HTTP) |
| 서버 URL | `https://내-도메인/mcp` |
| 인증 방식 | Bearer |
| 인증 JSON | `{"type":"bearer","token":"MCP_TOKEN 값"}` |

SSE 전송 방식이 아니라 **HTTP**를 선택하세요. 이 서버는 stateless Streamable HTTP를 구현합니다. VS Code에는 같은 도메인의 기본 주소와 **WORKER_TOKEN**을 입력합니다. 두 토큰을 바꾸어 쓰지 않습니다. VS Code 토큰은 SecretStorage에 저장합니다.

등록한 MCP를 학교 에이전트에 연결하고, 확장에서 에이전트 목록을 새로고침한 뒤 해당 에이전트를 선택하세요. 일반 모델 선택에는 `model_id`, 에이전트 선택에는 `agent_id`를 전송합니다. 학교 측 에이전트별 도구 연결/실행 정책은 서비스 설정에 따릅니다.

### 동아리와 공유할 때

동아리 구성원이 학교 AI로 일반 채팅만 하는 경우에는 MCP URL이나 토큰을 공유할 필요가 없습니다. 기존 학교 AI 사용 방법과 VSIX만 안내하면 됩니다.

각자 VS Code 프로젝트를 학교 에이전트에 연결하려는 경우에는 현재 구조에서 한 릴레이를 공동으로 쓰지 마세요. 릴레이는 `X-Worker-Id` 하나만 활성화하므로 두 번째 사용자는 `409 Another VS Code window is connected`가 되고, 토큰을 가진 사용자는 현재 연결된 워커에 도구 요청을 보낼 수 있습니다. 구성원별로 별도 릴레이 인스턴스와 별도 `MCP_TOKEN`을 두거나, 다중 워커·사용자별 권한을 지원하는 서버 구현을 먼저 추가해야 합니다.

공유 운영을 하기 전에는 다음 원칙을 지키세요.

- 학교 MCP 등록에는 `MCP_TOKEN`만 사용하고, VS Code에는 각자 자신의 `WORKER_TOKEN`을 SecretStorage로 입력합니다. 두 토큰을 서로 전달하지 않습니다.
- Notion integration secret과 Unity Editor 브리지 토큰은 각자의 PC에만 저장합니다.
- 구성원 세션은 기본 `매번 확인` 또는 `읽기는 자동 승인 · 수정은 확인`으로 시작합니다. `모두 자동 승인`은 본인이 관리하는 프로젝트에서만 사용합니다.
- 토큰이 단체 채팅·저장소·로그에 노출되면 즉시 릴레이 토큰을 교체하고 학교 MCP 등록 인증 JSON도 갱신합니다.
- 파일 내용과 Notion 조회 결과는 학교 AI로 전송될 수 있으므로, 동아리 프로젝트의 공개 범위와 학교 계정 정책을 먼저 확인합니다.

구성원에게 전달할 설치 문구는 `CLUB-SHARING.md`에 정리해 두었습니다.

추천 에이전트 지침:

> 사용자의 VS Code 프로젝트를 돕는 코딩 도우미입니다. 파일을 추측하지 말고 workspace_info, list_files, read_file, search_text로 확인합니다. 수정 전 read_file에서 최신 SHA-256을 받고 propose_edit의 expected_sha256에 전달합니다. propose_edit는 파일 전체 내용을 사용합니다. 사용자 승인 거절, 시간 초과, 오프라인이면 반복 호출하지 말고 이유를 알려 주세요. 비밀 파일을 요청하지 마세요.

### Notion 읽기 전용

Notion에서 Internal Integration을 만든 뒤 읽을 페이지와 데이터베이스를 해당 integration에 **공유**합니다. VS Code 명령 팔레트에서 **School Code: Notion 연결 설정**을 실행하고 integration secret을 입력하세요. 토큰은 VS Code SecretStorage에만 저장되며 NAS 중계 서버로 복사하지 않습니다. 해제는 **School Code: Notion 연결 해제**입니다.

학교 에이전트에는 다음 읽기 전용 도구가 보입니다.

- `notion_search`: 공유된 페이지 검색
- `notion_fetch_page`: 페이지 제목·URL·수정 시각 조회
- `notion_list_children`: 페이지/블록의 텍스트와 하위 블록 목록 조회

Notion 쓰기 API는 노출하지 않습니다. 모든 조회도 세션 승인 모드에 따라 승인되며, 페이지가 integration에 공유되지 않았거나 토큰이 없으면 명확한 오류를 반환합니다.

### Unity CLI

명령 팔레트의 **School Code: Unity CLI 경로 설정** 또는 `schoolCode.unityExecutable` 설정으로 Unity 실행 파일을 지정합니다. 에이전트가 사용할 수 있는 도구는 고정되어 있습니다.

- `unity_project_info`: Unity 버전·Assets·패키지 수 확인
- `unity_run_tests`: EditMode 또는 PlayMode 테스트 실행
- `unity_build`: `StandaloneWindows64`, `StandaloneLinux64`, `StandaloneOSX`, `WebGL` 빌드
- `unity_refresh_assets`: batch mode로 에셋 임포트/새로 고침

임의 셸 명령과 임의 `-executeMethod`는 제공하지 않습니다. 빌드 출력 경로는 연결된 프로젝트 안의 상대 경로만 허용합니다.

### Unity Editor 실시간 브리지

`unity-editor/SchoolCodeMcpBridge.cs`를 Unity 프로젝트의 `Assets/Editor/`에 복사한 뒤 Unity 메뉴에서 **School Code → MCP Bridge → Start**를 실행합니다. **Copy Token**으로 토큰을 복사하고 VS Code의 **School Code: Unity Editor 연결 설정**에 입력하세요. 기본 loopback 포트는 `127.0.0.1:18777`이며 `schoolCode.unityEditorPort`와 Unity EditorPrefs 포트를 맞춰야 합니다.

브리지 도구는 `unity_open_scene`, `unity_find_gameobjects`, `unity_get_component`, `unity_set_component`, `unity_create_gameobject`, `unity_save_scene`입니다. loopback과 Bearer 토큰을 사용하고 C#·셸 명령을 실행하지 않습니다. 씬/오브젝트를 바꾸는 세 도구는 쓰기 승인 대상입니다. 자세한 설치는 `unity-editor/README.md`를 참고하세요.

### 프로젝트 Skill 자동 로더

연결된 프로젝트의 `.school-code/skills/<name>/SKILL.md`만 자동으로 검색합니다. `workspace_info`가 Skill 목록과 설명을 제공하고, 에이전트가 `read_skill`로 필요한 지침을 읽습니다. 저장소 전체의 `skills` 폴더를 재귀 검색하지 않으므로 `tools/school-image-mcp/skills` 같은 다른 도구의 Skill은 섞이지 않습니다.

이 저장소에는 `notion-research`, `unity-game-dev`, `unity-build` 예제가 포함되어 있습니다. 다른 프로젝트에서도 같은 `.school-code/skills` 구조로 추가할 수 있습니다.

### 제공 도구

- `workspace_info`: 연결된 작업 영역 이름, 격리 범위, 지침 파일 및 기능
- `list_files`: 최대 500개 파일 목록
- `read_file`: UTF-8 텍스트 및 SHA-256
- `search_text`: 문자열 검색
- `read_asset_metadata`: 바이너리 내용을 전송하지 않고 크기·형식·수정 시각·SHA-256 확인
- `read_instructions`: `AGENTS.md`, `CODEX.md`, `CLAUDE.md` 등의 프로젝트 지침 읽기
- `read_skill`: 프로젝트 `.school-code/skills` 지침 읽기
- `propose_edit`: 전체 파일 수정안 → VS Code diff → 승인 → 적용·저장

읽기·검색·수정은 **건별 승인**합니다. 수정은 검토 중 파일이 바뀌면 거절됩니다. 작업은 120초 후 만료되므로 승인 알림을 확인하세요. 로컬 프로젝트 하나만 연결되며 다른 창이 중계를 동시에 점유할 수 없습니다. `.env`, 키 파일, `.git`, `.ssh`, 의존성 폴더, 심볼릭 링크/정션, 상위 경로 접근을 차단합니다. 임의 터미널 실행·파일 삭제·디렉터리 생성은 이 버전에서 제공하지 않습니다.

## 검증과 현재 범위

`npm test`: MCP SDK 클라이언트로 initialize/tools/list/tools/call 왕복, 토큰 분리, 시간 초과, 브라우저 스트림/취소, SSE 경계, 경로 이탈·비밀 파일·정션 거부를 검증합니다.

학교에서 확인된 정보: 모델 14개, Astra/Fable ID, 모델 목록과 에이전트 목록 API, `fast/deep/direct`, `agent_id`, SSE 이벤트 형식. 외부 HTTPS 배포와 학교 MCP→실제 VS Code 작업의 전체 경로는 실제 서버 주소와 브라우저 연결 후 별도 검증해야 합니다.

현재는 프로젝트 도구 중심의 텍스트 채팅과 선택 코드 전송을 지원합니다. Notion 읽기 전용 조회, allowlist Unity CLI, Unity Editor 로컬 브리지, `.school-code/skills` 자동 로딩을 제공합니다. 이미지/PDF/문서 업로드, 기존 대화 목록 가져오기, 완전한 Markdown 렌더링, 임의 셸 실행은 아직 없습니다. 바이너리 자산은 메타데이터만 확인합니다.

## 개발

```powershell
npm test
npm run package
code --extensionDevelopmentPath="현재 school-code 폴더의 절대 경로"
```

출력 패널 **School Code**에서 중계 연결 오류를 확인할 수 있습니다. 토큰/학교 쿠키/대화 내용을 로그에 출력하지 않습니다.
