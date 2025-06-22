#!/usr/bin/env python3
"""
Скрипт для миграции данных из JSON файлов в SQLite базу данных
"""

import json
import sqlite3
import os
from datetime import datetime

def migrate_to_sqlite():
    """Мигрирует данные из votes.json и user_votes.json в SQLite базу данных"""
    
    print("🔄 Начинаем миграцию данных в SQLite...")
    
    # Проверяем существование файлов
    votes_file = "backend/votes.json"
    user_votes_file = "backend/user_votes.json"
    
    if not os.path.exists(votes_file):
        print("❌ Файл votes.json не найден")
        return
    
    if not os.path.exists(user_votes_file):
        print("❌ Файл user_votes.json не найден")
        return
    
    # Подключаемся к базе данных
    db_path = "backend/votes.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Создаем таблицы если их нет
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS city_votes (
                city_id TEXT PRIMARY KEY,
                likes INTEGER DEFAULT 0,
                dislikes INTEGER DEFAULT 0,
                dont_know INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                city_id TEXT NOT NULL,
                vote_type TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, city_id)
            )
        ''')
        
        # Создаем индексы
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_votes_user_id ON user_votes(user_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_votes_city_id ON user_votes(city_id)')
        
        # Загружаем данные из JSON файлов
        print("📖 Загружаем данные из JSON файлов...")
        
        with open(votes_file, 'r', encoding='utf-8') as f:
            votes_data = json.load(f)
        
        with open(user_votes_file, 'r', encoding='utf-8') as f:
            user_votes_data = json.load(f)
        
        print(f"📊 Найдено городов с голосами: {len(votes_data)}")
        print(f"👥 Найдено пользователей с голосами: {len(user_votes_data)}")
        
        # Мигрируем голоса городов
        print("🔄 Мигрируем голоса городов...")
        cities_migrated = 0
        
        for city_id, votes in votes_data.items():
            cursor.execute('''
                INSERT OR REPLACE INTO city_votes (city_id, likes, dislikes, dont_know)
                VALUES (?, ?, ?, ?)
            ''', (city_id, votes.get('likes', 0), votes.get('dislikes', 0), votes.get('dont_know', 0)))
            cities_migrated += 1
        
        print(f"✅ Мигрировано городов: {cities_migrated}")
        
        # Мигрируем голоса пользователей
        print("🔄 Мигрируем голоса пользователей...")
        user_votes_migrated = 0
        
        # В user_votes.json хранятся только ID городов, тип голоса нужно определить из votes.json
        for user_id, voted_cities in user_votes_data.items():
            for city_id in voted_cities:
                # Определяем тип голоса на основе данных в votes.json
                if city_id in votes_data:
                    city_votes = votes_data[city_id]
                    # Определяем тип голоса (упрощенная логика)
                    # В реальности нужно хранить тип голоса для каждого пользователя
                    # Пока что устанавливаем как 'like' по умолчанию
                    vote_type = 'like'  # По умолчанию
                    
                    cursor.execute('''
                        INSERT OR REPLACE INTO user_votes (user_id, city_id, vote_type)
                        VALUES (?, ?, ?)
                    ''', (user_id, city_id, vote_type))
                    user_votes_migrated += 1
        
        print(f"✅ Мигрировано голосов пользователей: {user_votes_migrated}")
        print("⚠️  Примечание: Тип голоса установлен как 'like' по умолчанию")
        
        # Сохраняем изменения
        conn.commit()
        
        # Проверяем результат
        cursor.execute('SELECT COUNT(*) FROM city_votes')
        cities_count = cursor.fetchone()[0]
        
        cursor.execute('SELECT COUNT(*) FROM user_votes')
        user_votes_count = cursor.fetchone()[0]
        
        cursor.execute('SELECT COUNT(DISTINCT user_id) FROM user_votes')
        users_count = cursor.fetchone()[0]
        
        print("\n📊 Результат миграции:")
        print(f"   🏙️  Городов в базе: {cities_count}")
        print(f"   👥 Пользователей в базе: {users_count}")
        print(f"   🗳️  Голосов пользователей: {user_votes_count}")
        
        print(f"\n✅ Миграция завершена успешно!")
        print(f"📁 База данных: {db_path}")
        print("💡 Теперь можно использовать server_with_db.js")
        
    except Exception as e:
        print(f"❌ Ошибка при миграции: {e}")
        conn.rollback()
    finally:
        conn.close()

def backup_json_files():
    """Создает резервные копии JSON файлов перед миграцией"""
    
    print("🔄 Создание резервных копий JSON файлов...")
    
    backup_dir = "json_backups"
    if not os.path.exists(backup_dir):
        os.makedirs(backup_dir)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    files_to_backup = [
        ("backend/votes.json", f"{backup_dir}/votes_{timestamp}.json"),
        ("backend/user_votes.json", f"{backup_dir}/user_votes_{timestamp}.json")
    ]
    
    for source, destination in files_to_backup:
        if os.path.exists(source):
            import shutil
            shutil.copy2(source, destination)
            print(f"✅ Резервная копия: {source} -> {destination}")
        else:
            print(f"⚠️  Файл не найден: {source}")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "backup":
        backup_json_files()
    else:
        # Сначала создаем резервные копии
        backup_json_files()
        print()
        # Затем мигрируем
        migrate_to_sqlite() 