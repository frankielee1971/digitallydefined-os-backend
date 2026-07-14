from .utils import fetch_trends, save_trend


class ProductGeneratorAgent:
    """Product Generator Agent with trend-awareness."""
    
    def __init__(self):
        pass
    
    def generate_product(self, keyword: str, **kwargs):
        """Generate product with trend data for the given keyword."""
        # Fetch trend data
        trends_data = fetch_trends(keyword)
        
        # Store trend data automatically
        storage_result = save_trend(trends_data)
        
        # Use trend data in reasoning
        trend_insights = self._analyze_trends(trends_data)
        
        # Generate the product with trend insights included
        product = self._create_base_product(keyword, **kwargs)
        product["trend_insights"] = trend_insights
        product["trend_storage_status"] = storage_result
        
        return product
    
    def _analyze_trends(self, trends_data):
        """Analyze trend data and extract insights for product generation."""
        if isinstance(trends_data, dict) and "error" in trends_data:
            return {"error": trends_data["error"]}
        
        insights = {
            "search_volume_trend": "stable",
            "peak_periods": [],
            "regional_interest": [],
            "related_keywords": []
        }
        
        if isinstance(trends_data, dict):
            # Analyze interest over time for trend direction
            interest_over_time = trends_data.get("interest_over_time", [])
            if interest_over_time:
                insights["search_volume_trend"] = self._determine_trend_direction(interest_over_time)
                insights["peak_periods"] = self._find_peak_periods(interest_over_time)
            
            # Extract regional interest
            interest_by_region = trends_data.get("interest_by_region", [])
            if interest_by_region:
                insights["regional_interest"] = interest_by_region[:5]  # Top 5 regions
            
            # Extract related queries
            related_queries = trends_data.get("related_queries", {})
            if related_queries and isinstance(related_queries, dict):
                top_queries = related_queries.get("top", [])
                if isinstance(top_queries, list):
                    insights["related_keywords"] = [q.get("query", "") for q in top_queries[:5]]
        
        return insights
    
    def _determine_trend_direction(self, interest_data):
        """Determine if search volume is increasing, decreasing, or stable."""
        if not interest_data or len(interest_data) < 2:
            return "stable"
        
        values = [point.get("value", 0) for point in interest_data]
        if len(values) >= 2:
            start_val = values[0]
            end_val = values[-1]
            if end_val > start_val * 1.2:  # 20% increase
                return "increasing"
            elif end_val < start_val * 0.8:  # 20% decrease
                return "decreasing"
        return "stable"
    
    def _find_peak_periods(self, interest_data):
        """Find periods with highest search interest."""
        if not interest_data:
            return []
        
        # Find top 3 peaks
        sorted_data = sorted(interest_data, key=lambda x: x.get("value", 0), reverse=True)
        return sorted_data[:3]
    
    def _create_base_product(self, keyword: str, **kwargs):
        """Create the base product structure."""
        return {
            "keyword": keyword,
            "product_type": "digital",
            "status": "concept",
            "features": [],
            "market_fit": "high",
            **kwargs
        }