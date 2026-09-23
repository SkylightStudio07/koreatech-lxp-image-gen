# KOREATECH 이미지 API 조사

조사일: 2026-09-23. 로그인된 본인 Chrome 탭, 실제 Network 이벤트, 서비스가 배포한 공개 JavaScript를 확인했습니다. 첨부된 작업 문서의 예시는 출발점으로만 사용했습니다.

## 확인된 명세

실제 기본 경로: `https://ai.koreatech.ac.kr/api/AiCA/api/v1`. 작업 문서의 `/api/AiCApi/v1`과 다릅니다.

| Method | 경로 | 역할 |
|---|---|---|
| POST | `/chat/completions` | 채팅/이미지 생성 SSE |
| POST | `/chat/upload` | `multipart/form-data`의 단수 `file` 필드 업로드 |
| GET | `/chat/uploads/{file_id}` | 이미지 바이너리 다운로드 |
| GET | `/conversations/{id}` | 대화 메타데이터 |
| GET | `/conversations/{id}/messages` | 별도의 메시지 목록; 복구에 사용 |
| GET | `/usage/remaining` | 실제 할당량 경로 |
| GET | `/models` | `{items, grouped, total, warning, default_selection}` |
| POST | `/auth/refresh` | 사이트 UI의 세션 갱신; MCP에서는 호출하지 않음 |

새 대화 첫 요청에는 `conversation_id`를 **생략**합니다. 프론트엔드의 `temp-conv-*`는 UI 임시 ID이고 서버에 전달하지 않습니다. 서버가 SSE `start`에서 대화 UUID를 반환합니다. 별도 대화 생성 POST는 사용하지 않습니다. UI는 임시 제목으로 프롬프트 앞 50자를 표시한 뒤 목록을 다시 읽습니다. 서버 제목 알고리즘 자체는 확인하지 않았습니다.

```json
{"message":"Create an image...","model_id":"gpt-5.6-sol","locale":"ko"}
```

참조 업로드 결과에서 `file_id`, `filename`, `file_type`, `file_size`를 취해 completion에 다음과 같이 추가합니다. 첨부 시점에 곧바로 업로드한다고 가정하면 안 됩니다. 조사한 UI 코드는 전송 동작 중 업로드한 뒤 completion을 호출합니다.

```json
{
  "file_ids": ["<returned-file-id>"],
  "file_attachments": [{"file_id":"<returned-file-id>","filename":"reference.png","file_type":"image","file_size":1234}]
}
```

SSE 실제 순서: `start → image_generating → delta → done`. `data:`의 JSON `type`으로 구분합니다. 프론트엔드에는 named SSE event 처리도 있어 파서에서 함께 지원합니다. 실제 `model_id`는 `gpt-image-2`였습니다. `done.attachments`에 이미지 file ID가 들어옵니다.

## 인증

```text
Cookie: [REDACTED]
X-CSRF-Token: [REDACTED]
X-Client-Env: production
```

로그인 세션은 `access_token`, `refresh_token`, `session_exp` HttpOnly/Secure/SameSite=Lax 쿠키를 사용합니다. `csrf_token`은 Secure/SameSite=Lax이며 JS에서 읽을 수 있고, 프론트엔드가 이 쿠키 값을 `X-CSRF-Token`에 그대로 넣습니다. 메타 태그나 localStorage의 토큰을 사용하는 구조가 아닙니다. localStorage에는 로그인 여부와 refresh 동기화용 잠금 표시가 있습니다.

관찰한 인증 쿠키들은 명시적 만료 시각을 가지고 있었습니다. 발급 시각을 알 수 없어 고정 TTL을 단정하지 않습니다. 기존 세션을 일부러 만료시키지는 않았습니다. 프론트엔드는 401 시 refresh를 한 번 시도하고, 실패하면 재로그인을 안내합니다. 비밀번호를 읽거나 저장하지 않았습니다. 실제 쿠키/CSRF 값은 출력/저장하지 않았습니다.

## 할당량

`daily_limit`, `monthly_limit`, `daily_used`, `monthly_used`, `daily_remaining`, `monthly_remaining`, `is_daily_exceeded`, `is_monthly_exceeded`, `course_pool_*` 등을 반환합니다. daily limit와 remaining이 0이어도 exceeded=false인 응답이 실제 관찰됐으므로 0만으로 소진을 판단하면 안 됩니다. MCP는 식별정보/역할/과정 세부정보 없이 수치와 초과 여부만 반환합니다.

## 검증 기록

- `/models`, `/usage/remaining`: 로그인 세션으로 HTTP 200.
- 새 대화/이미지 생성: Network에서 conversation ID 없는 POST와 HTTP 200 확인. `gpt-image-2`로 라우팅, PNG 1장 생성.
- 생성 결과: `artifacts/blue-crystal.png`, 1024×1024, 861801 bytes. 이미지 외관 확인.
- 다운로드: 실제 `/chat/uploads/{file_id}`에서 image/png 응답을 브라우저 자산 도구로 저장.
- 공식 MCP SDK: initialize 및 tools/list 성공, 요구 도구 5개 노출.
- 자동 테스트: SSE 변형, 경로/정션/덮어쓰기, 참조 payload, 불완전 SSE 복구/과거 이미지 거부, 오류 비밀값 비노출 통과.
- 참조 이미지 실제 업로드: `/chat/upload` HTTP 200, 861801 bytes, `file_id/filename/file_type/file_size` 반환. multipart와 completion의 `file_ids/file_attachments`를 실제 Network에서 확인.
- 참조 생성: 영어 요청과 명확한 한국어 요청을 각각 실행했으나 둘 다 서버가 일반 채팅(`gpt-5.6-sol`)으로 처리하여 `attachments:null` 반환. 서버 응답은 이미지 작업으로 인식하지 못했다는 내용. 참조 기반 이미지 생성 성공은 미검증이며 추가 호출을 중단함.
- 라이브 대화 복구: `/conversations/{id}`와 `/conversations/{id}/messages` 모두 HTTP 200. 실제 생성된 동일한 assistant message ID 및 image file ID가 조회됨. 현재 메타데이터 endpoint에도 messages가 포함됐고 별도 messages endpoint는 배열을 반환함.
- localhost 브라우저 브리지: Chrome `navigator.permissions`의 `local-network-access`가 **prompt**. 허용 전 연결 요청이 대기 중이며 MCP를 통한 라이브 생성 성공이라고 주장하지 않음.
- 독립 localhost 통합 테스트: RPC 요청/응답, 클라이언트·작업자 키 분리, 외부 origin 차단, 무인증 거부, endpoint 허용 목록 통과. 실제 학교 호출 없이 검증.
- VS Code 확장의 Claude Code 2.1.278 실행 파일 발견. 사용자 지정 `Project-Vertex/.mcp.json`에 등록하고 `claude mcp get school-image`에서 **Pending approval** 확인. Claude 자체의 프로젝트 MCP 승인 및 전체 라이브 경로 확인은 남아 있음.
- 결과 PNG를 `Project-Vertex/GeneratedAssets/SchoolAI/blue-crystal-test.png`에도 저장. 출력 루트를 해당 폴더로 설정함.

## 정책/제한

확인한 채팅 UI에는 일반적인 AI 오류 가능성 안내가 있었고 자동화 금지 안내는 보이지 않았습니다. 별도의 학교 이용약관 전체를 검증한 것은 아니므로 API 사용 허용을 보장하지 않습니다. 명확한 제한을 회피하는 기능은 구현하지 않았습니다.

생성은 자동 재시도하지 않으며 복구 조회도 한 번만 수행합니다. 브라우저 브리지의 긴 폴링은 localhost만 대상으로 하며 학교 API를 반복 조회하지 않습니다. 브라우저 탭을 닫거나 새로고침하면 다시 연결해야 합니다. 서버는 스트림을 수신해 내용을 누적한 뒤 처리하므로 MCP 진행률 이벤트는 아직 제공하지 않습니다.
