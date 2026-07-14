from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from pytrends.request import TrendReq

app = FastAPI(title="DigitallyDefined Trends API")

pytrend = TrendReq(hl="en-US", tz=360)

@app.get("/trends")
def get_trends(
    keyword: str = Query(...),
    geo: str = Query("US"),
    timeframe: str = Query("today 5-y")
):
    try:
        # Build payload
        pytrend.build_payload([keyword], geo=geo, timeframe=timeframe)

        # Interest over time
        interest_over_time = pytrend.interest_over_time()
        interest_over_time_json = interest_over_time.to_dict() if interest_over_time is not None else {}

        # Interest by region
        interest_by_region = pytrend.interest_by_region()
        interest_by_region_json = interest_by_region.to_dict() if interest_by_region is not None else {}

        # Related queries (safe)
        rq = pytrend.related_queries()
        try:
            related_queries = rq[keyword]["top"].to_dict("records")
        except Exception:
            related_queries = []

        # Related topics (safe)
        rt = pytrend.related_topics()
        try:
            related_topics = rt[keyword]["top"].to_dict("records")
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
