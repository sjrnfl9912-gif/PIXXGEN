# 테스트 체크리스트

## 🔍 브라우저 콘솔 테스트

### 1. 페이지 로드 확인
```javascript
// Console에서 실행
console.log('페이지 로드됨:', document.title);
```

### 2. 데이터 로드 확인
```javascript
console.log('출하 데이터:', shipD.length, '건');
console.log('생산 데이터:', prodD.length, '건');
```

### 3. Supabase 연결 확인
```javascript
console.log('Supabase:', supabase ? '✅ 연결됨' : '❌ 실패');
```

### 4. 테이블 렌더링 확인
```javascript
// 표가 보이는지 확인
document.querySelector('table.g') ? console.log('✅ 테이블 렌더링됨') : console.log('❌ 테이블 없음');
```

### 5. 캐싱 확인
```javascript
console.log('로컬스토리지:', localStorage.getItem('cache_shipment') ? '✅ 캐시 있음' : '❌ 캐시 없음');
```

---

## ✅ UI 기능 테스트

### 탭 전환
- [ ] "검사포장 출하이력" 클릭 → 화면 전환됨
- [ ] "생산관리대장" 클릭 → 다른 테이블 표시됨
- [ ] "통합취합본" 클릭 → 빈 테이블 (아직 미구현)
- [ ] "KPI 통계" 클릭 → 통계 영역 표시됨

### 검색
- [ ] 검색창에 텍스트 입력 → 결과 필터링됨
- [ ] 지우기 버튼 (×) 클릭 → 검색 초기화

### 필터
- [ ] "PIXX" 칩 클릭 → PIXX 데이터만 표시
- [ ] "전체" 칩 클릭 → 모든 데이터 표시

### 버튼
- [ ] "💾 저장" → 토스트 메시지 나타남
- [ ] "📥 백업" → 파일 다운로드됨
- [ ] "🔄 새로고침" → 데이터 다시 로드됨

---

## 🐛 예상 에러 & 해결

### 에러 1: "Module not found"
```
❌ Uncaught TypeError: Failed to resolve module specifier "..."
```
**해결**: 상대 경로 확인 (`./` 또는 `../` 정확히)

### 에러 2: "Supabase connection failed"
```
❌ TypeError: Cannot read property 'from' of undefined
```
**해결**: Supabase URL/Key 확인, 네트워크 연결 확인

### 에러 3: "localStorage is not defined"
```
❌ ReferenceError: localStorage is not defined
```
**해결**: HTTP 서버로 실행 (파일:// 프로토콜 아님)

---

## 📊 성능 테스트

```javascript
// 콘솔에서 실행
console.time('renderTable');
renderShipmentTable(shipD);
console.timeEnd('renderTable');
// → 50ms 이상은 느린 편
```

---

## 🚀 다음 스텝

1. **로컬 서버 실행**: `python -m http.server 8000`
2. **브라우저 열기**: `http://localhost:8000`
3. **F12 콘솔** 확인
4. **각 탭 클릭** → 데이터 표시되는지 확인
5. **검색/필터** → 작동하는지 확인

모든 항목이 ✅ 되면 성공!
