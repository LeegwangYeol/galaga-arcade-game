# Claude & Antigravity Collaboration Guide

## 1. 프로젝트 개요 (Project Overview)
- **프로젝트명**: Galaga Arcade Web Game (갤로그 스타일 웹 아케이드 슈팅 게임)
- **목표**:
  1. 웹 브라우저에서 60fps로 매끄럽게 구동되는 갤로그(Galaga) 스타일의 레트로 아케이드 슈팅 게임 개발.
  2. Vercel 배포에 완벽 호환되는 빌드 및 패키징 설정 (`npm run build` -> `dist`).
  3. 로컬 Git 저장소 초기화, 체계적인 기능별 커밋 및 GitHub 연동.
  4. 브라우저 기반 자동화 테스트(런타임 에러 0건 검증, 게임 루프 및 렌더링 검증) 및 유닛 테스트 구축.
  5. 30+ 에이전트 대규모 협업 및 독립 Victory Audit을 통한 완벽한 품질 검증.

---

## 2. 제안 기술 스택 및 아키텍처 (Proposed Tech Stack & Architecture)
- **빌드 도구 및 프레임워크**: Vite + TypeScript + HTML5 Canvas 2D
  - *선정 이유*: 외부 종속성 최소화로 60fps 보장, 초고속 번들링, Vercel 최적화, 픽셀 아트 레트로 렌더링 완벽 제어.
- **사운드 시스템**: Web Audio API 기반 순수 프로그래밍 신디사이저 (레트로 발사음, 폭발음, 비행음, BGM - 외부 오디오 파일 누락 리스크 0%).
- **게임 엔진 코어 구조**:
  - `Starfield`: 패럴랙스 우주 배경 별빛 애니메이션
  - `PlayerShip`: 좌우 이동, 이중 미사일 발사, 듀얼 파이터 도킹 시스템
  - `Enemies`: Zako(자코), Goei(고에이), Boss Galaga(보스 갤라가 - 트랙터 빔 포획 기능)
  - `FlightPath`: 베지에 곡선(Bézier Curve) 기반 적 편대 진입 및 다이브 폭격 궤적
  - `CollisionSystem`: 충돌 판정 및 파티클 폭발 이펙트
  - `ScoreManager`: 점수, 최고 점수(LocalStorage 연동), 잔여기체, 스테이지 진행도
  - `InputHandler`: 키보드(방향키, WASD, Space), 마우스, 모바일 터치 가상 패드 지원
- **테스트 및 검증 스택**:
  - `Vitest`: 충돌 판정, 점수 로직, 상태 머신 유닛 테스트
  - `Playwright / Browser Runner`: 브라우저 로드 시 JS 런타임/콘솔 에러 검증 및 게임 루프 실행 확인

---

## 3. 계획된 에이전트 작업 파이프라인 (Execution Plan)
1. **Phase 1: 프로젝트 기반 구축 & Vercel 설정** (Vite + TS + Canvas 보일러플레이트, ESLint, Vercel config)
2. **Phase 2: 코어 게임 엔진 및 엔티티 구현** (게임 루프, 스타필드, 플레이어 기체, 총알 시스템)
3. **Phase 3: 적군 AI & 비행 경로 시스템** (편대 진입 곡선, 다이브 폭격, 트랙터 빔 포획)
4. **Phase 4: 사운드 & 비주얼 이펙트** (Web Audio API 칩튠 SFX, 폭발 파티클, 픽셀 스프라이트)
5. **Phase 5: UI/UX, 반응형 & 터치 컨트롤** (시작/일시정지/게임오버 화면, 터치 컨트롤)
6. **Phase 6: 테스트 & 검증** (Vitest 단위 테스트, Playwright 브라우저 런타임 에러 0건 자동화 검증)
7. **Phase 7: Git 커밋 & GitHub 연동 & 최종 빌드 검증**
8. **Phase 8: 독립 Victory Audit**

---

## 4. Claude 및 사용자 확인 요청 사항 (Feedback & Approval Request)
1. 제안된 **Vite + TypeScript + HTML5 Canvas + Web Audio API** 기술 스택 및 아키텍처에 동의하시는지 확인 부탁드립니다.
2. 추가로 요구되는 특정 갤로그 기능(예: 보너스 챌린징 스테이지, 듀얼 파이터 합체)이 있으신지 확인 부탁드립니다.
3. 승인 시 사용자가 `"proceed"`, `"승인"`, 또는 `"내용확인"`을 입력하면 즉시 프로젝트 오케스트레이터 및 하위 에이전트 스웜을 디스패치하여 구현을 시작하겠습니다.
