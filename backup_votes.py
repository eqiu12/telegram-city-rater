#!/usr/bin/env python3
"""
Скрипт для резервного копирования голосов перед деплоем на Render
"""

import json
import os
from datetime import datetime
import shutil

def backup_votes():
    """Создает резервную копию файлов голосов"""
    
    # Создаем папку для бэкапов если её нет
    backup_dir = "vote_backups"
    if not os.path.exists(backup_dir):
        os.makedirs(backup_dir)
    
    # Создаем имя файла с текущей датой и временем
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Файлы для бэкапа
    files_to_backup = [
        ("backend/votes.json", f"{backup_dir}/votes_{timestamp}.json"),
        ("backend/user_votes.json", f"{backup_dir}/user_votes_{timestamp}.json")
    ]
    
    print("🔄 Создание резервной копии голосов...")
    
    for source, destination in files_to_backup:
        if os.path.exists(source):
            try:
                shutil.copy2(source, destination)
                print(f"✅ Скопирован: {source} -> {destination}")
                
                # Показываем статистику
                with open(source, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if source.endswith('votes.json'):
                        print(f"   📊 Городов с голосами: {len(data)}")
                    else:
                        print(f"   👥 Пользователей с голосами: {len(data)}")
                        
            except Exception as e:
                print(f"❌ Ошибка при копировании {source}: {e}")
        else:
            print(f"⚠️  Файл не найден: {source}")
    
    print(f"\n📁 Резервные копии сохранены в папке: {backup_dir}")
    print("💡 Теперь можно безопасно деплоить на Render!")

def restore_votes():
    """Восстанавливает последнюю резервную копию"""
    
    backup_dir = "vote_backups"
    if not os.path.exists(backup_dir):
        print("❌ Папка с резервными копиями не найдена")
        return
    
    # Находим последние файлы бэкапа
    votes_files = [f for f in os.listdir(backup_dir) if f.startswith('votes_')]
    user_votes_files = [f for f in os.listdir(backup_dir) if f.startswith('user_votes_')]
    
    if not votes_files or not user_votes_files:
        print("❌ Резервные копии не найдены")
        return
    
    # Берем самые новые файлы
    latest_votes = sorted(votes_files)[-1]
    latest_user_votes = sorted(user_votes_files)[-1]
    
    print("🔄 Восстановление резервной копии...")
    
    try:
        shutil.copy2(f"{backup_dir}/{latest_votes}", "backend/votes.json")
        shutil.copy2(f"{backup_dir}/{latest_user_votes}", "backend/user_votes.json")
        print(f"✅ Восстановлен: {latest_votes}")
        print(f"✅ Восстановлен: {latest_user_votes}")
    except Exception as e:
        print(f"❌ Ошибка при восстановлении: {e}")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "restore":
        restore_votes()
    else:
        backup_votes() 