# MongoDB 로그 수집 클러스터

시계열(Time-Series) 컬렉션을 사용한 로그 수집 전용 MongoDB ReplicaSet 클러스터입니다.

## 목차

- [구성](#-구성)
- [빠른 시작](#-빠른-시작)
- [보안 설정](#-보안-설정)
- [데이터베이스 구조](#️-데이터베이스-구조)
- [외부 접속](#-외부-접속-studio-3t-compass-등)
- [애플리케이션 사용 가이드](#-애플리케이션-사용-가이드)
  - [Node.js 예제](#nodejs-예제)
  - [Python 예제](#python-예제)
  - [컬렉션 자동 생성](#컬렉션-자동-생성)
- [예제 코드](#-예제-코드)
- [서비스 추가](#-서비스-추가)
- [완전 초기화](#-완전-초기화)
- [모니터링](#-모니터링)
- [문제 해결](#-문제-해결)
- [사용 시나리오](#-사용-시나리오)
- [Best Practices](#-best-practices)

## 구성

```bash
┌─────────────────────┐     ┌─────────────────────┐
│  Service1 App       │     │  Service2 App       │
│  (service1/service1)│     │  (service2/service2)│
└──────────┬──────────┘     └──────────┬──────────┘
           │                           │
           │  Write Logs               │  Write Logs
           │                           │
           └───────────┬───────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │  MongoDB ReplicaSet (rs0)            │
        │                                      │
        │  ┌─────────────────────────────┐    │
        │  │ mongo1 (Primary)   :37017   │    │
        │  └─────────────────────────────┘    │
        │  ┌─────────────────────────────┐    │
        │  │ mongo2 (Secondary) :37018   │    │
        │  └─────────────────────────────┘    │
        │  ┌─────────────────────────────┐    │
        │  │ mongo3 (Secondary) :37019   │    │
        │  └─────────────────────────────┘    │
        │                                      │
        │  service1_logs/                   │
        │    - service1_log_2025-12-01        │
        │    - service1_log_2025-12-02        │
        │                                      │
        │  service2_logs/                   │
        │    - service2_log_2025-12-01        │
        │    - service2_log_2025-12-02        │
        │                                      │
        │  KeyFile Authentication           │
        │  TTL Auto-expiration (30일)        │
        └──────────────────────────────────────┘
                       ▲
                       │
           ┌───────────┴───────────┐
           │  Cron Job (Optional)  │
           │  (log_cron user)      │
           │  Daily collection     │
           │  creation             │
           └───────────────────────┘
```

## 프로젝트 구조

```bash
.
├── README.md
├── docker-compose.yml
├── examples
│   ├── README.md
│   ├── create-daily-collection.js
│   ├── nodejs-write-log.js
│   └── python-write-log.py
├── init
│   └── init-cluster.js # 레플리카 셋 초기화 파일. init-rs.sh 가 실행합니다.
├── init-rs.sh # 도커 컴포즈 정상 동작 확인 후 실행해주세요.
└── keyfile
    └── mongodb-keyfile # 직접 생성해야 합니다.(시작하기에 명령어 있습니다.)
```

## 시작하기

### 1. MongoDB 클러스터 시작

```bash
mkdir -p ./keyfile &&
openssl rand -base64 756 > ./keyfile/mongodb-keyfile &&
chmod 400 ./keyfile/mongodb-keyfile
```

```bash
docker-compose up -d
```

### 2. ReplicaSet 초기화

```bash
./init-rs.sh
```

초기화 스크립트는 다음 작업을 수행합니다:

- ReplicaSet 초기화 (`rs0`)
- Root 사용자 생성 (`root / root`)
- 서비스별 데이터베이스 생성 (`service1_logs`, `service2_logs`)
- 서비스별 사용자 생성 (각 서비스별 readWrite 권한)
- Cron 사용자 생성 (`log_cron` - 컬렉션 생성 권한만)
- 오늘 날짜의 Time-Series 컬렉션 생성

### 3. 연결 확인

```bash
docker exec mongo1 mongosh -u root -p root --authenticationDatabase admin --eval "rs.status()"
```

## 보안 설정

### KeyFile Authentication

- ReplicaSet 노드 간 통신은 KeyFile로 보호됩니다
- `keyfile/mongodb-keyfile`은 자동으로 생성되며 `600` 권한으로 설정됩니다

### 사용자 권한

| 사용자     | 비밀번호   | 권한                                                 | 용도                    |
| ---------- | ---------- | ---------------------------------------------------- | ----------------------- |
| `root`     | `root`     | root                                                 | 관리자                  |
| `service1` | `service1` | readWrite on service1_logs                           | Service1 로그 읽기/쓰기 |
| `service2` | `service2` | readWrite on service2_logs                           | Service2 로그 읽기/쓰기 |
| `log_cron` | `log_cron` | createCollection, createIndex (service\*\_logs only) | 컬렉션 자동 생성        |

### log_cron 사용자 제한

`log_cron` 사용자는 다음과 같은 최소 권한만 가지고 있습니다:

- `service*_logs` 데이터베이스에서 컬렉션 생성
- 인덱스 생성
- ReplicaSet 상태 확인

- 데이터 읽기/쓰기 불가
- 시스템 DB 접근 불가
- 사용자 생성/삭제 불가

## 데이터베이스 구조

### Time-Series 컬렉션

각 서비스는 날짜별로 별도의 Time-Series 컬렉션을 사용합니다:

```bash
service1_logs/
  ├── service1_log_2025-12-01
  ├── service1_log_2025-12-02
  └── ...

service2_logs/
  ├── service2_log_2025-12-01
  ├── service2_log_2025-12-02
  └── ...
```

### 컬렉션 설정

```javascript
{
  timeseries: {
    timeField: 'timestamp',      // 시간 필드
    metaField: 'meta',            // 메타데이터 필드
    granularity: 'seconds'        // 초 단위 그래뉼래리티
  },
  expireAfterSeconds: 2592000    // TTL: 30일
}
```

**TTL 사용에 대해: 현재 프로젝트는 컬렉션의 핫/콜드 분리 방식 또한 생각해보면서 구성했습니다.**

- 로그 데이터 수집에서 단일 컬렉션을 사용하는 경우 -> TTL을 이용해 도큐먼트 수명 관리
- 로그 데이터 컬렉션을 단위 기간 별로 따로 생성하여 이용하는 경우 (핫(데이터 갱신 중)/콜드(갱신 완료된) 분리)-> TTL을 사용하는 것 보다 기간이 만료된 컬렉션을 한 번에 드랍하는게 나을 수 도 있습니다.
- 필요에 따라 컬렉션의 TTL 설정을 변경하는 것을 추천합니다.

### 인덱스

```javascript
{ 'meta.service': 1, timestamp: -1 }
```

## 외부 접속 (Studio 3T, Compass 등)

### 연결 문자열

```bash
mongodb://root:root@localhost:37017,localhost:37018,localhost:37019/?replicaSet=rs0&authSource=admin
```

### Studio 3T 설정

1. **Connection Type**: Standalone (각각 설정)
2. **Servers**:
   - `localhost:37017`
   - `localhost:37018`
   - `localhost:37019`
3. **Replica Set Name**: `rs0`
4. **Authentication**(기본값):
   - Username: `root`
   - Password: `root`
   - Auth DB: `admin`

## 애플리케이션 사용 가이드

### 연결 문자열

각 서비스는 자신의 전용 사용자로 접속할 수 있습니다:

```javascript
// Service1 애플리케이션
const MONGO_URI =
  "mongodb://service1:service1@mongo1:27017,mongo2:27017,mongo3:27017/service1_logs?replicaSet=rs0&authSource=admin";

// Service2 애플리케이션
const MONGO_URI =
  "mongodb://service2:service2@mongo1:27017,mongo2:27017,mongo3:27017/service2_logs?replicaSet=rs0&authSource=admin";
```

**중요:**

- 각 서비스는 **자신의 DB만** 읽기/쓰기 가능
- `authSource=admin` 필수 (모든 사용자는 admin DB에서 생성됨)
- ReplicaSet 모드로 연결 (`replicaSet=rs0`)

### Node.js 예제

#### 1. 설치

```bash
npm install mongodb
```

#### 2. 로그 쓰기 코드

```javascript
const { MongoClient } = require("mongodb");

// 연결 설정
const MONGO_URI =
  "mongodb://service1:service1@mongo1:27017,mongo2:27017,mongo3:27017/service1_logs?replicaSet=rs0&authSource=admin";
const DB_NAME = "service1_logs";

async function writeLog(logData) {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();

    const db = client.db(DB_NAME);

    // 오늘 날짜의 컬렉션 이름
    const today = new Date().toISOString().split("T")[0];
    const collectionName = `service1_log_${today}`;

    const collection = db.collection(collectionName);

    // Time-Series 데이터 형식
    const document = {
      timestamp: new Date(), // 필수: timeField
      meta: {
        // 필수: metaField
        service: "service1",
        level: "info",
        component: "api-server",
      },
      message: logData.message,
      details: logData.details,
    };

    await collection.insertOne(document);
    console.log("로그 저장 성공");
  } catch (error) {
    console.error("로그 저장 실패:", error);
  } finally {
    await client.close();
  }
}

// 사용 예
writeLog({
  message: "User login successful",
  details: {
    userId: 12345,
    ip: "192.168.1.100",
  },
});
```

#### 3. 벌크 쓰기 (권장)

성능을 위해 여러 로그를 한 번에 저장:

```javascript
async function writeBulkLogs(logs) {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const today = new Date().toISOString().split("T")[0];
    const collectionName = `service1_log_${today}`;
    const collection = db.collection(collectionName);

    // 여러 로그를 배열로 준비
    const documents = logs.map((log) => ({
      timestamp: new Date(log.timestamp || Date.now()),
      meta: {
        service: "service1",
        level: log.level,
        component: log.component,
      },
      message: log.message,
      details: log.details,
    }));

    await collection.insertMany(documents);
    console.log(`${documents.length}개 로그 저장 완료`);
  } catch (error) {
    console.error("벌크 저장 실패:", error);
  } finally {
    await client.close();
  }
}
```

#### 4. 로그 조회

```javascript
async function queryLogs(startDate, endDate, level) {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const today = new Date().toISOString().split("T")[0];
    const collectionName = `service1_log_${today}`;
    const collection = db.collection(collectionName);

    // 쿼리
    const query = {
      timestamp: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
    };

    if (level) {
      query["meta.level"] = level;
    }

    const logs = await collection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();

    return logs;
  } finally {
    await client.close();
  }
}

// 사용 예: 오늘의 에러 로그 조회
const errorLogs = await queryLogs(
  new Date().setHours(0, 0, 0, 0),
  new Date(),
  "error",
);
```

### Python 예제

#### 1. 설치

```bash
pip install pymongo
```

#### 2. 로그 쓰기

```python
from pymongo import MongoClient
from datetime import datetime

# 연결
MONGO_URI = "mongodb://service1:service1@mongo1:27017,mongo2:27017,mongo3:27017/service1_logs?replicaSet=rs0&authSource=admin"
client = MongoClient(MONGO_URI)
db = client.service1_logs

def write_log(message, level='info', details=None):
    # 오늘 날짜의 컬렉션
    today = datetime.now().strftime('%Y-%m-%d')
    collection_name = f'service1_log_{today}'
    collection = db[collection_name]

    # Time-Series 데이터
    document = {
        'timestamp': datetime.utcnow(),
        'meta': {
            'service': 'service1',
            'level': level,
            'component': 'python-app'
        },
        'message': message,
        'details': details or {}
    }

    collection.insert_one(document)
    print('로그 저장 완료')

# 사용 예
write_log(
    message='Database connection established',
    level='info',
    details={'db': 'postgres', 'host': 'localhost'}
)
```

### 컬렉션 자동 생성

**중요:** 각 서비스 사용자는 컬렉션 생성 권한이 **없습니다**.

새로운 날짜의 컬렉션은 다음 방법으로 생성해야 합니다:

#### 방법 1: 수동 생성 (관리자)

```bash
docker exec mongo1 mongosh -u root -p root --authenticationDatabase admin --eval "
  db.getSiblingDB('service1_logs').createCollection('service1_log_2025-12-02', {
    timeseries: {
      timeField: 'timestamp',
      metaField: 'meta',
      granularity: 'seconds'
    },
    expireAfterSeconds: 2592000
  });

  db.getSiblingDB('service1_logs').getCollection('service1_log_2025-12-02').createIndex(
    { 'meta.service': 1, timestamp: -1 }
  );
"
```

#### 방법 2: Cron Job (자동화)

`log_cron` 사용자로 매일 자정에 새 컬렉션을 자동 생성하는 스크립트를 실행:

```javascript
// create-daily-collection.js
const { MongoClient } = require("mongodb");

const MONGO_URI =
  "mongodb://log_cron:log_cron_pass@mongo1:27017,mongo2:27017,mongo3:27017/?replicaSet=rs0&authSource=admin";
const SERVICES = ["service1", "service2"];
const TTL_DAYS = 30;

async function createDailyCollections() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();

    const today = new Date().toISOString().split("T")[0];

    for (const service of SERVICES) {
      const dbName = `${service}_logs`;
      const collectionName = `${service}_log_${today}`;

      const db = client.db(dbName);

      try {
        await db.createCollection(collectionName, {
          timeseries: {
            timeField: "timestamp",
            metaField: "meta",
            granularity: "seconds",
          },
          expireAfterSeconds: TTL_DAYS * 24 * 60 * 60,
        });

        await db.collection(collectionName).createIndex({
          "meta.service": 1,
          timestamp: -1,
        });

        console.log(`✔ ${collectionName} 생성 완료`);
      } catch (error) {
        if (error.code === 48) {
          console.log(`✔ ${collectionName} 이미 존재`);
        } else {
          throw error;
        }
      }
    }
  } finally {
    await client.close();
  }
}

createDailyCollections();
```

**Linux Crontab 설정:**

```bash
# 매일 자정 10 분 전 실행
50 23 * * * cd /path/to/project && node create-daily-collection.js >> /var/log/mongo-collection-creator.log 2>&1
```

### Docker Compose에 통합

크론 애플리케이션을 Docker Compose에 추가:

```yaml
services:
  # ... 기존 mongo1, mongo2, mongo3 ...

  service1-app:
    image: node:20
    environment:
      - MONGO_URI=mongodb://service1:service1@mongo1:27017,mongo2:27017,mongo3:27017/service1_logs?replicaSet=rs0&authSource=admin
    networks:
      - mongo-network
    depends_on:
      - mongo1
      - mongo2
      - mongo3
```

### 주의사항

1. **컬렉션 미리 생성 필요**

   - 서비스 사용자는 컬렉션 생성 불가
   - 매일 자정 10 분 전에 다음 날 컬렉션을 미리 생성해야 함 (정각 보단 미리 만드는게 안전할 것 같아서 이렇게 설정했습니다.)

2. **Time-Series 필수 필드**

   - `timestamp`: Date 객체 (필수)
   - `meta`: Object (필수, 메타데이터 저장)

3. **에러 처리**

   - 컬렉션이 없으면 에러 발생
   - Try-catch로 에러 처리 필수

4. **연결 풀 관리**
   - 프로덕션에서는 연결 풀 사용 권장
   - 매번 연결/해제하지 말고 재사용

```javascript
let cachedClient = null;

async function getMongoClient() {
  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = new MongoClient(MONGO_URI, {
    maxPoolSize: 10,
    minPoolSize: 2,
  });

  await cachedClient.connect();
  return cachedClient;
}
```

## 예제 코드

실행 가능한 예제 코드는 [`examples/`](./examples) 디렉토리에서 확인할 수 있습니다:

### 제공 예제

1. **`nodejs-write-log.js`** - Node.js 로그 쓰기/조회 예제

   ```bash
   npm install mongodb
   node examples/nodejs-write-log.js
   ```

2. **`python-write-log.py`** - Python 로그 쓰기/조회 예제

   ```bash
   pip install pymongo
   python examples/python-write-log.py
   ```

3. **`create-daily-collection.js`** - 일별 컬렉션 자동 생성 스크립트

   ```bash
   node examples/create-daily-collection.js
   ```

자세한 내용은 [examples/README.md](./examples/README.md)를 참조하세요.

## 서비스 추가

### .env 파일 수정

새 서비스를 추가하려면 `init/init-cluster.js` 파일의 `SERVICE_LIST` 배열을 수정:

```javascript
// init/init-cluster.js
const SERVICE_LIST = ["service1", "service2", "service3"]; // service3 추가 && 비밀번호는 서비스 이름으로 자동 설정 됨
```

### 초기화 실행

```bash
./init-rs.sh
```

기존 데이터는 유지되며, 새로운 서비스만 추가됩니다:

- `service3_logs` 데이터베이스 생성
- `service3 / service3` 사용자 생성 (readWrite 권한)
- `service3_log_2025-12-01` 컬렉션 생성

## 완전 초기화

모든 데이터를 삭제하고 처음부터 다시 시작하려면:

```bash
docker-compose down -v
docker-compose up -d
sleep 10
./init-rs.sh
```

## 모니터링

### ReplicaSet 상태 확인

```bash
docker exec mongo1 mongosh -u root -p root --authenticationDatabase admin --eval "rs.status()"
```

### 데이터베이스 목록

```bash
docker exec mongo1 mongosh -u root -p root --authenticationDatabase admin --eval "db.getMongo().getDBNames()"
```

### 컬렉션 크기 확인

```bash
docker exec mongo1 mongosh -u root -p root --authenticationDatabase admin --eval "
  db.getSiblingDB('service1_logs').getCollectionNames().forEach(function(name) {
    var stats = db.getSiblingDB('service1_logs').getCollection(name).stats();
    print(name + ': ' + (stats.size / 1024 / 1024).toFixed(2) + ' MB');
  });
"
```

## 문제 해결

### 컨테이너가 시작되지 않을 때

```bash
docker logs mongo1
```

KeyFile 권한 문제일 수 있습니다. `keyfile/mongodb-keyfile`의 권한을 확인하세요.

### ReplicaSet 초기화 실패

```bash
docker exec mongo1 mongosh --eval "rs.status()"
```

이미 초기화되어 있는지 확인하고, 필요시 `docker-compose down -v`로 완전 초기화하세요.

### 인증 오류

모든 사용자는 `admin` 데이터베이스에서 생성되므로, `--authenticationDatabase admin`을 사용해야 합니다.

## 사용 시나리오

### 1. 마이크로서비스 로그 수집

각 마이크로서비스가 자신의 전용 데이터베이스에 로그 저장:

```javascript
// API Gateway
writeLog("service1_logs", { endpoint: "/api/users", status: 200 });

// Auth Service
writeLog("service2_logs", { action: "login", user: "john@example.com" });
```

### 2. 멀티테넌트 로그 시스템

각 테넌트(고객)별로 독립된 데이터베이스:

```javascript
// tenant1.js
const client = new MongoClient(
  "mongodb://tenant1:tenant1@.../tenant1_logs?...",
);

// tenant2.js
const client = new MongoClient(
  "mongodb://tenant2:tenant2@.../tenant2_logs?...",
);
```

### 3. 로그 분석 대시보드

시간대별, 레벨별 로그 조회:

```javascript
// 최근 1시간 에러 로그
const errors = await collection
  .find({
    timestamp: { $gte: new Date(Date.now() - 3600000) },
    "meta.level": "error",
  })
  .toArray();

// 특정 사용자의 활동 로그
const userLogs = await collection
  .find({
    "meta.userId": 12345,
  })
  .sort({ timestamp: -1 })
  .limit(50)
  .toArray();
```

## Best Practices

### 1. 연결 관리

- 연결 풀 사용 (매번 연결/해제 하지 않기)
- 애플리케이션 시작 시 연결 확인
- 에러 시 자동 재연결 로직 구현

### 2. 데이터 모델링

- `timestamp`는 **항상 UTC 사용**
- `meta` 필드에 인덱스 가능한 정보 저장 (서비스 이름 등)
- 상세 정보는 별도 필드에 저장

### 3. 성능 최적화

- 벌크 insert 사용 (insertMany)
- Write Concern 설정 (`w: 1` for 로그)
- 불필요한 인덱스 제거

### 4. 운영

- 매일 자정 전에 다음 날 컬렉션 미리 생성
- 디스크 사용량 모니터링 (TTL 30일)
- ReplicaSet 상태 정기 체크

## 참고 자료

- [MongoDB Time Series Collections](https://www.mongodb.com/docs/manual/core/timeseries-collections/)
- [MongoDB ReplicaSet](https://www.mongodb.com/docs/manual/replication/)
- [MongoDB TTL Indexes](https://www.mongodb.com/docs/manual/core/index-ttl/)
- [MongoDB Security](https://www.mongodb.com/docs/manual/security/)
- [Node.js MongoDB Driver](https://www.mongodb.com/docs/drivers/node/current/)
- [Python PyMongo](https://pymongo.readthedocs.io/)
