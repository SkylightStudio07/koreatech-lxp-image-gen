# School Image MCP

KOREATECH 학교 AI의 이미지 생성 기능을 Claude Code에서 호출하는 로컬 MCP 서버와 사용 스킬입니다.

- [설치·Chrome 연결·Claude Code 등록 방법](tools/school-image-mcp/README.md)
- [이미지 제작 스킬](tools/school-image-mcp/skills/school-image/SKILL.md)
- [실제 API 조사 및 검증 기록](docs/school-ai-api-notes.md)

MCP 코드와 스킬은 함께 버전 관리합니다. 인증정보, 로컬 연결 키, 설치 의존성, 생성 이미지는 제외합니다. Git에서 받은 각 PC는 설치 스크립트로 자신의 프로젝트 경로를 등록해야 합니다.

텍스트 기반 이미지 생성과 PNG 다운로드는 실제 검증했습니다. 참조 이미지 업로드는 검증됐지만 참조 편집 생성은 학교 서버의 라우팅 문제로 성공을 확인하지 못했습니다. Chrome의 localhost 연결 허용과 Claude Code의 프로젝트 MCP 승인이 필요합니다.
