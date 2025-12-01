"""
Python 로그 쓰기 예제

사용법:
    pip install pymongo
    python examples/python-write-log.py
"""

from pymongo import MongoClient
from datetime import datetime, timedelta
import socket
import os

# 설정 (로컬 예시)
MONGO_URI = "mongodb://service1:service1@localhost:37017,localhost:37018,localhost:37019/service1_logs?replicaSet=rs0&authSource=admin"
DB_NAME = "service1_logs"
SERVICE_NAME = "service1"

# 전역 클라이언트 (연결 재사용)
client = None

def get_client():
    """MongoDB 클라이언트 가져오기 (연결 재사용)"""
    global client
    if client is None:
        client = MongoClient(MONGO_URI)
    return client

def write_log(level, message, details=None):
    """
    단일 로그 쓰기
    
    Args:
        level (str): 로그 레벨 (info, warn, error, debug)
        message (str): 로그 메시지
        details (dict, optional): 추가 세부 정보
    
    Returns:
        str: 생성된 로그의 ID
    """
    client = get_client()
    db = client[DB_NAME]
    
    # 오늘 날짜의 컬렉션
    today = datetime.now().strftime('%Y-%m-%d')
    collection_name = f'{SERVICE_NAME}_log_{today}'
    collection = db[collection_name]
    
    # Time-Series 데이터 형식
    document = {
        'timestamp': datetime.utcnow(),
        'meta': {
            'service': SERVICE_NAME,
            'level': level,
            'hostname': socket.gethostname(),
            'pid': os.getpid()
        },
        'message': message,
        'details': details or {}
    }
    
    try:
        result = collection.insert_one(document)
        print(f'✔ 로그 저장 성공: {result.inserted_id}')
        return result.inserted_id
    except Exception as e:
        print(f'❌ 로그 저장 실패: {e}')
        raise

def write_bulk_logs(logs):
    """
    벌크 로그 쓰기 (성능 최적화)
    
    Args:
        logs (list): 로그 딕셔너리 리스트
            [{'level': 'info', 'message': '...', 'details': {...}}, ...]
    
    Returns:
        list: 생성된 로그 ID 리스트
    """
    client = get_client()
    db = client[DB_NAME]
    
    today = datetime.now().strftime('%Y-%m-%d')
    collection_name = f'{SERVICE_NAME}_log_{today}'
    collection = db[collection_name]
    
    # 여러 로그를 배열로 준비
    documents = []
    for log in logs:
        timestamp = log.get('timestamp')
        if timestamp is None:
            timestamp = datetime.utcnow()
        elif isinstance(timestamp, (int, float)):
            timestamp = datetime.fromtimestamp(timestamp)
        
        documents.append({
            'timestamp': timestamp,
            'meta': {
                'service': SERVICE_NAME,
                'level': log.get('level', 'info'),
                'hostname': socket.gethostname(),
                'pid': os.getpid()
            },
            'message': log.get('message', ''),
            'details': log.get('details', {})
        })
    
    try:
        result = collection.insert_many(documents)
        print(f'✔ {len(result.inserted_ids)}개 로그 저장 완료')
        return result.inserted_ids
    except Exception as e:
        print(f'❌ 벌크 저장 실패: {e}')
        raise

def query_logs(start_date, end_date, level=None, limit=100):
    """
    로그 조회
    
    Args:
        start_date (datetime): 시작 시간
        end_date (datetime): 종료 시간
        level (str, optional): 로그 레벨 필터
        limit (int): 최대 결과 수
    
    Returns:
        list: 로그 문서 리스트
    """
    client = get_client()
    db = client[DB_NAME]
    
    today = datetime.now().strftime('%Y-%m-%d')
    collection_name = f'{SERVICE_NAME}_log_{today}'
    collection = db[collection_name]
    
    # 쿼리 구성
    query = {
        'timestamp': {
            '$gte': start_date,
            '$lte': end_date
        }
    }
    
    if level:
        query['meta.level'] = level
    
    try:
        logs = list(
            collection.find(query)
            .sort('timestamp', -1)
            .limit(limit)
        )
        print(f'✔ {len(logs)}개 로그 조회 완료')
        return logs
    except Exception as e:
        print(f'❌ 로그 조회 실패: {e}')
        raise

def main():
    """실행 예제"""
    print('=== MongoDB 로그 쓰기 예제 ===\n')
    
    try:
        # 1. 단일 로그 쓰기
        print('1️⃣ 단일 로그 쓰기:')
        write_log('info', 'Application started', {
            'version': '1.0.0',
            'port': 8000
        })
        
        write_log('error', 'Database connection failed', {
            'error': 'ConnectionRefusedError',
            'host': 'localhost:5432'
        })
        
        print()
        
        # 2. 벌크 로그 쓰기
        print('2️⃣ 벌크 로그 쓰기:')
        write_bulk_logs([
            {
                'level': 'info',
                'message': 'User login successful',
                'details': {'user_id': 12345, 'ip': '192.168.1.100'}
            },
            {
                'level': 'info',
                'message': 'API request processed',
                'details': {'endpoint': '/api/users', 'method': 'GET', 'duration_ms': 45}
            },
            {
                'level': 'warn',
                'message': 'Rate limit approaching',
                'details': {'limit': 1000, 'current': 950}
            }
        ])
        
        print()
        
        # 3. 로그 조회
        print('3️⃣ 로그 조회 (최근 1시간):')
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        now = datetime.utcnow()
        recent_logs = query_logs(one_hour_ago, now)
        
        print('\n최근 로그:')
        for log in recent_logs[:5]:
            timestamp = log['timestamp'].isoformat()
            level = log['meta']['level']
            message = log['message']
            print(f'  [{level}] {timestamp} - {message}')
        
        print('\n=== 완료 ===')
        
    except Exception as e:
        print(f'\n실행 중 오류: {e}')
        exit(1)
    finally:
        if client:
            client.close()

if __name__ == '__main__':
    main()

