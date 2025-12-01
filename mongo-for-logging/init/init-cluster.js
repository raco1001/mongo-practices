// MongoDB ReplicaSet 초기화 스크립트
// 사용법: docker exec mongo1 mongosh < init/init-cluster.js

// 환경 설정
const SERVICE_LIST = ["service1", "service2"]; // 필요시 수정
const ROOT_USER = "root";
const ROOT_PASS = "root";
const CRON_USER = "log_cron";
const CRON_PASS = "log_cron_pass";
const TTL_DAYS = 30;

print("======================================");
print("MongoDB ReplicaSet 초기화");
print("======================================");

// Step 1: ReplicaSet 초기화
print("\nStep 1: ReplicaSet 초기화");
try {
  const status = rs.status();
  if (status.ok === 1) {
    print("✔ ReplicaSet이 이미 초기화되어 있습니다");
  }
} catch (e) {
  print("ReplicaSet 초기화 중...");
  const result = rs.initiate({
    _id: "rs0",
    members: [
      { _id: 0, host: "mongo1:27017", priority: 2 },
      { _id: 1, host: "mongo2:27017", priority: 1 },
      { _id: 2, host: "mongo3:27017", priority: 1 },
    ],
  });

  if (result.ok === 1) {
    print("✔ ReplicaSet 초기화 완료");
    print("Primary 선출 대기 중...");
    sleep(15000);

    // Primary가 선출될 때까지 대기
    let retries = 10;
    while (retries > 0) {
      try {
        const status = rs.status();
        const primary = status.members.find((m) => m.state === 1);
        if (primary) {
          print("✔ Primary 선출 완료: " + primary.name);
          break;
        }
      } catch (e) {
        // ignore
      }
      sleep(2000);
      retries--;
    }
  } else {
    print("❌ 실패:", JSON.stringify(result));
    quit(1);
  }
}

// Step 2: Root 사용자 생성
print("\nStep 2: Root 사용자 생성");
try {
  db.getSiblingDB("admin").createUser({
    user: ROOT_USER,
    pwd: ROOT_PASS,
    roles: ["root"],
  });
  print("✔ Root 사용자 생성: " + ROOT_USER + " / " + ROOT_PASS);
} catch (e) {
  if (e.code === 51003) {
    print("✔ Root 사용자가 이미 존재합니다");
  } else {
    print("❌ 에러:", e.message);
    quit(1);
  }
}

// Step 3: 인증
print("\nStep 3: 인증");
db.getSiblingDB("admin").auth(ROOT_USER, ROOT_PASS);
print("✔ root로 인증 완료");

// Step 4: 서비스별 데이터베이스, 사용자, 컬렉션 생성
print("\nStep 4: 서비스별 DB, 사용자, 컬렉션 생성");

const today = new Date().toISOString().split("T")[0];

SERVICE_LIST.forEach((service) => {
  print("\n[" + service + "]");

  const dbName = service + "_logs";
  const collectionName = service + "_log_" + today;

  // 4-1. 데이터베이스 생성
  db.getSiblingDB(dbName).getCollection("_init").insertOne({
    service: service,
    initialized: true,
    createdAt: new Date(),
  });
  print("✔ 데이터베이스: " + dbName);

  // 4-2. 서비스별 사용자 생성
  try {
    db.getSiblingDB("admin").createUser({
      user: service,
      pwd: service,
      roles: [{ role: "readWrite", db: dbName }],
    });
    print(
      "✔ 사용자: " +
        service +
        " / " +
        service +
        " (readWrite on " +
        dbName +
        ")",
    );
  } catch (e) {
    if (e.code === 51003) {
      print("✔ 사용자 이미 존재: " + service);
    } else {
      throw e;
    }
  }

  // 4-3. Time-Series 컬렉션 생성
  try {
    db.getSiblingDB(dbName).createCollection(collectionName, {
      timeseries: {
        timeField: "timestamp",
        metaField: "meta",
        granularity: "seconds",
      },
      expireAfterSeconds: TTL_DAYS * 24 * 60 * 60,
    });

    // 인덱스 생성
    db.getSiblingDB(dbName)
      .getCollection(collectionName)
      .createIndex({ "meta.service": 1, timestamp: -1 });

    print("✔ 컬렉션: " + collectionName + " (TTL: " + TTL_DAYS + "일)");
  } catch (e) {
    if (e.code === 48) {
      print("✔ 컬렉션 이미 존재: " + collectionName);
    } else {
      throw e;
    }
  }
});

// Step 5: cron 사용자용 커스텀 role 및 사용자 생성
print("\nStep 5: cron 사용자 생성");

(function () {
  // 모든 _logs 데이터베이스에 대한 권한
  var logDbs = db
    .getMongo()
    .getDBNames()
    .filter(function (name) {
      return name.endsWith("_logs");
    });

  var privileges = [];
  for (var i = 0; i < logDbs.length; i++) {
    privileges.push({
      resource: { db: logDbs[i], collection: "" },
      actions: ["createCollection", "createIndex", "listCollections"],
    });
  }

  // ReplicaSet 상태 확인을 위한 최소 권한 추가
  privileges.push({
    resource: { cluster: true },
    actions: ["replSetGetStatus"],
  });

  try {
    db.getSiblingDB("admin").createRole({
      role: "logCollectionManager",
      privileges: privileges,
      roles: [],
    });
    print("✔ 커스텀 role 생성: logCollectionManager");
  } catch (e) {
    if (e.code === 51002) {
      // role이 이미 존재하면 업데이트
      db.getSiblingDB("admin").updateRole("logCollectionManager", {
        privileges: privileges,
        roles: [],
      });
      print("✔ 커스텀 role 업데이트: logCollectionManager");
    } else {
      throw e;
    }
  }

  // cron 사용자 생성
  try {
    db.getSiblingDB("admin").createUser({
      user: CRON_USER,
      pwd: CRON_PASS,
      roles: [{ role: "logCollectionManager", db: "admin" }],
    });
    print("✔ cron 사용자 생성: " + CRON_USER + " / " + CRON_PASS);
    print("  권한: " + logDbs.join(", ") + " (createCollection only)");
  } catch (e) {
    if (e.code === 51003) {
      print("✔ cron 사용자 이미 존재");
    } else {
      throw e;
    }
  }
})();

// 요약 출력
print("\n======================================");
print("✔ 초기화 완료!");
print("======================================");

print("\nReplicaSet 상태:");
rs.status().members.forEach((m) => {
  print("  " + m.name + " - " + m.stateStr);
});

print("\n생성된 데이터베이스:");
db.getMongo()
  .getDBNames()
  .filter(function (n) {
    return n.endsWith("_logs");
  })
  .forEach(function (db) {
    print("  - " + db);
  });

print("\n생성된 사용자:");
db.getSiblingDB("admin")
  .getUsers()
  .users.forEach(function (u) {
    print("  - " + u.user);
  });

print("\n======================================");
print("외부 접속 정보:");
print("  Host: localhost:37017,localhost:37018,localhost:37019");
print("  ReplicaSet Name: rs0");
print("  User: " + ROOT_USER + " / " + ROOT_PASS);
print("  Auth DB: admin");
print("======================================");
