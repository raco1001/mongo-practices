/**
 * 매일 새로운 Time-Series 컬렉션 자동 생성 스크립트
 *
 * 사용법:
 *   npm install mongodb
 *   node examples/create-daily-collection.js
 *
 * Cron 설정 예시 (매일 자정 10 분 전 실행):
 *   50 23 * * * cd /path/to/project && node examples/create-daily-collection.js >> /var/log/mongo-collection-creator.log 2>&1
 */

const { MongoClient } = require("mongodb");

// 설정
const MONGO_URI =
  "mongodb://log_cron:log_cron_pass@localhost:37017,localhost:37018,localhost:37019/?replicaSet=rs0&authSource=admin";
const SERVICES = ["service1", "service2"]; // 서비스 목록
const TTL_DAYS = 30; // TTL (일)

/**
 * 특정 날짜의 컬렉션 생성
 * @param {Date} date - 생성할 컬렉션의 날짜
 */
async function createCollectionsForDate(date) {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log("✔ MongoDB 연결 성공");

    const dateStr = date.toISOString().split("T")[0];
    console.log(`\n📅 날짜: ${dateStr}`);

    for (const service of SERVICES) {
      const dbName = `${service}_logs`;
      const collectionName = `${service}_log_${dateStr}`;

      const db = client.db(dbName);

      try {
        // Time-Series 컬렉션 생성
        await db.createCollection(collectionName, {
          timeseries: {
            timeField: "timestamp",
            metaField: "meta",
            granularity: "seconds",
          },
          expireAfterSeconds: TTL_DAYS * 24 * 60 * 60,
        });

        // 인덱스 생성
        await db.collection(collectionName).createIndex({
          "meta.service": 1,
          timestamp: -1,
        });

        console.log(`  ✔ ${collectionName} 생성 완료 (TTL: ${TTL_DAYS}일)`);
      } catch (error) {
        if (error.code === 48) {
          // 컬렉션이 이미 존재하는 경우
          console.log(`  ℹ ${collectionName} 이미 존재`);
        } else {
          console.error(`  ❌ ${collectionName} 생성 실패:`, error.message);
          throw error;
        }
      }
    }

    console.log("\n✅ 모든 컬렉션 생성 완료");
  } catch (error) {
    console.error("\n❌ 오류 발생:", error.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log("✔ MongoDB 연결 종료\n");
  }
}

/**
 * ReplicaSet 상태 확인
 */
async function checkReplicaSetStatus() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const admin = client.db("admin");
    const status = await admin.command({ replSetGetStatus: 1 });

    const primary = status.members.find((m) => m.state === 1);
    console.log(`✔ Primary: ${primary.name}`);

    return true;
  } catch (error) {
    console.error("❌ ReplicaSet 상태 확인 실패:", error.message);
    return false;
  } finally {
    await client.close();
  }
}

/**
 * 메인 함수
 */
async function main() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  console.log("======================================");
  console.log("MongoDB 일별 컬렉션 자동 생성");
  console.log("======================================\n");

  console.log("⏰ 실행 시간:", now.toISOString());
  console.log("👤 사용자: log_cron\n");

  // ReplicaSet 상태 확인
  console.log("🔍 ReplicaSet 상태 확인:");
  const isHealthy = await checkReplicaSetStatus();
  if (!isHealthy) {
    console.error("\n❌ ReplicaSet이 정상 상태가 아닙니다. 종료합니다.");
    process.exit(1);
  }
  console.log("");

  // 오늘 컬렉션 생성 (없으면)
  console.log("📝 오늘 컬렉션 생성:");
  await createCollectionsForDate(now);

  // 내일 컬렉션 미리 생성
  console.log("📝 내일 컬렉션 미리 생성:");
  await createCollectionsForDate(tomorrow);

  console.log("======================================");
  console.log("✅ 완료!");
  console.log("======================================");
}

// 스크립트 실행
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

module.exports = {
  createCollectionsForDate,
  checkReplicaSetStatus,
};
