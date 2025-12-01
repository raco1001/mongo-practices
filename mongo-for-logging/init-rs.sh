#!/bin/bash
set -e

echo "======================================"
echo "MongoDB ReplicaSet 초기화"
echo "======================================
"

# MongoDB 컨테이너가 준비될 때까지 대기
echo "MongoDB 컨테이너 준비 대기..."
sleep 5

# mongo1 컨테이너 내부에서 초기화 스크립트 실행
echo "초기화 스크립트 실행 중..."
docker exec -i mongo1 mongosh < init/init-cluster.js

echo ""
echo "======================================"
echo "✔ 모든 초기화 완료!"
echo "======================================"
