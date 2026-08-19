import requests

def get_trends(keyword: str, geo: str = "US", timeframe: str = "today 5-y"):
    url = f"http://localhost:8000/trends?keyword={keyword}&geo={geo}&timeframe={timeframe}"
    response = requests.get(url)

    if response.status_code != 200:
        return {"error": f"Trends API error: {response.text}"}

    return response.json()
