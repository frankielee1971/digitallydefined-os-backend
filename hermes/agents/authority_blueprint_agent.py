from .utils import fetch_trends, save_trend


class AuthorityBlueprintAgent:
    """Authority Blueprint Agent with trend-awareness."""
    
    def __init__(self):
        pass
    
    def generate_blueprint(self, keyword: str, **kwargs):
        """Generate authority blueprint with trend data for the given keyword."""
        # Fetch trend data
        trends_data = fetch_trends(keyword)
        
        # Store trend data automatically
        storage_result = save_trend(trends_data)
        
        # Use trend data in reasoning
        trend_insights = self._analyze_trends(trends_data)
        
        # Generate the blueprint with trend insights included
        blueprint = self._create_base_blueprint(keyword, **kwargs)
        blueprint["trend_insights"] = trend_insights
        blueprint["trend_storage_status"] = storage_result
        
        return blueprint
    
    def _analyze_trends(self, trends_data):
        """Analyze trend data and extract insights."""
        if isinstance(trends_data, dict) and "error" in trends_data:
            return {"error": trends_data["error"]}
        
        insights = {
            "interest_over_time": [],
            "interest_by_region": [],
            "related_queries": [],
            "related_topics": []
        }
        
        if isinstance(trends_data, dict):
            insights["interest_over_time"] = trends_data.get("interest_over_time", [])
            insights["interest_by_region"] = trends_data.get("interest_by_region", [])
            insights["related_queries"] = trends_data.get("related_queries", {})
            insights["related_topics"] = trends_data.get("related_topics", {})
        
        return insights
    
    def _create_base_blueprint(self, keyword: str, **kwargs):
        """Create the base authority blueprint structure."""
        return {
            "keyword": keyword,
            "blueprint_type": "authority",
            "components": [
                {"type": "lead_magnet", "status": "planned"},
                {"type": "core_offer", "status": "planned"},
                {"type": "authority_bundle", "status": "planned"},
                {"type": "community", "status": "planned"},
                {"type": "recurring_revenue", "status": "planned"}
            ],
            **kwargs
        }