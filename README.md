# School Image MCP

KOREATECH 학교 AI의 이미지 생성 기능을 Claude Code에서 호출하는 로컬 MCP 서버와 사용 스킬입니다.

- [처음 설치부터 이미지 생성까지 따라 하는 사용 설명서](tools/school-image-mcp/README.md)
- [이미지 제작 스킬](tools/school-image-mcp/skills/school-image/SKILL.md)
- [실제 API 조사 및 검증 기록](docs/school-ai-api-notes.md)

## 빠른 시작

1. `tools\school-image-mcp`에서 `npm.cmd ci`를 실행합니다.
2. `install-chrome-extension.bat`을 실행하고 Chrome에서 열린 확장 폴더를 한 번 로드합니다.
3. `node scripts/install-project.js "프로젝트 경로"`로 Claude Code 프로젝트를 등록합니다.
4. 이후에는 `start-school-image.bat`만 실행하면 브리지와 학교 채팅이 열리고 확장이 자동 연결합니다.
5. Claude Code에서 `/school-image` 또는 자연어로 이미지 생성을 요청합니다.

학교 탭을 F5로 새로고침해도 확장이 워커를 자동으로 다시 연결합니다. 설치, 상태 표시, 문제 해결 절차는 [사용 설명서](tools/school-image-mcp/README.md)에 정리했습니다. 텍스트 기반 이미지 생성과 PNG 저장은 검증했으며, 참조 이미지 편집 생성은 학교 서버에서 아직 성공을 확인하지 못했습니다.
