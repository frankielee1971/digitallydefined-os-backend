import os
import requests
import json
from datetime import datetime


def store_trend(data: dict):
    """Store trend data in Supabase trends table."""
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    
    if not supabase_url or not supabase_key:
        return {"error": "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables not set"}
    
    # Prepare the data for insertion
    trend_record = {
        "data": data,
        "created_at": datetime.utcnow().isoformat()
    }
    
    # Supabase REST API endpoint for trends table
    url = f"{supabase_url}/rest/v1/trends"
    
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    
    try:
        response = requests.post(url, headers=headers, data=json.dumps(trend_record))
        
        if response.status_code == 201:
            return response.json()
        else:
            return {"error": f"Supabase insert error: {response.text}"}
    except Exception as e:
        return {"error": f"Failed to store trend data: {str(e)}"}