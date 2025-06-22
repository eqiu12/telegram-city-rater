#!/usr/bin/env python3
import json
import uuid

# Загружаем данные
with open('cities.json', 'r', encoding='utf-8') as f:
    cities = json.load(f)

# Добавляем уникальные ID к каждому городу
for city in cities:
    # Генерируем короткий уникальный ID на основе названия города
    # Это обеспечит стабильность ID при перезапуске скрипта
    city_name = city['name'].lower().replace(' ', '_').replace('-', '_')
    city_id = f"city_{city_name}_{hash(city['name']) % 10000:04d}"
    city['cityId'] = city_id

print(f"Добавлено {len(cities)} cityId")

# Сохраняем обновленные данные
with open('cities.json', 'w', encoding='utf-8') as f:
    json.dump(cities, f, ensure_ascii=False, indent=2)

print("Файл cities.json обновлен с cityId!")

# Показываем несколько примеров
print("\nПримеры cityId:")
for i, city in enumerate(cities[:5]):
    print(f"{city['name']}: {city['cityId']}") 