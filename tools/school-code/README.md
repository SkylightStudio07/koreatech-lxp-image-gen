# KOREATECH School Code — 0.13.1

VS Code에서 학교 Astra/Fable 모델과 대화하고, 코덱스식 프로젝트 도구로 현재 프로젝트를 검색·읽거나 수정안을 승인하는 확장입니다. OpenAI API 키 없이 학교 로그인 세션을 사용합니다. 학교·Microsoft가 제공하는 공식 확장은 아닙니다.

일반 사용자는 저장소를 내려받아 빌드하지 말고 GitHub Release에서 `school-code-0.13.1.vsix`와 `school-code-connector-0.2.0.zip`을 설치하세요. 이 문서는 기능·운영·개발 세부사항을 위한 문서이며, 구성원용 순서도는 저장소 루트의 [forBCSD.md](https://github.com/SkylightStudio07/koreatech-lxp-image-gen/blob/master/forBCSD.md)를 따릅니다.

> **공유 전 확인:** 기존에 동아리에서 사용하던 학교 AI MCP 서버는 권한이 있는 구성원에게 URL과 등록 정보를 공유해도 됩니다. School Code Workspace 릴레이는 이제 BCSD 계정 페어링을 통해 사용자·워크스페이스별 토큰과 워커 연결을 분리합니다. 기존 정적 `MCP_TOKEN`, `WORKER_TOKEN`도 호환되지만 새 설치에서는 브라우저 승인 방식을 권장합니다. 토큰, Notion 토큰, Unity Editor 토큰은 공개 저장소나 단체 채팅에 올리지 마세요.

## 설치와 채팅

1. VS Code에 `school-code-0.13.1.vsix`를 설치합니다.
2. School Code 채팅 패널의 **연결 및 외부 MCP → Chrome 확장 폴더 열기**를 누릅니다.
3. Chrome chrome://extensions에서 개발자 모드를 켜고 **압축해제된 확장 프로그램 로드**로 열린 chrome-extension 폴더를 선택합니다.
4. VS Code의 **브라우저 연결**을 눌러 로그인된 학교 탭을 엽니다. Chrome 확장이 자동 연결합니다.
5. **모델·에이전트 새로고침**을 누르고 대화합니다.

북마크나 연결 코드 복사는 더 이상 필요 없습니다. 학교 탭은 열어 두세요. 페이지 새로고침, VS Code 재시작 후 자동 재연결합니다. Chrome에서 로컬 네트워크 권한을 요청하면 직접 허용해야 합니다.

기존 이미지 MCP Connector(18765)와 별도로 School Code Connector(18766)를 함께 사용할 수 있습니다. Chrome 팝업에서 브리지·탭·연결 상태를 확인하거나 다시 연결할 수 있습니다. 포트를 바꾸면 VS Code 설정과 Chrome 팝업 설정을 동일하게 맞추세요. 여러 학교 탭 중 첫 번째 탭 하나만 사용합니다.

- **기본 / 빠른 / 깊은 / 다이렉트**를 학교 API의 `fast`, `deep`, `direct` 필드로 전달합니다. 빠른 모드의 최종 모델 라우팅은 학교 서버가 결정합니다. 학교 웹 UI는 빠른 모드 선택 시 모델도 자동 변경하지만 이 확장은 선택 모델을 유지합니다.
- 깊은 응답은 `/models`의 고급 모델만 허용합니다. 에이전트는 기본 모드를 사용합니다.
- 모델과 에이전트는 패널에서 별도 선택합니다. 두 값은 화면에 함께 보존되지만, 에이전트를 선택하면 학교 API가 에이전트의 모델·도구 설정을 우선 사용합니다. 에이전트를 비우면 선택해 둔 모델로 직접 응답합니다.
- **선택 코드**는 입력창에 추가되며, 전송 버튼을 누를 때 학교 AI로 전송됩니다.
- 대화 ID를 유지하여 후속 질문을 이어갑니다. **＋**는 확장에 표시된 대화를 초기화합니다. 학교 서버의 기존 대화는 삭제하지 않습니다.
- 대화 세션은 패널의 세션 목록에서 분리됩니다. 새 대화·이름 변경·삭제가 가능하며 세션마다 학교 대화 ID, 모델, 에이전트, 응답 모드와 도구 승인 설정을 따로 저장합니다.
- 세션별 **컨텍스트 압축**을 선택할 수 있습니다. 켜면 약 3.2만·6만·9만자 기준을 넘을 때 오래된 대화를 로컬 요약으로 묶고 새 학교 대화 ID로 이어갑니다. 서버가 자동 압축을 지원하는지와 관계없이 이 세션에서만 확실하게 동작하며, 압축하지 않을 때는 기존 대화 ID를 그대로 유지합니다.
- 도구 승인은 `매번 확인`, `읽기는 자동 승인 · 수정은 확인`, `모두 자동 승인` 중에서 세션별로 선택합니다. 기본값은 `매번 확인`이며, 자동 승인 모드에서도 프로젝트 루트·비밀 경로 제한은 유지됩니다.
- 중단 시 브라우저가 진행 중인 요청을 취소합니다. 이미 학교 서버에서 처리된 이용량까지 취소되는 것은 아닙니다. 자동 재전송하지 않습니다.
- 대화는 VS Code의 해당 작업 영역 로컬 상태에 최근 100개 메시지까지 저장됩니다.
- 학교 AI가 이미지 생성 결과를 첨부하면 Chrome의 로그인 탭에서 `/chat/uploads/{file_id}`를 받아 대화 안에 PNG/JPEG/WebP/GIF/SVG 미리보기로 표시합니다. 이미지 본문은 세션 저장소에 저장하지 않고 현재 확장 실행 중인 메모리에만 보관합니다.
- 입력창 위의 **파일 첨부 · 붙여넣기 또는 끌어 놓기**에서 이미지와 일반 파일을 채팅 참조로 보낼 수 있습니다. 화면 캡처를 입력창에 붙여넣거나 파일을 드롭하면 먼저 학교 로그인 탭으로 업로드하고, 전송할 때 `file_ids`와 `file_attachments`를 학교 API에 함께 전달합니다. 파일은 최대 5개, 파일당 32 MiB, 한 번에 합계 64 MiB까지 지원하며 업로드가 끝난 뒤 전송할 수 있습니다.
- 답변에 안전한 `svg` 코드 블록이 포함된 경우에도 대화 안에서 SVG 미리보기를 함께 표시합니다. 스크립트·이벤트 핸들러·외부 HTTP 참조가 있는 SVG는 코드로만 표시합니다.

## 연결된 프로젝트와 작업 공간 도구

채팅과 연결 설정을 분리했습니다. **채팅** 탭은 세션·모델·대화·첨부에 집중하고, **설정** 탭에서 프로젝트 폴더, 학교 브라우저 연결, MCP와 Unity/Notion 연결을 관리합니다. 채팅 화면의 상태 표시에서 브라우저가 끊겼으면 **연결**을 누르거나 설정 탭으로 이동하세요.

패널 상단에 **연결된 프로젝트**가 표시됩니다. 처음에는 VS Code에서 열린 로컬 프로젝트를 사용합니다. **변경**에서 열린 프로젝트 또는 다른 디렉터리를 선택할 수 있으며 선택은 이 VS Code 작업 영역에 기억됩니다. 프로젝트 전체를 대화에 업로드하지 않고, MCP 에이전트가 필요한 시점에 파일 목록·검색·줄 범위 읽기를 요청합니다.

직접 파일 첨부는 MCP를 사용할 수 없는 일반 모델을 위한 보조 기능입니다.

1. **＋ 파일**에서 파일을 직접 고르거나, **＋ 폴더에서 선택**으로 폴더를 고른 뒤 첨부할 파일을 체크합니다.
2. 입력창 위 첨부 목록에서 파일명과 글자 수를 확인합니다. 파일명을 누르면 **실제로 전송할 저장본**을 읽기 전용 편집기로 볼 수 있습니다. × 또는 모두 빼기로 제외할 수 있습니다.
3. 질문을 입력하고 **전송**을 누르면 선택한 파일 내용만 질문과 함께 학교 AI로 전송됩니다. 전송 후 첨부 목록은 비워집니다. MCP 에이전트를 선택한 경우에는 첨부 없이도 연결된 프로젝트를 도구로 조사할 수 있습니다.

프로젝트 연결만으로 파일이 업로드되지는 않습니다. 첨부는 최대 10개, 파일당 30,000자, 합계 60,000자입니다. UTF-8 텍스트 파일을 지원하며 저장되지 않은 편집은 먼저 저장해야 합니다. 첨부 후 파일이 바뀌어도 미리 본 저장본이 전송됩니다. 최신 내용이 필요하면 파일을 다시 첨부하세요. 목록은 폴더당 최대 500개를 표시하므로 큰 프로젝트는 소스 하위 폴더를 선택하는 것이 좋습니다. Unity Library/Temp, 빌드 폴더, 비밀 파일, 링크 경로는 제외합니다. 사용자 정의 .gitignore 전체 해석은 아직 지원하지 않습니다.

프로젝트를 바꾸면 기존 첨부 목록을 비우고 외부 MCP 연결도 해제합니다. MCP를 다시 연결할 때도 이 패널에 선택된 프로젝트가 대상이 됩니다. 기존 채팅은 유지되므로 다른 프로젝트 이야기를 새로 시작하려면 **＋ 새 대화**를 사용하세요.

이 파일 첨부 기능에는 학교 MCP 등록이나 중계 서버가 필요하지 않습니다. 학교 AI가 스스로 파일을 검색하고 수정하도록 하려면 아래 외부 MCP 연결과 MCP가 연결된 학교 에이전트를 사용합니다.

## MCP 카탈로그와 연결 관리

패널의 **MCP 카탈로그**에서 학교 Workspace, Notion, Unity CLI, Unity Editor MCP, Blender MCP, Unreal MCP를 한 곳에서 확인하고 연결·해제할 수 있습니다. 카탈로그의 **사이트** 버튼은 `schoolCode.mcpCatalogUrl`에 지정한 학교/개인 카탈로그를 열고, 주소를 아직 지정하지 않았다면 최초 한 번 입력받아 전역 설정에 저장합니다. HTTPS만 허용하며 로컬 개발 주소는 `localhost`·`127.0.0.1`만 HTTP를 사용할 수 있습니다.

Blender·Unreal처럼 별도 서버를 쓰는 항목은 주소와 Bearer 토큰을 입력하면 연결 정보와 토큰이 저장됩니다. 주소·기능 목록은 VS Code의 로컬 상태에, 토큰은 SecretStorage에만 저장됩니다. 이 확장은 임의의 외부 MCP를 학교 AI의 에이전트에 자동 등록하거나 서버 도구를 대신 실행하지 않습니다. 학교 **리소스 → MCP**에서 서버를 등록하고 해당 서버가 연결된 에이전트를 선택해야 실제 대화에서 도구가 호출됩니다. 카탈로그는 이 과정을 한 곳에서 관리하기 위한 클라이언트 설정 화면입니다.

연결 항목의 **끄기**는 로컬 사용 여부만 끄고 저장된 주소·토큰은 유지합니다. **해제**는 해당 연결의 저장 정보와 SecretStorage 토큰을 삭제합니다. 학교 Workspace를 해제하면 현재 프로젝트에 대한 릴레이 폴링도 중단됩니다.

### MCP별 연결 순서

먼저 공통으로 VS Code에서 프로젝트 폴더를 열고 **연결된 프로젝트 → 프로젝트 선택**을 합니다. 학교 AI 대화 자체는 **브라우저 연결** 버튼으로 연결하고, MCP 도구는 별도로 **MCP 카탈로그**에서 연결합니다. 둘은 서로 다른 연결입니다.

| MCP | 패널에서 할 일 | 연결이 완료된 상태 |
|---|---|---|
| 학교 Workspace | **학교 Workspace → 연결** → `BCSD 계정으로 브라우저 승인`(권장) 또는 `WORKER_TOKEN` 입력 | `연결됨`과 `도구별 승인` 표시 |
| Notion | Integration Secret을 입력하거나 공개 Notion 페이지 링크를 **Notion → 연결**에 붙여넣기 | `설정됨` 표시. 학교 Workspace와 에이전트도 필요 |
| Unity CLI | Unity 프로젝트를 선택하고 **Unity CLI → 연결** → `Unity.exe` 경로 입력 | `설정됨` 표시. Editor 브리지는 필요 없음 |
| Unity Editor MCP | **Unity Editor MCP → 자동 준비** → Unity Editor 로그인/프로젝트 로딩 | `연결됨` 표시. 브리지 파일·토큰·Editor 실행을 자동 처리 |
| Blender MCP | 실행 중인 HTTPS MCP의 주소(대개 `/mcp`)와 Bearer 토큰 입력 | `설정됨` 표시. 학교 리소스·에이전트 등록도 필요 |
| Unreal MCP | 실행 중인 HTTPS MCP의 주소와 Bearer 토큰 입력 | `설정됨` 표시. 학교 리소스·에이전트 등록도 필요 |

Blender·Unreal MCP는 서버마다 인증·전송 방식이 다릅니다. 이 확장의 카탈로그는 **HTTPS MCP 주소와 토큰을 저장하는 연결 관리 화면**이며, stdio 전용 서버를 대신 실행하지 않습니다. 학교 AI에서 실제 도구를 쓰려면 서버의 `/mcp` 주소와 `MCP_TOKEN`을 학교 **리소스 → MCP**에 등록하고 그 MCP가 연결된 에이전트를 골라야 합니다.

#### 학교 Workspace 주소와 토큰 구분

확장 입력창에는 `/health`나 `/mcp`를 붙이지 않은 **기본 주소**를 넣습니다.

```text
확장 입력: https://내-도메인:3010
상태 확인: https://내-도메인:3010/health
학교 MCP 등록: https://내-도메인:3010/mcp
```

`/health`에서 `true`가 나오는 것은 NAS 서버가 살아 있다는 뜻일 뿐, VS Code 워커가 인증되어 연결됐다는 뜻은 아닙니다. 페어링 방식에서는 확장이 발급받은 개인 워커 토큰과 MCP 토큰을 자동으로 사용합니다. 정적 토큰 모드에서는 확장에 `WORKER_TOKEN`을, 학교 MCP 등록에는 별도의 `MCP_TOKEN`을 입력합니다. 두 토큰을 바꾸면 패널에 **연결 안 됨** 또는 `401` 오류가 표시됩니다. 역방향 프록시가 `/auth/*`, `/worker/*`, `/mcp` 경로와 `Authorization` 헤더를 그대로 전달하는지도 확인하세요. 같은 사용자·워크스페이스에서만 한 VS Code 창 연결을 제한합니다.

0.8.2부터 중계 서버 선택 창에 `bcsd-nai`가 기본값으로 표시되고, 아래에 **사용자 지정 주소 입력** 항목이 표시됩니다. `health는 true인데 연결 안 됨`이면 보통 기본 주소에 `/health`를 넣었거나, `WORKER_TOKEN`이 틀렸거나, 프록시가 `/worker/*`를 전달하지 않는 경우입니다. **MCP 해제** 후 `bcsd-nai (기본 서버)` 또는 사용자 지정 주소와 `WORKER_TOKEN`을 다시 입력해 보세요.

#### Unity CLI 경로 오류

`Unable to write to User Settings because schoolCode.unityExecutable is not a registered configuration` 오류가 나오면 이전 VSIX가 설치된 상태입니다. `school-code-0.13.1.vsix`로 업데이트하고 **Developer: Reload Window**를 실행하세요. 0.8.1부터 Unity 경로는 VS Code User Settings를 갱신하지 않고 확장 전용 상태에 저장하므로 해당 설정 오류가 발생하지 않습니다. `Unity.exe`가 PATH에 있으면 그대로 입력하고, 아니면 `C:\Program Files\Unity\Hub\Editor\버전\Editor\Unity.exe`처럼 전체 경로를 입력합니다.

Unity CLI는 **학교 Workspace 연결 → Unity CLI 경로 설정 → Unity 에이전트 선택** 순서로 사용합니다. 카탈로그의 버튼 이름도 `경로 설정`으로 표시됩니다. 이 단계는 `Unity.exe` 위치를 저장하는 것이며, 계속 실행 중인 MCP 서버를 만드는 과정이 아닙니다. 경로를 저장했다고 해서 학교 에이전트가 자동으로 선택되는 것도 아닙니다. 프로젝트 안에서만 테스트·빌드가 실행되며, 빌드와 에셋 새로 고침은 승인 창이 뜹니다.

코덱스나 클로드에서 “Unity 연결 설정”만으로 씬까지 바로 다뤄지는 것은 보통 해당 환경에 Unity Editor MCP 패키지와 서버 등록이 이미 되어 있기 때문입니다. School Code도 이제 **Unity Editor MCP → 자동 준비** 한 번으로 `Assets/Editor/SchoolCodeMcpBridge.cs` 설치, 사용자별 토큰 생성, Unity Editor 실행, 로컬 브리지 확인까지 처리합니다. 처음 한 번은 Unity Hub/Editor 로그인이 필요할 수 있습니다. 따라서 다음처럼 구분하면 됩니다.

| 하려는 일 | 필요한 연결 |
|---|---|
| 프로젝트 정보, EditMode/PlayMode 테스트, 배치 빌드, 에셋 새로 고침 | Unity CLI 경로 + 학교 Workspace MCP |
| 열린 씬, GameObject, 컴포넌트 조회·수정 | Unity Editor MCP 브리지 + 학교 Workspace MCP |
| Unity Skill 사용 | `.agents/skills` 또는 `.school-code/skills` 지침. 실행 연결을 대신 만들지는 않음 |

두 Unity 연결 모두 학교 에이전트가 연결된 Workspace MCP를 통해 호출됩니다. Unity CLI만 `설정됨`이고 Editor 브리지가 `미설정`인 상태는 정상이며, CLI 작업만 가능한 상태입니다. Editor 작업을 요청하면 **자동 준비**가 브리지 설치·토큰 등록·Editor 실행까지 처리하고, Unity 로그인과 프로젝트 로딩만 기다리면 됩니다.

## 외부 MCP 연결

채팅만 할 때는 중계 서버가 필요 없습니다. 학교 에이전트가 VS Code 도구를 호출할 때 중계 서버가 필요합니다.

```text
VS Code 채팅 → PC의 브라우저 연결 → 학교 AI
학교 에이전트 → HTTPS /mcp → 중계 서버 ← VS Code의 outbound polling
                                               ↓
                                      승인 후 프로젝트 작업
```

### BCSD 계정 페어링(권장)

0.10.0부터 운영자는 정적 토큰을 구성원에게 복사해 주지 않아도 됩니다. 릴레이를 실행할 때 `AUTH_STORE_PATH`를 지정하면 사용자 계정·세션·토큰 해시가 NAS의 별도 파일에 저장됩니다.

1. VS Code 설정의 **Workspace 연결 / 재연결**을 누릅니다. 저장된 토큰이 있으면 브라우저 없이 자동으로 재연결합니다.
2. 처음 연결하거나 토큰이 없을 때만 **BCSD 계정으로 브라우저 승인**을 선택합니다.
3. 확장이 브라우저의 `/auth/pair` 페이지를 엽니다. 처음이면 아이디와 8자 이상 비밀번호로 가입하고, 이미 계정이 있으면 로그인합니다.
4. **이 기기를 연결**을 누르면 페어링이 완료됩니다. VS Code는 개인 `WORKER_TOKEN`과 학교 MCP 등록용 `MCP_TOKEN`을 SecretStorage에 한 번만 저장합니다.

페어링 코드는 10분 뒤 만료되고 한 번만 토큰을 전달합니다. 사용자의 계정·기기·워크스페이스가 토큰에 연결되므로 한 사용자의 MCP 요청이 다른 사용자의 워커로 넘어가지 않습니다. 연결 후 VS Code를 다시 열어도 저장된 토큰으로 자동 재연결합니다. 운영자가 가입을 닫으려면 `ALLOW_REGISTRATION=false`와 `REGISTRATION_CODE`를 설정하세요. 연결이 꼬였을 때만 **토큰 재발급 (문제 해결)**을 사용하고, 기존 정적 토큰을 써야 하는 경우 인증 방식에서 **수동 WORKER_TOKEN 입력**을 선택하면 됩니다.

중계는 작업·결과를 메모리에만 보관합니다. NAS에 프로젝트 파일이나 학교 로그인 쿠키를 저장하지 않습니다. 등록 토큰 소지자는 도구 요청을 보낼 수 있습니다. 실제 파일 내용은 건별 승인 후 전달되므로 본인이 관리하는 HTTPS 서버를 사용하세요.

### PC에서 중계 실행

Node.js 22 이상:

```powershell
npm ci
npm run build
npm run keys
node --env-file=.local/relay.env dist/relay.cjs
```

`npm run keys`는 기존 키 파일을 덮어쓰지 않습니다. `.local/relay.env`에 서로 다른 `MCP_TOKEN`, `WORKER_TOKEN`을 생성합니다. 학교 인증 토큰이 아니라 이 프로그램 전용 키입니다. 새 사용자 페어링을 쓸 때는 다음 환경 변수를 추가하세요.

```dotenv
AUTH_STORE_PATH=/volume1/docker/school-code-data/auth.json
PUBLIC_URL=https://bcsd-nai.mywire.org:3010
# 선택: true가 기본값. 초대 코드만 허용하려면 false로 변경
ALLOW_REGISTRATION=true
# 선택: 가입 코드가 필요할 때만 설정
REGISTRATION_CODE=동아리-초대코드
```

`AUTH_STORE_PATH` 파일에는 비밀번호와 토큰 원문이 저장되지 않고 해시만 저장됩니다. 이 파일은 Git·공개 공유 폴더에 두지 말고 NAS 백업 권한도 운영자에게만 주세요. `PUBLIC_URL`은 역방향 프록시의 외부 HTTPS 주소여야 하며, 없으면 요청의 Host 헤더로 페어링 링크를 만듭니다.

VS Code 명령 팔레트의 **School Code: 외부 MCP 중계 연결**에서 `http://127.0.0.1:18880`과 `WORKER_TOKEN`을 입력하면 로컬 개발 테스트를 할 수 있습니다. 학교 서버에서 내 PC의 localhost에는 접속할 수 없으므로 학교 등록 실연결은 외부 HTTPS 주소가 필요합니다.

### 헤놀로지 / Synology Container Manager

이 `school-code` 폴더 전체를 NAS로 복사하되 `node_modules`는 필요 없습니다. `.local/relay.env`를 준비한 뒤:

```sh
docker compose -f deploy/compose.yaml up -d --build
```

DSM 역방향 프록시에서 **내 HTTPS 도메인 → HTTP 127.0.0.1:18880**으로 연결합니다. `/mcp`와 `/worker/*` 경로, Authorization 헤더를 유지하고 응답 타임아웃을 150초 이상으로 설정하세요. 유효한 TLS 인증서가 필요합니다. Compose는 NAS loopback에만 포트를 공개합니다. Docker 설치 구조상 역방향 프록시에서 NAS loopback에 접근할 수 없다면 해당 NAS 네트워크에 맞춰 배포 구성을 조정해야 합니다.

### 학교 등록

학교 **리소스 → MCP → 새로 만들기**. 페어링을 마친 뒤 패널의 **MCP 인증 JSON 복사**를 누르면 개인 Bearer JSON을 클립보드에 넣어 줍니다. 정적 토큰 모드에서는 운영자가 발급한 `MCP_TOKEN`을 사용합니다.

| 항목 | 값 |
|---|---|
| 이름 | School Code Workspace |
| 전송 방식 | HTTP (Streamable HTTP) |
| 서버 URL | `https://내-도메인/mcp` |
| 인증 방식 | Bearer |
| 인증 JSON | `{"type":"bearer","token":"MCP_TOKEN 값"}` |

SSE 전송 방식이 아니라 **HTTP**를 선택하세요. 이 서버는 stateless Streamable HTTP를 구현합니다. 페어링 모드에서는 VS Code가 워커 토큰을 자동으로 사용하고, 정적 모드에서만 **WORKER_TOKEN**을 직접 입력합니다. 두 토큰을 바꾸어 쓰지 않습니다. VS Code 토큰은 SecretStorage에 저장합니다.

등록한 MCP를 학교 에이전트에 연결하고, 확장에서 에이전트 목록을 새로고침한 뒤 해당 에이전트를 선택하세요. 일반 모델 선택에는 `model_id`, 에이전트 선택에는 `agent_id`를 전송합니다. 학교 측 에이전트별 도구 연결/실행 정책은 서비스 설정에 따릅니다.

### 동아리와 공유할 때

동아리에서 이미 사용하던 **기존 학교 AI MCP 서버**를 계속 공유하는 경우에는 서버 URL과 인증 JSON을 권한이 있는 구성원에게 개인적으로 전달하면 됩니다. 학교 AI의 **리소스 → MCP → 새로 만들기**에서 같은 전송 방식·URL·Bearer 인증을 등록하고, 해당 MCP를 사용하는 에이전트에 연결하면 됩니다. 서버가 이미지 생성이나 학교 계정 할당량을 사용하는 경우에는 사용량과 비용/쿼터가 운영자 계정에 귀속되는지 함께 안내하세요.

School Code Workspace를 구성원과 함께 사용할 때는 정적 MCP 토큰을 단체 채팅에 공유하지 말고 BCSD 계정 페어링을 사용하세요. 페어링 토큰은 사용자·기기·워크스페이스별로 분리되고, 같은 계정·워크스페이스에서 두 번째 창이 연결되면 기존 워커를 보호하기 위해 `409`가 반환됩니다. 기존 정적 토큰을 운영하는 경우에는 사용자별 릴레이 인스턴스 또는 별도 워커 토큰을 발급하세요.

공유 운영을 하기 전에는 다음 원칙을 지키세요.

- 기존 공유 MCP의 등록 토큰은 권한이 있는 구성원에게만 개인적으로 전달하고, `School Code Workspace MCP`의 `MCP_TOKEN`은 기존 공유 MCP와 분리합니다.
- Workspace MCP를 개인별로 운영할 때는 VS Code에 자신의 `WORKER_TOKEN`을 SecretStorage로 입력합니다. `WORKER_TOKEN`은 다른 사람에게 전달하지 않습니다.
- Notion integration secret과 Unity Editor 브리지 토큰은 각자의 PC에만 저장합니다.
- 구성원 세션은 기본 `매번 확인` 또는 `읽기는 자동 승인 · 수정은 확인`으로 시작합니다. `모두 자동 승인`은 본인이 관리하는 프로젝트에서만 사용합니다.
- 토큰이 단체 채팅·저장소·로그에 노출되면 즉시 릴레이 토큰을 교체하고 학교 MCP 등록 인증 JSON도 갱신합니다.
- 파일 내용과 Notion 조회 결과는 학교 AI로 전송될 수 있으므로, 동아리 프로젝트의 공개 범위와 학교 계정 정책을 먼저 확인합니다.

구성원에게 전달할 설치 문구는 `CLUB-SHARING.md`에 정리해 두었습니다.

추천 에이전트 지침:

> 사용자의 VS Code 프로젝트를 돕는 코딩 도우미입니다. 먼저 workspace_info로 도구와 제한을 확인하고 파일을 추측하지 말고 list_files, read_file, search_text로 확인합니다. 수정 전 read_file에서 최신 SHA-256을 받고 propose_edit의 expected_sha256에 전달합니다. propose_edit는 파일 전체 내용을 사용합니다. Unity CLI나 테스트처럼 명령 실행이 필요하면 run_shell을 사용하고, 90초를 넘길 작업은 start_background_task로 시작한 뒤 task_status/task_output으로 확인합니다. 명령 전체와 작업 디렉터리를 사용자에게 설명하고, 승인 거절·시간 초과·오프라인이면 반복 호출하지 말고 이유를 알려 주세요. 비밀 파일과 민감한 환경 변수를 요청하지 마세요.

### Notion 읽기 전용

Notion에서 Internal Integration을 만든 뒤 읽을 페이지와 데이터베이스를 해당 integration에 **공유**합니다. 패널의 **연결 및 외부 MCP → Notion 연결 설정**을 누르고 integration secret을 입력하세요. 토큰은 VS Code SecretStorage에만 저장되며 NAS 중계 서버로 복사하지 않습니다. 해제는 **Notion 연결 해제**입니다. 명령 팔레트의 같은 이름 명령도 사용할 수 있습니다.

공개된 Notion 페이지만 읽을 때는 Integration을 만들 필요가 없습니다. Notion에서 **공유 → 웹에 게시**를 켠 뒤 생성된 `https://...notion.site/...` 또는 `https://www.notion.so/...` 링크를 같은 입력창에 붙여넣으세요. 링크가 실제로 공개되어 있는지 확인한 뒤 VS Code의 전역 상태에 주소만 저장합니다. 공개 페이지의 하위 페이지도 함께 검색하며, `notion_fetch_page`에는 검색 결과의 URL을 그대로 넘길 수 있습니다. 대화에 공개 링크를 직접 붙여 넣어도 페이지 읽기가 가능하고, 반복 검색하려는 링크만 패널에 등록하면 됩니다. 여러 공개 루트는 쉼표로 구분해 한 번에 등록합니다.

사용 순서는 `연결된 프로젝트` 선택 → **외부 MCP 연결** → Notion을 등록한 학교 **에이전트** 선택입니다. 이후 “Notion에서 `키워드`가 들어간 페이지를 찾아 요약해줘” 또는 “이 Notion 링크를 읽고 핵심만 정리해줘”처럼 질문하면 에이전트가 `notion_search`, `notion_fetch_page`, `notion_list_children`를 사용합니다. 공개 링크 방식은 해당 링크와 그 아래 공개된 페이지 범위만 검색합니다. Integration 방식은 Integration에 공유한 범위가 검색 대상입니다. 조회 요청은 도구 승인 설정에 따라 확인 창이 뜹니다.

학교 에이전트에는 다음 읽기 전용 도구가 보입니다.

- `notion_search`: 공유된 페이지 검색
- `notion_fetch_page`: 페이지 제목·URL·수정 시각 조회
- `notion_list_children`: 페이지/블록의 텍스트와 하위 블록 목록 조회

Notion 쓰기 API는 노출하지 않습니다. 모든 조회도 세션 승인 모드에 따라 승인되며, 페이지가 Integration에 공유되지 않았고 공개 링크도 등록하지 않았다면 명확한 오류를 반환합니다. 공개 링크 읽기는 Notion의 공개 읽기 엔드포인트를 사용하므로 로그인 정보나 Integration Secret을 전송하지 않습니다.

### Unity CLI

패널의 **연결 및 외부 MCP → Unity CLI 경로 설정** 또는 명령 팔레트의 **School Code: Unity CLI 경로 설정**에서 `Unity.exe` 경로를 지정합니다. `Unity.exe`가 PATH에 있으면 기본값 그대로 둘 수 있습니다. 에이전트가 사용할 수 있는 도구는 고정되어 있습니다.

사용 순서는 Unity 프로젝트를 **연결된 프로젝트**로 선택 → Unity CLI 경로 설정 → **외부 MCP 연결** → 학교 **에이전트** 선택입니다. 예를 들어 “현재 Unity 프로젝트 정보를 확인하고 EditMode 테스트를 실행해줘” 또는 “Windows 빌드를 `Builds/windows/game.exe`에 만들어줘”라고 요청하면 에이전트가 적절한 CLI 도구를 고릅니다. 빌드와 에셋 새로 고침은 파일이 바뀔 수 있어 승인 창이 뜨며, 출력 경로는 프로젝트 내부 상대 경로만 허용합니다.

- `unity_project_info`: Unity 버전·Assets·패키지 수 확인
- `unity_run_tests`: EditMode 또는 PlayMode 테스트 실행
- `unity_build`: `StandaloneWindows64`, `StandaloneLinux64`, `StandaloneOSX`, `WebGL` 빌드
- `unity_refresh_assets`: batch mode로 에셋 임포트/새로 고침

Unity 공식 Skill이 요구하는 일반 CLI 작업은 아래 셸 하네스를 사용할 수 있습니다. 별도 승인을 거치며 작업 디렉터리는 연결된 프로젝트 내부로 제한됩니다.

### 작업 하네스와 셸

- `run_shell`: 연결된 프로젝트를 시작 디렉터리로 셸 명령을 실행합니다. 명령·작업 디렉터리·환경 변수·최대 90초 실행 시간·출력 상한을 적용하고, 파일이나 시스템을 바꿀 수 있으므로 쓰기 승인으로 처리합니다.
- `start_background_task`: Unity 설치, 긴 테스트, 빌드처럼 오래 걸리는 작업을 시작하고 작업 ID를 반환합니다. `task_status`, `task_output`, `task_cancel`로 관리할 수 있으며 최대 30분입니다.
- 민감한 환경 변수는 자식 프로세스에 전달하지 않습니다. 중계 연결이 끊기면 백그라운드 작업도 취소합니다.

셸은 VS Code 확장의 작업 디렉터리에서 시작하지만 Windows 자체를 가상화하거나 OS 권한을 낮추지는 않습니다. `cd ..`, 절대 경로, 네트워크 명령처럼 프로젝트 밖에 영향을 주는 명령도 실행할 수 있으므로 `모두 자동 승인` 모드에서는 특히 주의해야 합니다.

따라서 공식 `unity-cli` Skill의 지침을 읽을 수 있고, 그 지침이 요구하는 CLI 호출도 `run_shell` 또는 백그라운드 작업으로 실행할 수 있습니다. Unity 설치·라이선스·클라우드 로그인·원격 업로드처럼 프로젝트 밖에 영향을 주는 명령은 승인 창에서 명령 전체를 확인한 뒤 실행하세요. `unity_build` 같은 고정 도구는 계속 별도의 경로·대상 allowlist를 적용합니다.

### Unity Editor 실시간 브리지

일반적으로는 **Unity Editor MCP → 자동 준비**를 누릅니다. 확장이 `Assets/Editor/SchoolCodeMcpBridge.cs`를 설치하고 사용자별 토큰을 만든 뒤 설정된 Unity 실행 파일로 프로젝트를 엽니다. Unity Hub/Editor 로그인이 끝나고 프로젝트가 로드되면 브리지가 자동으로 시작됩니다. 기본 loopback 포트는 `127.0.0.1:18777`이며 `schoolCode.unityEditorPort`와 Unity EditorPrefs 포트를 맞춰야 합니다. 수동으로 설치할 때만 Unity 메뉴의 **School Code → MCP Bridge → Start/Copy Token**을 사용하세요.

브리지 도구는 `unity_open_scene`, `unity_find_gameobjects`, `unity_get_component`, `unity_set_component`, `unity_create_gameobject`, `unity_save_scene`입니다. loopback과 Bearer 토큰을 사용하고 C#·셸 명령을 실행하지 않습니다. 씬/오브젝트를 바꾸는 세 도구는 쓰기 승인 대상입니다. 자세한 설치는 `unity-editor/README.md`를 참고하세요.

### 프로젝트 Skill 자동 로더

연결된 프로젝트의 표준 `.agents/skills/<name>/SKILL.md`와 프로젝트 전용 `.school-code/skills/<name>/SKILL.md`를 자동으로 검색합니다. 같은 이름의 Skill이 둘 다 있으면 `.school-code/skills`가 우선합니다. `workspace_info`가 Skill 목록과 설명을 제공하고, 에이전트가 `read_skill`로 필요한 지침을 읽습니다. 저장소 전체의 `skills` 폴더를 재귀 검색하지 않으므로 `tools/school-image-mcp/skills` 같은 다른 도구의 Skill은 섞이지 않습니다.

Unity 공식 Skill은 프로젝트 터미널에서 다음처럼 설치할 수 있습니다.

```powershell
npx skills add Unity-Technologies/skills
```

설치된 `unity-cli` 지침은 `.agents/skills`에서 읽힙니다. 고정 Unity 도구 외의 공식 CLI 작업은 `run_shell`/`start_background_task`를 통해 별도 승인 후 실행됩니다. Editor 임의 C# 실행은 여전히 Unity Editor 브리지에 노출하지 않습니다.

이 저장소에는 `notion-research`, `unity-game-dev`, `unity-build` 예제가 포함되어 있습니다. 프로젝트별 지침이나 공식 Skill을 덮어쓸 때는 `.school-code/skills`에 같은 구조로 추가할 수 있습니다.

### 제공 도구

- `workspace_info`: 연결된 작업 영역 이름, 격리 범위, 지침 파일 및 기능
- `list_files`: 최대 500개 파일 목록
- `read_file`: UTF-8 텍스트 및 SHA-256
- `search_text`: 문자열 검색
- `read_asset_metadata`: 바이너리 내용을 전송하지 않고 크기·형식·수정 시각·SHA-256 확인
- `read_instructions`: `AGENTS.md`, `CODEX.md`, `CLAUDE.md` 등의 프로젝트 지침 읽기
- `read_skill`: 프로젝트 `.school-code/skills` 또는 `.agents/skills` 지침 읽기 (`.school-code` 우선)
- `run_shell`: 승인된 프로젝트 내부 셸 명령 실행
- `start_background_task`, `task_status`, `task_output`, `task_cancel`: 장시간 셸 작업 관리
- `propose_edit`: 전체 파일 수정안 → VS Code diff → 승인 → 적용·저장

프로젝트에 `AGENTS.md`, `CODEX.md`, `CLAUDE.md` 같은 지침 파일이 없으면 첫 `workspace_info` 때 School Code가 기본 루트 `AGENTS.md`를 자동으로 준비합니다. VS Code diff를 먼저 열고 현재 쓰기 승인 모드에 따라 생성하므로, 기본 `매번 확인`에서는 승인해야 파일이 생깁니다. 기존 지침 파일이 있으면 절대 덮어쓰지 않고 그 파일을 우선 읽습니다. 생성된 초안은 프로젝트를 조사한 뒤 에이전트에게 `propose_edit`으로 다듬도록 요청할 수 있습니다.

읽기·검색·수정은 **건별 승인**합니다. 수정은 검토 중 파일이 바뀌면 거절됩니다. 작업은 120초 후 만료되므로 승인 알림을 확인하세요. 로컬 프로젝트 하나만 연결되며 다른 창이 중계를 동시에 점유할 수 없습니다. `.env`, 키 파일, `.git`, `.ssh`, 의존성 폴더, 심볼릭 링크/정션, 상위 경로 접근을 차단합니다. 임의 터미널 실행·파일 삭제·디렉터리 생성은 이 버전에서 제공하지 않습니다.

## 검증과 현재 범위

`npm test`: MCP SDK 클라이언트로 initialize/tools/list/tools/call 왕복, 토큰 분리, 시간 초과, 브라우저 스트림/취소, SSE 경계, 경로 이탈·비밀 파일·정션 거부를 검증합니다.

학교에서 확인된 정보: 모델 14개, Astra/Fable ID, 모델 목록과 에이전트 목록 API, `fast/deep/direct`, `agent_id`, SSE 이벤트 형식. 외부 HTTPS 배포와 학교 MCP→실제 VS Code 작업의 전체 경로는 실제 서버 주소와 브라우저 연결 후 별도 검증해야 합니다.

현재는 프로젝트 도구 중심의 텍스트 채팅과 선택 코드 전송, 이미지 생성 결과 미리보기를 지원합니다. Notion 읽기 전용 조회, allowlist Unity 도구, 승인 기반 프로젝트 셸 하네스, 선택형 컨텍스트 압축, Unity Editor 로컬 브리지, `.agents/skills` 및 `.school-code/skills` 자동 로딩을 제공합니다. 이미지/PDF/문서의 참조 업로드, 기존 대화 목록 가져오기, 완전한 Markdown 렌더링, 서브에이전트는 아직 없습니다. 프로젝트 바이너리 자산은 계속 메타데이터만 확인합니다.

## 개발

```powershell
npm test
npm run package
# 릴리즈 첨부 파일(VSIX + Chrome ZIP + SHA256)을 만들려면
npm run package:release
code --extensionDevelopmentPath="현재 school-code 폴더의 절대 경로"
```

출력 패널 **School Code**에서 중계 연결 오류를 확인할 수 있습니다. 토큰/학교 쿠키/대화 내용을 로그에 출력하지 않습니다.
