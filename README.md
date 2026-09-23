# School Image MCP

KOREATECH 학교 AI의 이미지 생성 기능을 Claude Code에서 호출하는 로컬 MCP 서버와 사용 스킬입니다.

- [처음 설치부터 이미지 생성까지 따라 하는 사용 설명서](tools/school-image-mcp/README.md)
- [이미지 제작 스킬](tools/school-image-mcp/skills/school-image/SKILL.md)
- [실제 API 조사 및 검증 기록](docs/school-ai-api-notes.md)

## 빠른 시작

1. Node.js 22 이상과 Claude Code를 설치하고, Chrome에서 KOREATECH 학교 AI에 로그인합니다.
2. 저장소의 `tools\school-image-mcp\connect-school-image.bat`을 실행합니다. 브리지가 켜지고 학교 채팅 페이지가 열립니다.
3. 처음 한 번은 클립보드의 연결 코드를 Chrome 북마크 URL에 저장합니다. 학교 채팅 탭에서 그 북마크를 눌러 워커를 연결합니다.
4. 사용 프로젝트에 `school-image` MCP를 등록하고 Claude Code에서 승인합니다. 등록과 화면별 절차는 [사용 설명서](tools/school-image-mcp/README.md)를 따르세요.
5. Claude Code에서 `/school-image`를 입력하고 이미지 설명과 파일명을 요청합니다.

로그인, Chrome 워커 연결, Claude Code MCP 승인은 각각 별도 단계입니다. 브라우저 탭 안에서 워커를 시작하려면 북마크를 직접 눌러야 합니다. 텍스트 기반 이미지 생성과 PNG 저장은 검증했으며, 참조 이미지 편집 생성은 학교 서버에서 아직 성공을 확인하지 못했습니다.
