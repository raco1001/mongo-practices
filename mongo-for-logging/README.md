# MongoDB Log Collection Cluster

A dedicated MongoDB ReplicaSet cluster optimized for log ingestion using Time-Series collections.

## Table of Contents

- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Security](#security)
- [Database Structure](#database-structure)
- [External Access](#external-access-studio-3t-compass-etc)
- [Application Integration](#application-integration)
  - [Node.js Example](#nodejs-example)
  - [Python Example](#python-example)
  - [Automatic Collection Creation](#automatic-collection-creation)
- [Example Code](#example-code)
- [Adding Services](#adding-services)
- [Resetting the Cluster](#resetting-the-cluster)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Use Cases](#use-cases)
- [Best Practices](#best-practices)

## Architecture

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
        │  ┌─────────────────────────────┐     │
        │  │ mongo1 (Primary)   :37017   │     │
        │  └─────────────────────────────┘     │
        │  ┌─────────────────────────────┐     │
        │  │ mongo2 (Secondary) :37018   │     │
        │  └─────────────────────────────┘     │
        │  ┌─────────────────────────────┐     │
        │  │ mongo3 (Secondary) :37019   │     │
        │  └─────────────────────────────┘     │
        │                                      │
        │  service1_logs/                      │
        │    - service1_log_2025-12-01         │
        │    - service1_log_2025-12-02         │
        │                                      │
        │  service2_logs/                      │
        │    - service2_log_2025-12-01         │
        │    - service2_log_2025-12-02         │
        │                                      │
        │  KeyFile Authentication              │
        │  TTL Auto-expiration (30 days)       │
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

## Project Structure

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
│   └── init-cluster.js # ReplicaSet initialization logic (executed by init-rs.sh)
├── init-rs.sh          # Run after docker-compose is up
└── keyfile
    └── mongodb-keyfile # Must be created manually (instructions below)
```

## Getting Started

### 1. Create KeyFile & Start Cluster

```bash
mkdir -p ./keyfile &&
openssl rand -base64 756 > ./keyfile/mongodb-keyfile &&
chmod 400 ./keyfile/mongodb-keyfile
```

```bash
docker-compose up -d
```

### 2. Initialize ReplicaSet

```bash
./init-rs.sh
```

This script performs the following operations:

- ReplicaSet initialization (`rs0`)
- Creation of root user (`root / root`)
- Separate databases for each service (`service1_logs`, `service2_logs`)
- Per-service application users (readWrite permissions only)
- Cron user (`log_cron` - collection creation permissions only)
- Creation of today's Time-Series collections

### 3. Verify Connection

```bash
docker exec mongo1 mongosh -u root -p root --authenticationDatabase admin --eval "rs.status()"
```

## Security

### KeyFile Authentication

- Inter-node communication in the ReplicaSet is secured with KeyFile
- `keyfile/mongodb-keyfile` is generated automatically with `600` permissions

### User Permissions

| User       | Password   | Permissions                                          | Purpose                   |
| ---------- | ---------- | ---------------------------------------------------- | ------------------------- |
| `root`     | `root`     | root                                                 | Administrator             |
| `service1` | `service1` | readWrite on service1_logs                           | Service1 log read/write   |
| `service2` | `service2` | readWrite on service2_logs                           | Service2 log read/write   |
| `log_cron` | `log_cron` | createCollection, createIndex (service\*\_logs only) | Daily collection creation |

### log_cron User Restrictions

The `log_cron` user has minimal permissions only:

- Can create collections in `service*_logs` databases
- Can create indexes
- Can check ReplicaSet status

- Cannot read/write log data
- Cannot access system databases
- Cannot create/delete users

## Database Structure

### Time-Series Collections

Each service stores logs in one collection per day:

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

### Collection Configuration

```javascript
{
  timeseries: {
    timeField: 'timestamp',      // Time field
    metaField: 'meta',            // Metadata field
    granularity: 'seconds'        // Granularity in seconds
  },
  expireAfterSeconds: 2592000    // TTL: 30 days
}
```

**Notes on TTL strategy: This project considers both approaches for hot/cold data separation.**

- For single collection log ingestion → Use TTL for document lifecycle management
- For daily collection creation (hot/cold separation) → Dropping expired collections may be better than TTL
- Adjust TTL settings according to your storage policy and query patterns.

### Indexes

```javascript
{ 'meta.service': 1, timestamp: -1 }
```

## External Access (Studio 3T, Compass, etc.)

### Connection String

```bash
mongodb://root:root@localhost:37017,localhost:37018,localhost:37019/?replicaSet=rs0&authSource=admin
```

### Studio 3T Configuration

1. **Connection Type**: Standalone (configure each host separately)
2. **Servers**:
   - `localhost:37017`
   - `localhost:37018`
   - `localhost:37019`
3. **Replica Set Name**: `rs0`
4. **Authentication** (default values):
   - Username: `root`
   - Password: `root`
   - Auth DB: `admin`

## Application Integration

### Connection Strings

Each service connects using its own dedicated credentials:

```javascript
// Service1 Application
const MONGO_URI =
  "mongodb://service1:service1@mongo1:27017,mongo2:27017,mongo3:27017/service1_logs?replicaSet=rs0&authSource=admin";

// Service2 Application
const MONGO_URI =
  "mongodb://service2:service2@mongo1:27017,mongo2:27017,mongo3:27017/service2_logs?replicaSet=rs0&authSource=admin";
```

**Important:**

- Each service can only read/write **its own database**
- `authSource=admin` is required (all users are created in admin database)
- Must connect in ReplicaSet mode (`replicaSet=rs0`)

### Node.js Example

#### 1. Installation

```bash
npm install mongodb
```

#### 2. Writing Logs

```javascript
const { MongoClient } = require("mongodb");

// Connection Setting
const MONGO_URI =
  "mongodb://service1:service1@mongo1:27017,mongo2:27017,mongo3:27017/service1_logs?replicaSet=rs0&authSource=admin";
const DB_NAME = "service1_logs";

async function writeLog(logData) {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();

    const db = client.db(DB_NAME);

    // Collection Name with Today's Date String
    const today = new Date().toISOString().split("T")[0];
    const collectionName = `service1_log_${today}`;

    const collection = db.collection(collectionName);

    // Time-Series data format
    const document = {
      timestamp: new Date(), // Required: timeField
      meta: {
        // Required: metaField
        service: "service1",
        level: "info",
        component: "api-server",
      },
      message: logData.message,
      details: logData.details,
    };

    await collection.insertOne(document);
    console.log("Log saved successfully");
  } catch (error) {
    console.error("Log save failed:", error);
  } finally {
    await client.close();
  }
}

// Logging Example
writeLog({
  message: "User login successful",
  details: {
    userId: 12345,
    ip: "192.168.1.100",
  },
});
```

#### 3. Bulk Writing (Recommended)

For better performance, save multiple logs at once:

```javascript
async function writeBulkLogs(logs) {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const today = new Date().toISOString().split("T")[0];
    const collectionName = `service1_log_${today}`;
    const collection = db.collection(collectionName);

    // Prepare multiple logs as array
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
    console.log(`${documents.length} logs saved successfully`);
  } catch (error) {
    console.error("Bulk save failed:", error);
  } finally {
    await client.close();
  }
}
```

#### 4. Querying Logs

```javascript
async function queryLogs(startDate, endDate, level) {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const today = new Date().toISOString().split("T")[0];
    const collectionName = `service1_log_${today}`;
    const collection = db.collection(collectionName);

    // Query
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

// Usage example: Query today's error logs
const errorLogs = await queryLogs(
  new Date().setHours(0, 0, 0, 0),
  new Date(),
  "error",
);
```

### Python Example

#### 1. Installation

```bash
pip install pymongo
```

#### 2. Writing Logs

```python
from pymongo import MongoClient
from datetime import datetime

# Connection
MONGO_URI = "mongodb://service1:service1@mongo1:27017,mongo2:27017,mongo3:27017/service1_logs?replicaSet=rs0&authSource=admin"
client = MongoClient(MONGO_URI)
db = client.service1_logs

def write_log(message, level='info', details=None):
    # Today's collection
    today = datetime.now().strftime('%Y-%m-%d')
    collection_name = f'service1_log_{today}'
    collection = db[collection_name]

    # Time-Series data
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
    print('Log saved successfully')

# Usage example
write_log(
    message='Database connection established',
    level='info',
    details={'db': 'postgres', 'host': 'localhost'}
)
```

### Automatic Collection Creation

**Important:** Application users **cannot create collections**.

New daily collections must be created using one of these methods:

#### Method 1: Manual Creation (Admin)

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

#### Method 2: Cron Job (Automation)

Run a script that creates new collections daily at midnight using the `log_cron` user:

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

        console.log(`✔ ${collectionName} created successfully`);
      } catch (error) {
        if (error.code === 48) {
          console.log(`✔ ${collectionName} already exists`);
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

**Linux Crontab Configuration:**

```bash
# Run daily at 23:50 (10 minutes before midnight)
50 23 * * * cd /path/to/project && node create-daily-collection.js >> /var/log/mongo-collection-creator.log 2>&1
```

### Docker Compose Integration

Add a cron application to Docker Compose:

```yaml
services:
  # ... existing mongo1, mongo2, mongo3 ...

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

### Important Notes

1. **Collections Must Be Created in Advance**

   - Application users cannot create collections
   - Create next day's collections before midnight daily (set 10 minutes early for safety)

2. **Time-Series Required Fields**

   - `timestamp`: Date object (required)
   - `meta`: Object (required, stores metadata)

3. **Error Handling**

   - Missing collections cause errors
   - Try-catch error handling is mandatory

4. **Connection Pool Management**
   - Use connection pools in production
   - Reuse connections instead of connecting/disconnecting repeatedly

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

## Example Code

Runnable example code can be found in the [`examples/`](./examples) directory:

### Available Examples

1. **`nodejs-write-log.js`** - Node.js log writing/querying example

   ```bash
   npm install mongodb
   node examples/nodejs-write-log.js
   ```

2. **`python-write-log.py`** - Python log writing/querying example

   ```bash
   pip install pymongo
   python examples/python-write-log.py
   ```

3. **`create-daily-collection.js`** - Daily collection auto-creation script

   ```bash
   node examples/create-daily-collection.js
   ```

See [examples/README.md](./examples/README.md) for detailed information.

## Adding Services

### Modify Configuration

To add a new service, modify the `SERVICE_LIST` array in `init/init-cluster.js`:

```javascript
// init/init-cluster.js
const SERVICE_LIST = ["service1", "service2", "service3"]; // Add service3 - password is auto-set to service name
```

### Run Initialization

```bash
./init-rs.sh
```

Existing data is preserved, only new services are added:

- `service3_logs` database created
- `service3 / service3` user created (readWrite permissions)
- `service3_log_2025-12-01` collection created

## Resetting the Cluster

To delete all data and start fresh:

```bash
docker-compose down -v
docker-compose up -d
sleep 10
./init-rs.sh
```

## Monitoring

### Check ReplicaSet Status

```bash
docker exec mongo1 mongosh -u root -p root --authenticationDatabase admin --eval "rs.status()"
```

### List Databases

```bash
docker exec mongo1 mongosh -u root -p root --authenticationDatabase admin --eval "db.getMongo().getDBNames()"
```

### Check Collection Sizes

```bash
docker exec mongo1 mongosh -u root -p root --authenticationDatabase admin --eval "
  db.getSiblingDB('service1_logs').getCollectionNames().forEach(function(name) {
    var stats = db.getSiblingDB('service1_logs').getCollection(name).stats();
    print(name + ': ' + (stats.size / 1024 / 1024).toFixed(2) + ' MB');
  });
"
```

## Troubleshooting

### Containers Won't Start

```bash
docker logs mongo1
```

May be a KeyFile permission issue. Check permissions on `keyfile/mongodb-keyfile`.

### ReplicaSet Initialization Failure

```bash
docker exec mongo1 mongosh --eval "rs.status()"
```

Check if already initialized, and perform full reset with `docker-compose down -v` if needed.

### Authentication Errors

All users are created in the `admin` database, so `--authenticationDatabase admin` must be used.

## Use Cases

### 1. Microservice Centralized Logging

Each microservice stores logs in its dedicated database:

```javascript
// API Gateway
writeLog("service1_logs", { endpoint: "/api/users", status: 200 });

// Auth Service
writeLog("service2_logs", { action: "login", user: "john@example.com" });
```

### 2. Multi-tenant Log Storage

Separate databases for each tenant (customer):

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

### 3. Analytics Dashboard

Query logs by time range and level:

```javascript
// Recent 1-hour error logs
const errors = await collection
  .find({
    timestamp: { $gte: new Date(Date.now() - 3600000) },
    "meta.level": "error",
  })
  .toArray();

// Specific user's activity logs
const userLogs = await collection
  .find({
    "meta.userId": 12345,
  })
  .sort({ timestamp: -1 })
  .limit(50)
  .toArray();
```

## Best Practices

### 1. Connection Management

- Use connection pools (avoid connect/disconnect on every operation)
- Verify connections on application startup
- Implement auto-reconnection logic on errors

### 2. Data Modeling

- **Always use UTC** for `timestamp`
- Store indexable information in `meta` field (service names, etc.)
- Store detailed information in separate fields

### 3. Performance Optimization

- Use bulk inserts (insertMany)
- Set Write Concern appropriately (`w: 1` for logs)
- Remove unnecessary indexes

### 4. Operations

- Create next day's collections before midnight daily
- Monitor disk usage (30-day TTL)
- Regularly check ReplicaSet status

## References

- [MongoDB Time Series Collections](https://www.mongodb.com/docs/manual/core/timeseries-collections/)
- [MongoDB ReplicaSet](https://www.mongodb.com/docs/manual/replication/)
- [MongoDB TTL Indexes](https://www.mongodb.com/docs/manual/core/index-ttl/)
- [MongoDB Security](https://www.mongodb.com/docs/manual/security/)
- [Node.js MongoDB Driver](https://www.mongodb.com/docs/drivers/node/current/)
- [Python PyMongo](https://pymongo.readthedocs.io/)
