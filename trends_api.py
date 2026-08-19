from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from pytrends.request import TrendReq
import time

app = FastAPI(title="DigitallyDefined Trends API")

# Stable TrendReq with retries + user agent
pytrend = TrendReq(
    hl="en-US",
    tz=360,
    retries=3,
    backoff_factor=0.1,
    requests_args={'headers': {'User-Agent': 'Mozilla/5.0'}}
)

@app.get("/trends")
def get_trends(
    keyword: str = Query(...),
    geo: str = Query("US"),
    timeframe: str = Query("today 5-y")
):
    try:
        # Retry logic for Google Trends rate limits
        for _ in range(3):
            try:
                pytrend.build_payload([keyword], geo=geo, timeframe=timeframe)
                break
            except Exception:
                time.sleep(2)

        # Interest over time
        try:
            interest_over_time = pytrend.interest_over_time()
            interest_over_time_json = interest_over_time.to_dict() if interest_over_time is not None else {}
        except Exception:
            interest_over_time_json = {}

        # Interest by region
        try:
            interest_by_region = pytrend.interest_by_region()
            interest_by_region_json = interest_by_region.to_dict() if interest_by_region is not None else {}
        except Exception:
            interest_by_region_json = {}

        # Related queries (safe)
        try:
            rq = pytrend.related_queries()
            related_queries = rq.get(keyword, {}).get("top", [])
            if hasattr(related_queries, "to_dict"):
                related_queries = related_queries.to_dict("records")
        except Exception:
            related_queries = []

        # Related topics (safe)
        try:
            rt = pytrend.related_topics()
            related_topics = rt.get(keyword, {}).get("top", [])
            if hasattr(related_topics, "to_dict"):
                related_topics = related_topics.to_dict("records")
        except Exception:
            related_topics = []

        # Final JSON response
        return JSONResponse({
            "keyword": keyword,
            "geo": geo,
            "timeframe": timeframe,
            "interest_over_time": interest_over_time_json,
            "interest_by_region": interest_by_region_json,
            "related_queries": related_queries,
            "related_topics": related_topics
        })

    except Exception as e:
        return JSONResponse(
            {"error": str(e)},
            status_code=500
        )
