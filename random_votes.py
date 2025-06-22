import json
import random
import requests
import time

API_URL = 'http://localhost:3000/api/vote'
CITIES_FILE = 'cities.json'

# Вероятности для каждого типа голоса (можно менять)
LIKE_PROB = 0.4
DISLIKE_PROB = 0.3
DONT_KNOW_PROB = 0.3

with open(CITIES_FILE, encoding='utf-8') as f:
    cities = json.load(f)

all_votes = ['liked'] * int(LIKE_PROB * 100) + ['disliked'] * int(DISLIKE_PROB * 100) + ['dont_know'] * int(DONT_KNOW_PROB * 100)

for city in cities:
    city_id = city.get('cityId')
    if not city_id:
        continue
    votes = random.choices(['liked', 'disliked', 'dont_know'], [LIKE_PROB, DISLIKE_PROB, DONT_KNOW_PROB], k=100)
    for vote in votes:
        try:
            resp = requests.post(API_URL, json={'cityId': city_id, 'voteType': vote})
            if resp.status_code != 200:
                print(f'Error voting for {city.get("name")}: {resp.text}')
        except Exception as e:
            print(f'Exception for {city.get("name")}: {e}')
        time.sleep(0.01)  # чтобы не заспамить сервер
    print(f'Город {city.get("name")} — 100 голосов отправлено')

print('Готово! Все города получили по 100 случайных голосов.') 