# School Code 동아리 공유 안내

아래 내용을 동아리 채팅에 복사해서 보내면 됩니다.

```text
[KOREATECH School Code 안내]

VS Code에서 학교 AI Astra/Fable과 대화할 수 있는 확장입니다.

1. VS Code에서 제공받은 school-code-0.6.0.vsix를 설치합니다.
2. School Code 패널을 열고 브라우저 연결을 누릅니다.
3. 로그인된 학교 AI 탭을 Chrome에서 열어 둡니다.
4. 모델·에이전트 새로고침 후 대화합니다.

프로젝트 파일을 학교 에이전트가 읽거나 수정하게 하려면 운영자가 별도로 안내한 MCP 연결이 필요합니다. 파일 읽기·검색·수정은 VS Code에서 승인할 수 있습니다.

주의:
- MCP URL과 MCP 토큰은 공개 채팅이나 GitHub에 올리지 않습니다.
- WORKER_TOKEN, Notion 토큰, Unity Editor 토큰은 각자 PC의 SecretStorage에만 입력합니다.
- 현재 공유 릴레이는 한 번에 한 VS Code 워커만 연결할 수 있어 여러 명이 동시에 사용할 수 없습니다.
- 다른 사람의 프로젝트를 연결하거나 `모두 자동 승인`을 켜지 않습니다.
- 학교 AI로 전송해도 되는 프로젝트와 문서만 사용합니다.

일반 학교 AI 채팅만 사용할 때는 MCP 토큰이 필요하지 않습니다. 문제가 생기면 확장의 School Code 출력 패널과 연결된 프로젝트 경로를 운영자에게 알려 주세요. 토큰 값 자체는 보내지 않습니다.
```

## 운영자 메모

현재 `school-code` 릴레이는 하나의 `X-Worker-Id`만 활성화합니다. 한 명이 연결된 동안 다른 사용자는 `409 Another VS Code window is connected`를 받습니다. 동아리 여러 명이 각자 프로젝트를 동시에 연결하려면 구성원별 릴레이 인스턴스·도메인·`MCP_TOKEN`을 만들거나, 사용자별 세션과 권한을 지원하는 멀티테넌트 릴레이를 별도로 구현해야 합니다.

`MCP_TOKEN`은 학교 리소스의 MCP 등록용이고 `WORKER_TOKEN`은 VS Code 워커가 릴레이에 접속할 때 쓰는 값입니다. 어느 쪽도 저장소·README·단체 채팅에 기록하지 않습니다. 한 값이 노출되었다면 새 값을 생성하고 학교 MCP 등록 인증 JSON을 교체합니다.
