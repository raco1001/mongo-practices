/**
 * Node.js 로그 쓰기 예제
 *
 * 사용법:
 *   npm install mongodb
 *   node examples/nodejs-write-log.js
 */

const { MongoClient } = require("mongodb");

// 설정
const MONGO_URI =
  "mongodb://service1:service1@localhost:37017,localhost:37018,localhost:37019/service1_logs?replicaSet=rs0&authSource=admin";
const DB_NAME = "service1_logs";
const SERVICE_NAME = "service1";

/**
 * 단일 로그 쓰기
 */
async function writeLog(level, message, details = {}) {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    // 오늘 날짜의 컬렉션
    const today = new Date().toISOString().split("T")[0];
    const collectionName = `${SERVICE_NAME}_log_${today}`;
    const collection = db.collection(collectionName);

    // Time-Series 데이터 형식
    const document = {
      timestamp: new Date(),
      meta: {
        service: SERVICE_NAME,
        level: level,
        hostname: require("os").hostname(),
        pid: process.pid,
      },
      message: message,
      details: details,
    };

    const result = await collection.insertOne(document);
    console.log("✔ 로그 저장 성공:", result.insertedId);
    return result.insertedId;
  } catch (error) {
    console.error("❌ 로그 저장 실패:", error.message);
    throw error;
  } finally {
    await client.close();
  }
}

/**
 * 벌크 로그 쓰기 (성능 최적화)
 */
async function writeBulkLogs(logs) {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const today = new Date().toISOString().split("T")[0];
    const collectionName = `${SERVICE_NAME}_log_${today}`;
    const collection = db.collection(collectionName);

    // 여러 로그를 배열로 준비
    const documents = logs.map((log) => ({
      timestamp: new Date(log.timestamp || Date.now()),
      meta: {
        service: SERVICE_NAME,
        level: log.level,
        hostname: require("os").hostname(),
        pid: process.pid,
      },
      message: log.message,
      details: log.details || {},
    }));

    const result = await collection.insertMany(documents);
    console.log(`✔ ${result.insertedCount}개 로그 저장 완료`);
    return result.insertedIds;
  } catch (error) {
    console.error("❌ 벌크 저장 실패:", error.message);
    throw error;
  } finally {
    await client.close();
  }
}

/**
 * 로그 조회
 */
async function queryLogs(startDate, endDate, level = null, limit = 100) {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const today = new Date().toISOString().split("T")[0];
    const collectionName = `${SERVICE_NAME}_log_${today}`;
    const collection = db.collection(collectionName);

    // 쿼리 구성
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
      .limit(limit)
      .toArray();

    console.log(`✔ ${logs.length}개 로그 조회 완료`);
    return logs;
  } catch (error) {
    console.error("❌ 로그 조회 실패:", error.message);
    throw error;
  } finally {
    await client.close();
  }
}

// 실행 예제
async function main() {
  console.log("=== MongoDB 로그 쓰기 예제 ===\n");

  try {
    // 1. 단일 로그 쓰기
    console.log("1️⃣ 단일 로그 쓰기:");
    await writeLog("info", "Application started", {
      version: "1.0.0",
      port: 3000,
    });

    await writeLog("error", "Database connection failed", {
      error: "ECONNREFUSED",
      host: "localhost:5432",
    });

    console.log("");

    // 2. 벌크 로그 쓰기
    console.log("2️⃣ 벌크 로그 쓰기:");
    await writeBulkLogs([
      {
        level: "info",
        message: "User login successful",
        details: { userId: 12345, ip: "192.168.1.100" },
      },
      {
        level: "info",
        message: "API request processed",
        details: { endpoint: "/api/users", method: "GET", duration: 45 },
      },
      {
        level: "warn",
        message: "Rate limit approaching",
        details: { limit: 1000, current: 950 },
      },
    ]);

    console.log("");

    // 3. 로그 조회
    console.log("3️⃣ 로그 조회 (최근 1시간):");
    const oneHourAgo = new Date(Date.now() - 3600000);
    const now = new Date();
    const recentLogs = await queryLogs(oneHourAgo, now);

    console.log("\n최근 로그:");
    recentLogs.slice(0, 5).forEach((log) => {
      console.log(
        `  [${log.meta.level}] ${log.timestamp.toISOString()} - ${log.message}`,
      );
    });

    console.log("\n=== 완료 ===");
  } catch (error) {
    console.error("\n실행 중 오류:", error);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  main();
}

// Export for use as module
module.exports = {
  writeLog,
  writeBulkLogs,
  queryLogs,
};
