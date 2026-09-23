# School Image MCP

KOREATECH 학교 AI의 로그인 세션으로 이미지를 생성하고 Claude Code 프로젝트에 PNG로 저장하는 로컬 MCP입니다. Chrome 확장 프로그램이 학교 채팅 탭에 워커를 자동 연결하므로 북마크를 누를 필요가 없습니다.

## 사용 흐름

```text
Claude Code → 로컬 MCP → 127.0.0.1 브리지 → Chrome 확장 → 로그인된 학교 AI 탭
```

학교 쿠키와 CSRF 값은 Chrome 밖으로 복사하거나 디스크에 저장하지 않습니다. 브리지는 `127.0.0.1`에만 열리고, 학교 API 요청은 로그인된 탭에서 실행됩니다.

## 준비물

- Windows 10/11
- Node.js 22 이상
- Google Chrome
- KOREATECH 학교 AI 계정
- Claude Code CLI 또는 VS Code 확장

## 최초 설정

### 1. 저장소 설치

PowerShell에서 저장소를 내려받고 의존성을 설치합니다.

```powershell
git clone https://github.com/SkylightStudio07/koreatech-lxp-image-gen.git
Set-Location .\koreatech-lxp-image-gen\tools\school-image-mcp
npm.cmd ci
```

### 2. Chrome 확장 프로그램 설치

`install-chrome-extension.bat`을 더블클릭합니다. 스크립트가 확장 파일을 만들고, 확장 폴더와 `chrome://extensions`를 엽니다.

Chrome에서 한 번만 다음 작업을 합니다.

1. 오른쪽 위 **개발자 모드**를 켭니다.
2. **압축해제된 확장 프로그램을 로드합니다**를 누릅니다.
3. 탐색기에 열린 `tools\school-image-mcp\extension` 폴더를 선택합니다.
4. `KOREATECH School Image MCP Connector`가 켜져 있는지 확인합니다.
5. 자주 상태를 확인하려면 Chrome 확장 메뉴에서 고정합니다.

개발자 모드 확장 설치는 Chrome 보안 정책상 스크립트가 대신 승인할 수 없습니다. 이 선택만 한 번 직접 하면 이후에는 탭을 열거나 F5로 새로고침해도 자동으로 연결됩니다.

확장 프로그램이 요구하는 접근 범위는 다음 두 곳뿐입니다.

- `https://ai.koreatech.ac.kr/*`: 로그인된 학교 탭에 워커 실행
- `http://127.0.0.1/*`: 이 PC의 로컬 브리지 상태 확인

### 3. Claude Code 프로젝트 등록

MCP를 사용할 프로젝트 경로를 넣어 설치 스크립트를 실행합니다.

```powershell
$projectDir = 'C:\Users\YOUR_NAME\Documents\Project-Vertex'
node scripts/install-project.js "$projectDir"
```

설치 결과:

- `$projectDir\.mcp.json`: `school-image` MCP 서버 등록
- `$projectDir\.claude\skills\school-image\SKILL.md`: 이미지 제작 스킬
- `$projectDir\GeneratedAssets\SchoolAI`: 기본 PNG 출력 폴더

기존의 다른 MCP 설정은 보존합니다. 같은 이름의 서버나 내용이 다른 스킬이 이미 있으면 덮어쓰지 않고 중단합니다. 이 저장소를 다른 폴더로 옮겼다면 절대 경로가 바뀌므로 설치 명령을 새 위치에서 다시 실행합니다.

### 4. Claude Code 승인

설치한 프로젝트 루트를 Claude Code에서 엽니다. `.mcp.json`의 `school-image` 서버를 허용하라는 안내가 나오면 승인하고 새 세션을 시작합니다.

CLI를 사용하는 경우:

```powershell
Set-Location -LiteralPath $projectDir
claude mcp get school-image
claude
```

Chrome 확장의 권한 승인과 Claude Code의 MCP 승인은 서로 다른 설정입니다.

## 매일 사용할 때

1. `start-school-image.bat`을 더블클릭합니다.
2. 로컬 브리지가 백그라운드에서 시작되고 Chrome 학교 채팅이 열립니다.
3. 로그인이 풀렸다면 학교 계정으로 로그인합니다.
4. Chrome 확장 아이콘에 녹색 `ON`이 표시되면 Claude Code에서 이미지를 요청합니다.

브리지가 이미 실행 중이면 중복으로 실행하지 않습니다. 학교 탭을 열거나 F5로 새로고침하면 확장이 워커를 다시 넣습니다. 잠깐 통신이 끊겨도 워커가 자동 재연결을 시도합니다.

작업이 끝난 뒤 브리지를 끄려면 `stop-school-image.bat`을 실행합니다. 켜 둬도 외부 네트워크에 포트를 열지 않으며, 다음 실행에서는 기존 브리지를 재사용합니다.

기존 `connect-school-image.bat`도 호환을 위해 남아 있으며 `start-school-image.bat`과 같은 동작을 합니다.

## 확장 아이콘 상태

| 표시 | 의미 | 할 일 |
|---|---|---|
| `ON` | 브리지·학교 탭·워커 연결 완료 | Claude Code에서 바로 사용 |
| `…` | 학교 탭을 찾았고 연결 중 | 잠시 기다리거나 팝업의 **지금 다시 연결** 클릭 |
| `!` | 로컬 브리지가 꺼짐 | `start-school-image.bat` 실행 |
| `—` | 학교 채팅 탭이 없음 | 팝업의 **학교 채팅 열기** 클릭 |

확장 팝업은 브리지, 학교 채팅 탭, 자동 워커 상태를 각각 보여줍니다. 기본 포트는 `18765`이며, 브리지 포트를 직접 바꾼 경우에만 고급 설정의 포트도 같은 값으로 바꿉니다.

터미널에서 확인하려면 MCP 폴더에서 실행합니다.

```powershell
npm.cmd run doctor
```

정상 예시:

```json
{"broker":true,"connected":true,"pending":0}
```

## Claude Code 요청 예시

스킬을 직접 호출하거나 자연어로 요청할 수 있습니다.

```text
/school-image 학교 AI로 흰 배경의 파란 크리스탈 아이콘 1장을 생성해 줘.
중앙에 단독 배치하고 글자는 넣지 마. crystal-blue-v1.png로 저장한 뒤 결과를 확인해 줘.
```

먼저 연결만 확인하려면 다음처럼 요청합니다.

```text
학교 이미지 MCP의 남은 할당량을 확인해 줘.
```

상대 `output_path`는 프로젝트 등록 시 설정된 `GeneratedAssets\SchoolAI` 아래로 해석됩니다. 이미지 생성은 학교 계정 할당량을 사용합니다. PNG 저장은 Unity Sprite 임포트나 장면 연결까지 자동으로 수행하지 않습니다.

## 문제 해결

### 확장 아이콘이 `!`로 표시됨

`start-school-image.bat`을 실행합니다. 계속 꺼짐으로 보이면 `.local\broker.log`를 확인하고 Node.js 22 이상이 설치됐는지 확인합니다.

### 학교 탭이 열렸는데 `…`에서 멈춤

1. 주소가 `https://ai.koreatech.ac.kr/AiCA/chat` 아래인지 확인합니다.
2. 학교 사이트의 Chrome 권한에서 로컬 네트워크 접근을 허용합니다.
3. 확장 팝업에서 **지금 다시 연결**을 누릅니다.
4. `chrome://extensions`에서 확장이 켜져 있는지 확인합니다.

### 로그인 후에도 연결되지 않음

로그인 여부와 워커 연결은 별개입니다. 확장이 켜져 있다면 로그인 완료 후 자동으로 워커를 넣습니다. 팝업에서 세 항목 중 어떤 항목이 꺼졌는지 확인하면 원인을 구분할 수 있습니다.

### 저장소 업데이트 후 확장 변경이 적용되지 않음

`install-chrome-extension.bat`을 다시 실행해 `worker-main.js`를 빌드하고, `chrome://extensions`의 해당 확장에서 새로고침 아이콘을 한 번 누릅니다. 브리지 코드도 바뀌었다면 `stop-school-image.bat` 후 `start-school-image.bat`을 실행합니다.

북마크 방식 버전에서 처음 업그레이드하며 `An older bridge is still running`이 나오면 예전 브리지 터미널에서 `Ctrl+C`를 누르거나 그 창을 닫은 뒤 `start-school-image.bat`을 다시 실행합니다.

### Claude Code에 도구가 나타나지 않음

프로젝트 루트의 `.mcp.json`을 확인하고 Claude Code에서 프로젝트 MCP를 승인합니다. 승인 후 새 세션을 시작합니다. Chrome 연결이 정상이어도 MCP 승인이 없으면 도구는 표시되지 않습니다.

## 제공 도구

| 도구 | 주요 입력 |
|---|---|
| `generate_image` | `prompt`, `output_path`, 선택: `reference_images`, `conversation_id`, `locale`, `overwrite` |
| `generate_image_with_context` | `art_direction`, `task`, 위와 같은 출력·참조 옵션 |
| `download_attachment` | `file_id`, `output_path`, 선택: `overwrite` |
| `get_remaining_quota` | 없음 |
| `list_models` | 없음 |

출력 경로는 등록된 출력 루트 안으로 제한됩니다. `..`, 루트 밖 경로, 심볼릭 링크·정션, Windows ADS, 하드 링크 덮어쓰기를 거부합니다. 기존 파일은 `overwrite: true`일 때만 바꿉니다.

참조 이미지는 PNG, JPEG, WebP 형식으로 최대 4개, 파일당 20 MiB까지 프로젝트 참조 루트 안에서 지정할 수 있습니다. 파일은 학교 서버에 업로드됩니다. 업로드와 요청 전달은 검증했지만 학교 서버가 테스트 편집 요청을 일반 채팅으로 처리해 참조 기반 이미지 생성 성공은 아직 확인하지 못했습니다.

## 오류와 재시도

`AUTH_EXPIRED`, `CSRF_INVALID`, `QUOTA_EXHAUSTED`, `GENERATION_FAILED`, `NO_ATTACHMENT`, `DOWNLOAD_FAILED`, `UPLOAD_FAILED`, `INVALID_OUTPUT_PATH`, `NETWORK_ERROR`, `BROWSER_OFFLINE`, `BRIDGE_BUSY`, `OUTPUT_EXISTS`, `INVALID_REQUEST`를 구분합니다.

생성 요청은 자동으로 다시 보내지 않습니다. 네트워크 오류가 발생해도 학교 서버에서 생성이 진행됐을 수 있기 때문입니다. 학교 UI에서 완료 여부를 확인한 뒤 다시 요청합니다. 중간 응답에서 대화와 메시지 ID를 확보했다면 MCP가 해당 대화를 한 번 조회해 결과 복구를 시도합니다.

## 개발과 검증

확장 워커는 `src/browser-worker.js`에서 생성됩니다. 이 파일을 바꾼 뒤 확장 산출물을 다시 만듭니다.

```powershell
npm.cmd run build:extension
npm.cmd test
npm.cmd run test:bridge
npm.cmd run test:launcher
npm.cmd run smoke
```

실제 학교 세션까지 확인:

```powershell
npm.cmd run doctor
npm.cmd run smoke -- --live
```

아래 명령은 실제 할당량을 사용합니다.

```powershell
npm.cmd run smoke -- --live --generate --reference
```

확장 구조는 `background.js`가 탭 수명주기와 상태를 담당하고, 생성된 `worker-main.js`가 학교 페이지의 메인 실행 환경에서 API 요청을 담당하도록 나뉩니다. 팝업과 포트 설정은 워커와 분리되어 있어 이후 여러 학교 서비스, 다른 브리지 프로필, 자동 업데이트 배포를 추가하기 쉽습니다.

## 직접 HTTP 모드와 레거시 북마크

브라우저 확장을 사용할 수 없는 환경을 위해 기존 방식도 남겨 둡니다.

- `copy-connect.ps1`: 레거시 북마클릿 복사
- `start-bridge.ps1`: 콘솔에서 브리지 직접 실행
- `SCHOOL_AI_TRANSPORT=direct`: 쿠키와 CSRF를 환경변수로 직접 제공하는 고급 모드

직접 모드는 `SCHOOL_AI_COOKIE`, `SCHOOL_AI_CSRF_TOKEN`이 필요합니다. 실제 값을 소스, `.mcp.json`, `.env`, 명령 기록, Git에 넣지 마세요.

`.local`, 실제 `.env`, `node_modules`, 생성 이미지와 로컬 인증 상태는 Git에서 제외됩니다. `.local\connection.json`은 학교 인증정보가 아니라 임시 localhost 클라이언트 키이지만 공유하지 마세요.
