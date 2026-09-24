# 학교 AI MCP 서버 동아리 공유 안내

아래 내용을 동아리 채팅에 복사해서 보내면 됩니다.

```text
[KOREATECH 학교 AI MCP 등록 안내]

이 안내는 학교 AI에서 외부 MCP 서버를 등록하는 방법입니다. 서버 URL과 인증 JSON은 운영자가 개인적으로 전달합니다.

1. 학교 AI에서 리소스 → MCP → 새로 만들기를 엽니다.
2. 전송 방식은 운영자가 안내한 방식(HTTP/Streamable HTTP)을 선택합니다.
3. 서버 URL과 이름을 입력합니다.
4. Bearer 인증을 선택하고 운영자가 전달한 인증 JSON을 입력합니다.
5. 저장한 MCP를 사용할 에이전트에 연결하고 도구 목록을 새로고침합니다.

주의:
- URL과 인증 JSON은 GitHub나 공개 채팅에 올리지 않습니다.
- 이 서버의 도구가 학교 계정 할당량이나 이미지 생성 기능을 사용하면 사용량이 운영자 계정에 귀속될 수 있습니다.
- 파일·Unity 프로젝트를 다루는 School Code Workspace MCP는 별도 서버입니다. 현재 한 번에 한 VS Code 워커만 지원하므로 이 공유 MCP와 합쳐 여러 명에게 배포하지 않습니다.
- 0.7.0부터 Workspace MCP에는 승인 기반 `run_shell`과 백그라운드 셸 작업이 포함됩니다. 연결된 PC의 Windows 사용자 권한으로 명령이 실행될 수 있으므로 WORKER_TOKEN/MCP_TOKEN을 동아리 전체에 공유하지 말고, 신뢰하는 개인별 릴레이와 `매번 확인` 승인 모드를 사용합니다.
- Notion 토큰, WORKER_TOKEN, Unity Editor 토큰은 각자의 PC에만 저장합니다.
```

## 운영자 메모

기존 학교 AI MCP 서버는 여러 사람이 등록해서 쓰는 공유 서비스로 운영할 수 있습니다. 다만 `school-code` Workspace 릴레이는 하나의 `X-Worker-Id`만 활성화합니다. 한 명이 연결된 동안 다른 사용자는 `409 Another VS Code window is connected`를 받습니다. 동아리 여러 명이 각자 프로젝트를 동시에 연결하려면 구성원별 릴레이 인스턴스·도메인·`MCP_TOKEN`을 만들거나, 사용자별 세션과 권한을 지원하는 멀티테넌트 릴레이를 별도로 구현해야 합니다.

`MCP_TOKEN`은 학교 리소스의 MCP 등록용이고 `WORKER_TOKEN`은 VS Code 워커가 릴레이에 접속할 때 쓰는 값입니다. 어느 쪽도 저장소·README·단체 채팅에 기록하지 않습니다. 한 값이 노출되었다면 새 값을 생성하고 학교 MCP 등록 인증 JSON을 교체합니다.
