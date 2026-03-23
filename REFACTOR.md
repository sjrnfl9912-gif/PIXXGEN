# PIXXGEN - 출하 관리 시스템 (모듈화된 구조)

## 📁 프로젝트 구조

```
PIXXGEN/
├── index-new.html          # 메인 진입점 (간소화됨)
├── css/
│   ├── variables.css       # 색상/폰트 변수
│   ├── layout.css          # 레이아웃 (탑바, 탭, 툴바)
│   ├── buttons.css         # 버튼 & 칩 스타일
│   ├── table.css           # 테이블 & 셀 스타일
│   ├── modals.css          # 모달 & 컨텍스트 메뉴
│   ├── kpi.css             # KPI 통계 스타일
│   └── responsive.css      # 반응형 스타일
├── js/
│   ├── main.js             # 진입점 & 초기화
│   ├── config.js           # Supabase 설정 & 테이블 스키마
│   ├── db.js               # DB CRUD 함수
│   ├── utils.js            # 유틸리티 함수
│   ├── modules/
│   │   ├── data.js         # 데이터 로드/생성
│   │   ├── table.js        # 테이블 렌더링
│   │   └── export.js       # 백업/엑셀 내보내기
│   └── services/
│       ├── ui.js           # UI 헬퍼 (토스트, 모달)
│       └── storage.js      # 로컬스토리지 캐싱
└── .vscode/
    └── settings.json       # VSCode 설정
```

## 🚀 사용 방법

### 1. 기본 파일 이름 변경
```bash
# 이전 파일을 백업하고 새 파일을 사용하세요
mv index.html index.old.html
mv index-new.html index.html
```

### 2. 브라우저에서 열기
```bash
# 로컬 서버 실행 (권장)
python -m http.server 8000
# 또는
npx http-server
```

그 다음 `http://localhost:8000` 접속

## 📦 파일별 역할

### CSS 파일
- **variables.css**: 전역 색상, 폰트 변수 정의
- **layout.css**: 상단바, 탭, 툴바, 검색 박스 레이아웃
- **buttons.css**: 버튼, 칩, 추가 행 버튼 스타일
- **table.css**: 테이블 헤더, 셀, 선택, 리사이징
- **modals.css**: 모달, 컨텍스트 메뉴, 토스트, 로딩 오버레이
- **kpi.css**: KPI 카드, 통계 테이블
- **responsive.css**: 640px 이하 모바일 반응형

### JavaScript 파일

#### 설정 & DB
- **config.js**: Supabase 클라이언트, 테이블 필드/헤더 정의
- **db.js**: INSERT, UPDATE, DELETE, FETCH 함수

#### 모듈
- **modules/data.js**: 데이터 로드, 행 생성
- **modules/table.js**: 테이블 HTML 렌더링
- **modules/export.js**: JSON 백업, 엑셀 내보내기

#### 서비스
- **services/ui.js**: 토스트, 모달, 로딩 표시
- **services/storage.js**: 로컬스토리지 캐싱

#### 유틸리티
- **utils.js**: 검색, 필터링, 중복 감지, 디바운싱
- **main.js**: 초기화, 이벤트 핸들러, 상태 관리

## ✨ 기능

### 현재 구현됨
- ✅ 데이터 테이블 렌더링
- ✅ 탭 네비게이션 (출하/생산/통합/KPI)
- ✅ 검색 기능
- ✅ 필터링 (회사/담당자)
- ✅ 로컬 캐싱
- ✅ Supabase 연동 (읽기)
- ✅ 반응형 디자인

### 추후 구현 필요
- ⏳ 셀 편집 & 저장
- ⏳ 중복 감지
- ⏳ 붙여넣기 기능
- ⏳ 셀 선택 & 범위 지정
- ⏳ 컨텍스트 메뉴 (복사/붙여넣기/삭제)
- ⏳ TFT 매칭
- ⏳ KPI 통계 렌더링
- ⏳ JSON 복원 기능

## 🔧 확장 방법

### 새로운 모듈 추가
```javascript
// js/modules/newfeature.js
export function doSomething() {
  // ...
}

// js/main.js에서 import
import { doSomething } from './modules/newfeature.js';
```

### 새로운 스타일 추가
```css
/* css/newstyle.css 생성 */
.new-class { /* ... */ }

<!-- index.html에서 링크 -->
<link rel="stylesheet" href="css/newstyle.css">
```

## 🐛 디버깅

브라우저 개발자 도구 (F12) → Console에서 다음 확인:
```javascript
// 현재 데이터 상태
console.log(shipD, prodD);

// Supabase 연결 테스트
console.log(supabase);
```

## 📝 다음 단계

1. **셀 편집 시스템** 구현 (KeyDown, Blur, Enter)
2. **Dirty 추적** 시스템 (변경사항 감지)
3. **저장 로직** 구현 (Bulk INSERT/UPDATE)
4. **KPI 렌더링** 완성
5. **테스트 작성** (Jest)

---

**축하합니다!** 🎉 코드가 이제 훨씬 더 관리하기 쉬워졌습니다.
