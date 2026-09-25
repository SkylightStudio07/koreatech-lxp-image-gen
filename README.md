# KOREATECH School Code

학교 AI를 VS Code 안에서 사용하고, 현재 열어 둔 프로젝트를 학교 에이전트가 승인 기반으로 읽고 수정하도록 연결하는 도구입니다. 학교 로그인은 사용자의 Chrome 탭에서 처리하고, 프로젝트 파일과 명령 실행은 각 사용자의 PC에서 수행합니다.

학교·Microsoft의 공식 확장이 아닙니다. 현재 배포 버전은 **School Code 0.18.2**, **Chrome Connector 0.3.0**입니다.

## 무엇을 배포하는가

소스 저장소 링크만 전달해도 개발자는 직접 빌드할 수 있지만, 구성원 설치에는 GitHub **Releases** 링크를 사용하는 편이 간단합니다.

릴리즈에 다음 세 파일을 첨부합니다.

| 파일 | 용도 |
|---|---|
| `school-code-0.18.2.vsix` | VS Code 확장 설치 |
| `school-code-connector-0.3.0.zip` | Chrome Connector 설치 |
| `SHA256SUMS.txt` | 다운로드 파일 무결성 확인 |

VSIX 안에도 Connector 폴더가 들어 있지만, Chrome에서는 압축을 풀어 폴더를 직접 로드해야 하므로 ZIP을 별도 첨부합니다. Chrome Web Store와 VS Code Marketplace에 등록하지 않은 동안에는 Releases가 공식 배포 지점입니다. 릴리즈 페이지 링크는 저장소의 **Releases → 최신 릴리즈**에서 복사해 구성원에게 전달하세요.

## 구성원 설치: 채팅만 사용

프로젝트 파일을 에이전트에게 맡기지 않고 학교 AI와 대화만 하려면 MCP를 등록할 필요가 없습니다.

1. 최신 릴리즈에서 `school-code-0.18.2.vsix`를 내려받습니다.
2. VS Code의 `Ctrl+Shift+P` → **Extensions: Install from VSIX...**로 VSIX를 설치하고 **Developer: Reload Window**를 실행합니다.
3. 최신 릴리즈의 `school-code-connector-0.3.0.zip`을 압축 해제합니다.
4. Chrome 주소창에서 `chrome://extensions`를 열고 **개발자 모드**를 켠 뒤 **압축해제된 확장 프로그램 로드**로 압축 해제한 폴더를 선택합니다.
5. Chrome에서 학교 AI에 본인 계정으로 로그인한 탭을 열어 둡니다.
6. VS Code에서 School Code 패널을 열고 **브라우저 연결**을 누릅니다.
7. **모델·에이전트 새로고침** 후 대화를 시작합니다.

채팅 입력창에서 `/goal 목표 내용`으로 세션 목표를 지정할 수 있습니다. `/goal status`, `/goal done`, `/goal clear`로 상태를 확인·완료·삭제합니다. 활성 목표는 다음 모델/워크플로우 요청에 함께 전달됩니다.

학교 계정 쿠키와 대화 요청은 로그인 탭에서 처리됩니다. Connector를 설치했다고 학교 계정이 운영자 서버에 전달되는 것은 아닙니다. Chrome의 로컬 네트워크 권한 요청이 나오면 허용해야 합니다.

## 구성원 설치: Workspace·MCP 사용

프로젝트 폴더 검색, 파일 읽기·수정, Unity, Notion, 셸 도구를 사용하려면 위 설치 뒤 다음을 추가합니다.

1. VS Code에서 작업할 프로젝트 폴더를 엽니다.
2. **연결된 프로젝트 → 프로젝트 선택**에서 대상 폴더를 고릅니다.
3. **MCP 카탈로그 → 학교 Workspace → 연결**을 누릅니다.
4. 처음이면 **BCSD 계정으로 브라우저 승인**을 선택합니다. 운영자가 만든 BCSD 릴레이 로그인 화면에서 개인 계정을 가입하거나 로그인한 뒤 **이 기기를 연결**을 누릅니다. 이 계정은 학교 AI 계정과 별개인 릴레이 계정입니다.
5. 패널에 `연결됨`과 `도구별 승인`이 표시되는지 확인합니다.
6. 학교 AI의 **리소스 → MCP → 새로 만들기**에서 운영자 서버를 등록합니다.
   - URL: `https://bcsd-nai.mywire.org:3010/mcp`
   - 전송: **HTTP / Streamable HTTP**
   - 인증: VS Code의 **MCP 인증 JSON 복사** 결과를 그대로 사용
7. 학교 AI에서 등록한 MCP를 사용할 에이전트에 연결합니다.
8. VS Code에서 그 에이전트를 선택하고 새 대화에서 `workspace_info`를 요청합니다.

페어링 모드에서는 사용자·기기·워크스페이스별 `WORKER_TOKEN`과 `MCP_TOKEN`이 자동으로 발급되어 VS Code SecretStorage에 저장됩니다. 토큰을 단체 채팅, 저장소, README, 스크린샷에 올리지 마세요. 채팅만 사용하는 사람은 MCP 등록을 생략하면 됩니다.

## MCP를 추가할 때의 원칙

School Code의 카탈로그는 로컬 연결 정보를 저장하는 화면입니다. 학교 AI가 실제 도구를 호출하려면 해당 서버를 학교 AI **리소스 → MCP**에도 등록하고, 그 MCP가 연결된 **에이전트**를 선택해야 합니다.

- **Notion**: 공개 링크를 등록하거나 각자 만든 Integration Secret을 입력합니다. Secret은 VS Code SecretStorage에만 저장합니다.
- **Unity CLI**: Unity 프로젝트를 연결한 뒤 `Unity.exe` 경로를 설정합니다. EditMode/PlayMode 테스트와 빌드는 프로젝트 내부에서 승인 후 실행됩니다.
- **워크플로우 에이전트**: 워크플로우가 연결된 학교 에이전트를 선택하면 일반 채팅 대신 서버의 단계형 실행 경로를 사용하고, LLM·MCP 단계와 완료 상태를 대화에 표시합니다.
- **폴더 생성**: Workspace MCP의 `create_directory`가 상대 경로의 중첩 폴더 생성을 지원합니다. 프로젝트 밖·숨김/비밀 경로·심볼릭 링크는 차단되고 파일 수정과 같은 승인을 거칩니다.
- **프로젝트 이미지**: `list_visual_assets`로 이미지 목록과 Unity `.meta`를 확인한 뒤 `read_image`로 필요한 PNG/JPEG/GIF/WebP/SVG/ICO 한 장을 MCP 이미지 콘텐츠로 전달합니다. 이미지 한 장은 16 MiB까지 지원하며 생성 폴더와 위험한 SVG는 건너뜁니다.
- **Unity Editor MCP**: **자동 준비**를 누르면 브리지 파일·로컬 토큰·Editor 실행을 준비합니다. Scene/Game 캡처, 모델 미리보기, Play Mode·Console·프로젝트 상태, Prefab·Material·Animator·GameObject 작업을 지원합니다.
- **3D 에셋**: `list_model_assets`와 `read_model_metadata`로 FBX/OBJ/GLB/GLTF의 기본 메타데이터를 확인하고, Unity 임포트 후 `unity_model_preview`로 실제 모습을 전달합니다.
- **Blender/Unreal/기타 HTTPS MCP**: 서버의 HTTPS `/mcp` 주소와 개인 Bearer 토큰을 입력하고, 학교 AI에도 같은 MCP를 등록합니다.
- **Figma MCP**: 공식 원격 주소 `https://mcp.figma.com/mcp`를 사용하고 학교 MCP 등록 화면에서 OAuth로 로그인합니다. 별도 Bearer 서버일 때만 토큰을 입력합니다.

자세한 화면별 절차와 장애 대응은 [forBCSD.md](forBCSD.md), 확장 기능 설명은 [tools/school-code/README.md](tools/school-code/README.md)를 참고하세요.

## 운영자: 릴레이 서버

운영자는 NAS에서 School Code 릴레이를 실행하고 외부 HTTPS 주소를 제공합니다. 역방향 프록시는 `/auth/*`, `/worker/*`, `/mcp`와 `Authorization` 헤더를 그대로 전달해야 합니다. `AUTH_STORE_PATH`는 영속 볼륨에 두고, `auth.json`, `.env`, 토큰, 로그는 GitHub에 올리지 않습니다.

릴레이가 실행 중인지 확인하는 주소는 다음과 같습니다.

```text
https://bcsd-nai.mywire.org:3010/health
```

`true` 또는 `ok: true`는 HTTP 서버가 살아 있다는 뜻입니다. 워커·MCP 인증까지 성공했다는 뜻은 아니므로, 각 구성원은 브라우저 페어링과 `workspace_info`로 별도 확인해야 합니다.

## 운영자: 새 릴리즈 만들기

Windows와 Node.js 22 이상이 있는 개발 PC에서 실행합니다.

```powershell
cd tools/school-code
npm ci
npm test
npm run package:release
```

그러면 `tools/school-code`에 현재 `package.json` 버전의 VSIX, `manifest.json` 버전의 Connector ZIP, `SHA256SUMS.txt`가 생성됩니다. 버전을 올릴 때는 `package.json`과 Chrome `manifest.json`을 함께 수정한 뒤 테스트하고 커밋합니다.

GitHub CLI에 로그인되어 있다면 다음처럼 소스 커밋과 릴리즈를 만들 수 있습니다.

```powershell
git add README.md forBCSD.md tools/school-code
git commit -m "docs: publish School Code 0.18.2 release guide"
git push origin master
gh release create v0.18.2 `
  tools/school-code/school-code-0.18.2.vsix `
  tools/school-code/school-code-connector-0.3.0.zip `
  tools/school-code/SHA256SUMS.txt `
  --title "School Code 0.18.2" `
  --notes-file forBCSD.md
```

`forBCSD.md`에는 토큰을 넣지 않습니다. 릴리즈 노트와 설치 문서에는 서버 주소·절차만 쓰고 개인 인증 값은 각자 페어링으로 발급받게 합니다. 새 릴리즈를 올리면 구성원은 VSIX와 Connector ZIP을 다시 내려받아 설치하고 Chrome 확장에서 **새로고침**하면 됩니다.

## 저장소 구성

- `tools/school-code`: VS Code 확장, Chrome Connector, Workspace 릴레이
- `forBCSD.md`: BCSD 구성원용 설치·MCP·장애 대응 문서
- `tools/school-code/CLUB-SHARING.md`: 짧은 동아리 공유 안내
- `tools/school-image-mcp`: 기존 이미지 생성 MCP와 Skill
- `docs/school-ai-api-notes.md`: 학교 API 조사 기록

기존 이미지 생성 MCP를 계속 사용하는 경우에도 School Code Workspace와는 별도 서비스로 취급합니다. 학교 로그인 세션과 릴레이 토큰을 서로 공유하지 않습니다.

