#!/usr/bin/env python3
"""
Content Schema Generator Module
Generates JSON schemas for content silos based on funnel stage configuration.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any, List


class ContentSchemaGenerator:
    """
    Generates JSON schemas for content silos in the Authority Silo Architect funnel.
    
    Each schema follows JSON Schema Draft 7 standards and includes all required
    fields for the specific funnel stage.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the schema generator with configuration.
        
        Args:
            config: Hermes configuration dictionary
        """
        self.config = config
        self.schema_standards = config.get('schema_standards', {})
        self.funnel_stages = config.get('funnel', {}).get('stages', [])
    
    def generate_schema(self, stage: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate a JSON schema for a specific funnel stage.
        
        Args:
            stage: Funnel stage configuration dictionary
            
        Returns:
            Generated JSON schema dictionary
        """
        schema = {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "$id": f"https://digitallydefined.online/schemas/{stage['name'].lower().replace(' ', '_')}.json",
            "title": f"{stage['name']} Content Schema",
            "description": f"JSON Schema for {stage['description']}",
            "type": "object",
            "properties": {},
            "required": self.schema_standards.get('required_fields', []),
            "additionalProperties": True
        }
        
        # Add stage-specific properties
        schema['properties'] = self._get_stage_properties(stage)
        
        # Add metadata
        schema['metadata'] = {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "generator": "Hermes ContentSchemaGenerator",
            "version": "1.0.0",
            "funnel_stage": stage['name'],
            "funnel_order": stage['order']
        }
        
        return schema
    
    def _get_stage_properties(self, stage: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get properties specific to the funnel stage.
        
        Args:
            stage: Funnel stage configuration
            
        Returns:
            Dictionary of schema properties
        """
        base_properties = {
            "title": {
                "type": "string",
                "description": "Title of the content silo",
                "minLength": 1,
                "maxLength": 200
            },
            "description": {
                "type": "string",
                "description": "Detailed description of the content",
                "minLength": 1
            },
            "content_type": {
                "type": "string",
                "description": "Type of content (e.g., ebook, course, template)",
                "enum": self._get_content_types_for_stage(stage['name'])
            },
            "target_audience": {
                "type": "string",
                "description": "Target audience for this content",
                "minLength": 1
            },
            "value_proposition": {
                "type": "string",
                "description": "Core value proposition",
                "minLength": 1
            }
        }
        
        # Add stage-specific properties
        stage_specific = self._get_stage_specific_properties(stage['name'])
        base_properties.update(stage_specific)
        
        return base_properties
    
    def _get_content_types_for_stage(self, stage_name: str) -> List[str]:
        """
        Get valid content types for a specific funnel stage.
        
        Args:
            stage_name: Name of the funnel stage
            
        Returns:
            List of valid content types
        """
        content_types = {
            "Lead Magnet": [
                "ebook",
                "checklist",
                "template",
                "guide",
                "cheat_sheet",
                "webinar",
                "video_series"
            ],
            "Core Offer": [
                "course",
                "ebook",
                "video_course",
                "workshop",
                "masterclass"
            ],
            "Authority Bundle": [
                "bundle",
                "complete_package",
                "premium_course",
                "certification_program"
            ],
            "Community": [
                "membership",
                "community_access",
                "mastermind",
                "group_coaching"
            ],
            "Recurring Revenue": [
                "subscription",
                "membership",
                "saas",
                "monthly_plan"
            ]
        }
        
        return content_types.get(stage_name, ["generic"])
    
    def _get_stage_specific_properties(self, stage_name: str) -> Dict[str, Any]:
        """
        Get properties specific to each funnel stage.
        
        Args:
            stage_name: Name of the funnel stage
            
        Returns:
            Dictionary of stage-specific properties
        """
        stage_properties = {
            "Lead Magnet": {
                "lead_capture_form": {
                    "type": "object",
                    "properties": {
                        "enabled": {"type": "boolean"},
                        "fields": {
                            "type": "array",
                            "items": {"type": "string"}
                        }
                    }
                },
                "delivery_method": {
                    "type": "string",
                    "enum": ["email", "download", "instant_access"]
                },
                "price": {
                    "type": "number",
                    "description": "Price in dollars (0 for free)",
                    "minimum": 0
                }
            },
            "Core Offer": {
                "price": {
                    "type": "number",
                    "description": "Price in dollars",
                    "minimum": 0
                },
                "currency": {
                    "type": "string",
                    "default": "USD"
                },
                "modules": {
                    "type": "integer",
                    "description": "Number of modules/lessons",
                    "minimum": 1
                },
                "duration_minutes": {
                    "type": "integer",
                    "description": "Total content duration in minutes"
                },
                "certificate": {
                    "type": "boolean",
                    "description": "Includes completion certificate"
                }
            },
            "Authority Bundle": {
                "price": {
                    "type": "number",
                    "minimum": 0
                },
                "includes": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of included products"
                },
                "bonuses": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of bonus items"
                },
                "total_value": {
                    "type": "number",
                    "description": "Total value if purchased separately"
                }
            },
            "Community": {
                "price": {
                    "type": "number",
                    "minimum": 0
                },
                "billing_cycle": {
                    "type": "string",
                    "enum": ["monthly", "quarterly", "annual", "lifetime"]
                },
                "features": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of community features"
                },
                "member_count": {
                    "type": "integer",
                    "description": "Current number of members"
                }
            },
            "Recurring Revenue": {
                "price": {
                    "type": "number",
                    "minimum": 0
                },
                "billing_cycle": {
                    "type": "string",
                    "enum": ["monthly", "quarterly", "annual"]
                },
                "trial_days": {
                    "type": "integer",
                    "description": "Free trial period in days",
                    "minimum": 0
                },
                "features": {
                    "type": "array",
                    "items": {"type": "string"}
                },
                "cancellation_policy": {
                    "type": "string",
                    "enum": ["anytime", "annual_commitment"]
                }
            }
        }
        
        return stage_properties.get(stage_name, {})
    
    def generate_all_schemas(self) -> List[Dict[str, Any]]:
        """
        Generate schemas for all funnel stages.
        
        Returns:
            List of generated schemas
        """
        schemas = []
        for stage in self.funnel_stages:
            schema = self.generate_schema(stage)
            schemas.append(schema)
        return schemas
    
    def save_schema(self, schema: Dict[str, Any], output_path: str):
        """
        Save schema to a JSON file.
        
        Args:
            schema: Schema dictionary to save
            output_path: Path to save the schema
        """
        with open(output_path, 'w') as f:
            json.dump(schema, f, indent=2)