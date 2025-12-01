# 예제 코드

이 디렉토리에는 MongoDB 로그 클러스터 사용 예제가 포함되어 있습니다.

## 📁 파일 목록

### 1. `nodejs-write-log.js`

Node.js에서 로그를 쓰고 조회하는 예제입니다.

**설치:**

```bash
npm install mongodb
```

**실행:**

```bash
node examples/nodejs-write-log.js
```

**기능:**

- 단일 로그 쓰기
- 벌크 로그 쓰기 (성능 최적화)
- 로그 조회 (시간 범위, 레벨 필터)

---

### 2. `python-write-log.py`

Python에서 로그를 쓰고 조회하는 예제입니다.

**설치:**

```bash
pip install pymongo
```

**실행:**

```bash
python examples/python-write-log.py
```

**기능:**

- 단일 로그 쓰기
- 벌크 로그 쓰기 (성능 최적화)
- 로그 조회 (시간 범위, 레벨 필터)

---

### 3. `create-daily-collection.js`

매일 새로운 Time-Series 컬렉션을 자동으로 생성하는 스크립트입니다.

**설치:**

```bash
npm install mongodb
```

**실행:**

```bash
node examples/create-daily-collection.js
```

**Cron 설정 (매일 자정 실행):**

```bash
# crontab -e
0 0 * * * cd /path/to/project && node examples/create-daily-collection.js >> /var/log/mongo-collection-creator.log 2>&1
```

**기능:**

- ReplicaSet 상태 확인
- 오늘 날짜 컬렉션 생성 (없으면)
- 내일 날짜 컬렉션 미리 생성
- 중복 실행 안전 (idempotent)

---

## 🔧 설정 변경

각 예제 파일의 상단에 있는 설정을 프로젝트에 맞게 수정하세요:

### Node.js 예제

```javascript
const MONGO_URI =
  "mongodb://service1:service1@localhost:37017,localhost:37018,localhost:37019/service1_logs?replicaSet=rs0&authSource=admin";
const DB_NAME = "service1_logs";
const SERVICE_NAME = "service1";
```

### Python 예제

```python
MONGO_URI = "mongodb://service1:service1@localhost:37017,localhost:37018,localhost:37019/service1_logs?replicaSet=rs0&authSource=admin"
DB_NAME = "service1_logs"
SERVICE_NAME = "service1"
```

### 컬렉션 생성 스크립트

```javascript
const MONGO_URI =
  "mongodb://log_cron:log_cron_pass@localhost:37017,localhost:37018,localhost:37019/?replicaSet=rs0&authSource=admin";
const SERVICES = ["service1", "service2"];
const TTL_DAYS = 30;
```

---

## 💡 팁

### 1. 연결 문자열 형식

```bash
mongodb://[username]:[password]@[host1]:[port1],[host2]:[port2],[host3]:[port3]/[database]?replicaSet=[rsName]&authSource=[authDB]
```

**필수 파라미터:**

- `replicaSet=rs0` - ReplicaSet 이름
- `authSource=admin` - 인증 데이터베이스

### 2. 환경 변수 사용

프로덕션 환경에서는 연결 문자열을 환경 변수로 관리하세요:

```javascript
// Node.js
const MONGO_URI = process.env.MONGO_URI || "mongodb://...";
```

```python
# Python
import os
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://...')
```

### 3. 에러 처리

항상 try-catch 블록으로 에러를 처리하세요:

```javascript
try {
  await writeLog("info", "message");
} catch (error) {
  console.error("로그 저장 실패:", error);
  // 에러 처리 로직 (재시도, 알림 등)
}
```

### 4. 연결 풀 관리

프로덕션 환경에서는 연결 풀을 사용하여 성능을 최적화하세요:

```javascript
const client = new MongoClient(MONGO_URI, {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
});
```

---

## 예제 실행 결과

### Node.js

```bash
=== MongoDB 로그 쓰기 예제 ===

1️. 단일 로그 쓰기:
- 로그 저장 성공: 674c1a2b3f4e5d6a7b8c9d0e
- 로그 저장 성공: 674c1a2b3f4e5d6a7b8c9d0f

2️. 벌크 로그 쓰기:
- 3개 로그 저장 완료

3. 로그 조회 (최근 1시간):
- 5개 로그 조회 완료

최근 로그:
  [warn] 2025-12-01T07:45:23.456Z - Rate limit approaching
  [info] 2025-12-01T07:45:23.455Z - API request processed
  [info] 2025-12-01T07:45:23.454Z - User login successful
  [error] 2025-12-01T07:45:23.123Z - Database connection failed
  [info] 2025-12-01T07:45:23.122Z - Application started

=== 완료 ===
```

### 컬렉션 생성 스크립트

```bash
======================================
MongoDB 일별 컬렉션 자동 생성
======================================

⏰ 실행 시간: 2025-12-01T00:00:00.000Z
👤 사용자: log_cron

🔍 ReplicaSet 상태 확인:
✔ MongoDB 연결 성공
✔ Primary: mongo1:27017
✔ MongoDB 연결 종료

📝 오늘 컬렉션 생성:
✔ MongoDB 연결 성공

📅 날짜: 2025-12-01
  ✔ service1_log_2025-12-01 생성 완료 (TTL: 30일)
  ✔ service2_log_2025-12-01 생성 완료 (TTL: 30일)

✅ 모든 컬렉션 생성 완료
✔ MongoDB 연결 종료

📝 내일 컬렉션 미리 생성:
✔ MongoDB 연결 성공

📅 날짜: 2025-12-02
  ✔ service1_log_2025-12-02 생성 완료 (TTL: 30일)
  ✔ service2_log_2025-12-02 생성 완료 (TTL: 30일)

✅ 모든 컬렉션 생성 완료
✔ MongoDB 연결 종료

======================================
✅ 완료!
======================================
```

---

## 🆘 문제 해결

### 인증 오류

```bash
MongoServerError: Authentication failed
```

**해결:**

- 연결 문자열에 `authSource=admin` 추가 확인
- 사용자 이름/비밀번호 확인
- 데이터베이스 이름이 사용자의 권한 범위 내인지 확인

### 컬렉션 없음 오류

```bash
MongoServerError: ns not found
```

**해결:**

- `create-daily-collection.js` 스크립트를 먼저 실행
- 또는 root 사용자로 수동 컬렉션 생성

### 연결 타임아웃

```bash
MongoServerError: Server selection timed out
```

**해결:**

- MongoDB 컨테이너가 실행 중인지 확인: `docker ps | grep mongo`
- ReplicaSet 상태 확인: `docker exec mongo1 mongosh -u root -p root --authenticationDatabase admin --eval "rs.status()"`
- 네트워크 연결 확인

---

## 📚 더 알아보기

- [메인 README](../README.md)
- [MongoDB Node.js Driver 문서](https://www.mongodb.com/docs/drivers/node/current/)
- [PyMongo 문서](https://pymongo.readthedocs.io/)
