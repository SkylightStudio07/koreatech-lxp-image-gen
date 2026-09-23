# school-image-mcp

KOREATECH 로그인 세션으로 이미지를 생성해 로컬 프로젝트에 PNG로 저장하는 Claude Code용 MCP 서버입니다. Node.js 22 이상이 필요합니다.

## 현재 구성

- MCP stdio: 공식 `@modelcontextprotocol/sdk` 사용, 5개 도구 제공.
- 기본 인증: 로그인된 Chrome 학교 탭의 쿠키를 그대로 사용합니다. 학교 쿠키·CSRF는 브라우저 밖으로 보내거나 디스크에 저장하지 않습니다.
- localhost 브리지: `127.0.0.1:18765`에만 바인딩합니다. 학교 origin만 CORS 허용, MCP 클라이언트와 브라우저 작업자 키를 분리합니다.
- 직접 HTTP 모드도 지원하지만 쿠키/CSRF를 사용자가 환경변수로 제공해야 합니다. Chrome 세션을 읽어 자동 추출하는 기능은 없습니다.

## 1. 설치 및 프로젝트 등록

필요한 것: Node.js 22 이상, Chrome의 학교 AI 로그인, Claude Code. 저장소를 내려받은 뒤 PowerShell에서 실행합니다. 아래 두 경로를 자신의 위치로 바꾸세요.

```powershell
$bridgeDir = 'C:\path\to\repository\tools\school-image-mcp'
$projectDir = 'C:\path\to\Project-Vertex'
Set-Location -LiteralPath $bridgeDir
npm.cmd ci
node scripts/install-project.js "$projectDir"
```

설치 스크립트는 다음을 만듭니다.

- 프로젝트 `.mcp.json`의 `school-image` 서버 항목: 현재 Node 실행 파일과 이 저장소의 서버 경로 사용.
- 프로젝트 `.claude/skills/school-image/SKILL.md`: Claude Code가 읽을 이미지 제작 스킬.
- 프로젝트 `GeneratedAssets/SchoolAI`: 기본 이미지 출력 폴더.

참조 루트는 프로젝트 폴더입니다. 기존 다른 MCP 설정은 보존하고, 이름이 같은 서버 설정이나 스킬이 다른 내용이면 덮어쓰지 않고 중단합니다. 동일 내용으로 재실행할 수 있습니다. **저장소를 이동하면 등록 경로도 다시 검토해야 합니다.** 서버 코드를 프로젝트로 복제하지 않습니다.

출력·참조 범위를 바꾸려면 생성된 `.mcp.json`의 `ALLOWED_OUTPUT_ROOT`, `ALLOWED_REFERENCE_ROOT`를 수정하세요. 참조 이미지는 학교 서버에 업로드됩니다. 설치된 스킬의 원본은 [`skills/school-image/SKILL.md`](skills/school-image/SKILL.md)입니다. 원본을 수정한 후에는 프로젝트에 설치된 복사본과 차이를 검토해 갱신하세요.

## 2. Chrome 연결

저장소를 받은 뒤 `tools\school-image-mcp\connect-school-image.bat`을 실행하면 브리지가 없을 때 별도 창에서 시작하고 현재 연결 코드를 클립보드에 복사한 다음 학교 채팅 페이지를 엽니다. 첫 사용 때 Chrome 북마크 URL에 붙여 넣어 저장하세요. 이후에는 학교 채팅 탭에서 저장한 북마크를 누르면 됩니다. 이 동작은 브라우저 보안상 사용자 클릭이 필요하며 배치 파일만으로 탭 안에 워커를 자동 주입할 수는 없습니다.

수동으로 하려면 서버 폴더의 PowerShell에서 브리지를 시작하고 실행 상태로 둡니다.

```powershell
node src/broker.js
```

다른 PowerShell에서 같은 서버 폴더로 이동해 연결 코드를 복사합니다.

```powershell
.\copy-connect.ps1
```

PowerShell 정책 때문에 스크립트가 실행되지 않으면 다음 명령으로도 복사할 수 있습니다.

```powershell
Get-Content -LiteralPath '.local/connect-bookmarklet.txt' -Raw | Set-Clipboard
```

Chrome 북마크를 하나 만들고 URL에 복사한 전체 코드를 붙여 넣습니다. [학교 채팅](https://ai.koreatech.ac.kr/AiCA/chat)에 로그인한 상태에서 그 북마크를 누르세요. 이 북마클릿은 이 저장소가 생성한 로컬 연결 코드이며 로그인 정보를 포함하지 않습니다. 주소창에 직접 붙여 넣을 경우 Chrome이 `javascript:` 접두어를 제거할 수 있으므로 북마크 방식이 편합니다.

Chrome이 **로컬 네트워크 접근**을 요청하면 허용해야 합니다. 사이트의 연결 대상은 이 PC의 `127.0.0.1:18765` 브리지입니다. 학교 탭을 열린 상태로 두세요. 탭을 새로고침하거나 닫은 경우, 브리지를 재시작한 경우에는 연결 북마크를 다시 누릅니다. 상태 확인:

```powershell
npm.cmd run doctor
```

정상 연결 시 `broker: true`, `connected: true`입니다. `broker: false`면 브리지 실행 여부를, `connected: false`면 학교 탭·연결 북마크·Chrome 권한을 확인하세요. 이미지 요청이 오래 실행 중일 때는 브라우저의 다음 폴링이 지연되어 일시적으로 false가 될 수 있습니다.

연결 코드는 학교 페이지에 `window.__schoolImageWorker`와 작업 대기 루프를 추가합니다. 탭을 닫으면 멈춥니다. 브리지는 실행한 터미널에서 Ctrl+C로 종료합니다. 쿠키를 파일로 추출하거나 Chrome의 보안 설정을 자동 변경하지 않습니다.

## 3. Claude Code 연결 및 스킬 사용

설정한 프로젝트를 Claude Code에서 열고 `school-image` 프로젝트 MCP 설정을 승인하세요. CLI라면 프로젝트 폴더에서:

```powershell
claude mcp get school-image
claude
```

`claude` 명령이 PATH에 없으면 평소 사용하는 VS Code Claude Code 패널에서 프로젝트를 여세요. MCP 승인 후 클라이언트가 도구를 다시 불러오도록 새 세션을 시작합니다. 연결된 도구 목록에서 아래 5개 도구를 확인하세요.

스킬은 `.claude/skills/school-image/SKILL.md`에서 발견되며 `/school-image`로 호출하거나 자연어로 요청할 수 있습니다.

> /school-image 학교 AI로 흰 배경의 파란 크리스탈 아이콘 1장을 생성해서 crystal-blue-v1.png로 저장해 줘. 프로젝트 아트 지침을 반영하고 저장된 이미지를 확인해 줘.

처음에는 `get_remaining_quota`나 `list_models`로 연결을 확인한 뒤 이미지를 생성하세요. **스킬 설치, MCP 승인, Chrome 연결은 각각 별개입니다.** 스킬은 제작 판단을 안내하고 MCP가 실제 요청과 저장을 수행합니다. PNG 저장 이후의 Unity Sprite 설정·임포트는 별도 요청과 프로젝트 작업 지침을 따릅니다.

## 도구

| 도구 | 주요 입력 |
|---|---|
| `generate_image` | `prompt`, `output_path`, 선택: `reference_images`, `conversation_id`, `locale`, `overwrite` |
| `generate_image_with_context` | `art_direction`, `task`, 위와 같은 출력/참조 옵션 |
| `download_attachment` | `file_id`, `output_path`, 선택: `overwrite` |
| `get_remaining_quota` | 없음 |
| `list_models` | 없음 |

```json
{
  "prompt": "Create a blue geometric crystal UI icon on a white background.",
  "output_path": "crystal.png",
  "reference_images": [],
  "overwrite": false
}
```

`output_path`는 출력 루트 기준 상대 경로 또는 그 안의 절대 경로입니다. `..`, 루트 밖 경로, 심볼릭 링크/정션, Windows ADS, 하드 링크 덮어쓰기는 거부합니다. PNG 서명을 검사하며 기존 파일은 `overwrite: true`일 때만 대체합니다. 여러 이미지가 반환되면 첫 번째를 저장하고 나머지 file ID를 반환합니다.

`generate_image_with_context`는 두 텍스트를 제목과 함께 연결할 뿐 아트 디렉션을 재작성하지 않습니다. 요청 모델은 관찰된 `gpt-5.6-sol`이고 서버가 실제 이미지 모델로 라우팅합니다.

**참조 생성의 실제 제한:** 업로드와 completion payload는 실제 Network로 검증했지만 학교 서버가 테스트 편집 요청 2건을 일반 채팅으로 처리하여 새 이미지를 반환하지 않았습니다. 따라서 참조 업로드 구현은 완료됐으나 참조 기반 이미지 생성 성공은 검증되지 않았습니다. 이런 경우 `NO_ATTACHMENT`로 반환하며 자동 재요청하지 않습니다.

## 오류와 세션

`AUTH_EXPIRED`, `CSRF_INVALID`, `QUOTA_EXHAUSTED`, `GENERATION_FAILED`, `NO_ATTACHMENT`, `DOWNLOAD_FAILED`, `UPLOAD_FAILED`, `INVALID_OUTPUT_PATH`, `NETWORK_ERROR`를 구분합니다. 추가로 `BROWSER_OFFLINE`, `BRIDGE_BUSY`, `OUTPUT_EXISTS`, `INVALID_REQUEST`가 있습니다. 403의 세부 원인은 서버 정책 거부일 수도 있으므로 CSRF만 원인이라고 단정하면 안 됩니다.

학교 세션 만료 시 LXP/학교 UI에서 다시 로그인하고 연결 북마크를 실행하세요. 비밀번호 자동 로그인은 하지 않습니다. 관찰된 학교 프론트엔드는 `/auth/refresh`를 사용하지만 이 MCP는 로그인 수명을 자체적으로 연장하지 않습니다.

생성 요청을 자동 재시도하지 않습니다. 중간 SSE에서 대화/메시지 ID를 받은 경우 응답이 불완전하면 대화 조회로 한 번 복구를 시도합니다. 과거 이미지나 여러 후보 중 임의의 결과를 반환하지 않습니다. 요청 전에 네트워크가 끊겨 ID를 받지 못했거나 생성이 계속 진행 중이면 복구가 실패할 수 있습니다. 학교 UI에서 생성 완료 여부를 확인한 후 다시 요청하세요.

## 직접 HTTP 모드

`SCHOOL_AI_TRANSPORT=direct`, `SCHOOL_AI_COOKIE`, `SCHOOL_AI_CSRF_TOKEN`을 프로세스 환경에 제공하면 브라우저 브리지 없이 작동합니다. 실제 값을 명령 기록, 소스, `.mcp.json`, `.env.example`, Git에 넣지 마세요. 이 모드는 코드만 제공되며 실제 로그인 쿠키를 추출하여 테스트하지 않았습니다.

## 검증

```powershell
npm.cmd test
npm.cmd run test:bridge
npm.cmd run smoke
npm.cmd run doctor
npm.cmd run smoke -- --live
# 아래는 실제 할당량을 사용해 이미지 2장을 생성합니다.
npm.cmd run smoke -- --live --generate --reference
```

`.local/connection.json`은 학교 인증정보가 아닌 임시 localhost 클라이언트 키입니다. `.local`, `artifacts`, `.env`, 조사용 다운로드 파일, `node_modules`는 Git에서 제외했습니다. 이 디렉터리를 다른 사용자와 공유하지 마세요.

Chrome 로컬 네트워크 접근 허용과 Claude Code 프로젝트 MCP 승인은 서로 다른 설정입니다. 연결 진단은 브라우저 워커가 브리지에 연결됐는지만 확인하며, Claude Code가 MCP 서버를 승인했는지까지 확인하지는 않습니다.

API 조사와 실제 검증 내역은 `../../docs/school-ai-api-notes.md`에 기록합니다.

## Git으로 공유

저장할 파일은 `src`, `scripts`, `skills`, `test`, `package.json`, `package-lock.json`, README, PowerShell 실행 도우미, 값이 빈 `.env.example`입니다. 이 저장소의 `.gitignore`는 `.local`, `node_modules`, 생성 이미지, 실제 `.env`, 조사 캐시 및 루트의 PC 전용 `.mcp.json`을 제외합니다.

각 PC에서 설치 명령을 실행해 로컬 절대 경로로 `.mcp.json`을 생성하세요. 설치 대상 프로젝트는 별도 저장소일 수 있으므로 그 프로젝트의 ignore 규칙도 확인하세요. 스킬 파일은 공유할 수 있지만 로컬 인증정보와 브리지 키를 공유하면 안 됩니다. 이 저장소는 아직 원격 저장소가 지정되지 않았으며 자동으로 push하지 않습니다.
