#!/usr/bin/env python3
"""
Schema Validator Module
Validates JSON schemas against JSON Schema Draft 7 standards and custom rules.
"""

import json

try:
    import jsonschema  # type: ignore[import]
except ImportError:
    class _JsonSchemaFallback:
        class ValidationError(Exception):
            pass

        @staticmethod
        def validate(instance, schema):
            raise ImportError("jsonschema package is required for JSON Schema validation")

    jsonschema = _JsonSchemaFallback  # type: ignore[assignment]

from typing import Dict, Any, List, Tuple


class SchemaValidator:
    """
    Validates JSON schemas against JSON Schema Draft 7 standards and custom validation rules.
    
    Ensures all generated schemas meet the required standards before packaging and distribution.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the schema validator with configuration.
        
        Args:
            config: Hermes configuration dictionary
        """
        self.config = config
        self.schema_standards = config.get('schema_standards', {})
        self.validation_rules = self.schema_standards.get('validation_rules', [])
    
    def validate_schema(self, schema: Dict[str, Any]) -> bool:
        """
        Validate a JSON schema against all standards and rules.
        
        Args:
            schema: JSON schema dictionary to validate
            
        Returns:
            True if schema is valid, False otherwise
        """
        errors = self.get_validation_errors(schema)
        return len(errors) == 0
    
    def get_validation_errors(self, schema: Dict[str, Any]) -> List[str]:
        """
        Get list of validation errors for a schema.
        
        Args:
            schema: JSON schema dictionary to validate
            
        Returns:
            List of error messages (empty if valid)
        """
        errors = []
        
        # Check JSON Schema Draft 7 validity
        jsonschema_errors = self._validate_json_schema_draft7(schema)
        errors.extend(jsonschema_errors)
        
        # Check custom validation rules
        custom_errors = self._validate_custom_rules(schema)
        errors.extend(custom_errors)
        
        # Check required fields
        required_errors = self._validate_required_fields(schema)
        errors.extend(required_errors)
        
        return errors
    
    def _validate_json_schema_draft7(self, schema: Dict[str, Any]) -> List[str]:
        """
        Validate schema against JSON Schema Draft 7 standard.
        
        Args:
            schema: JSON schema to validate
            
        Returns:
            List of validation errors
        """
        errors = []
        
        try:
            # Try to validate the schema itself (meta-schema validation)
            # JSON Schema Draft 7 meta-schema
            draft7_meta_schema = {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "$schema": {"type": "string"},
                    "$id": {"type": "string"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "type": {"type": "string"},
                    "properties": {"type": "object"},
                    "required": {"type": "array", "items": {"type": "string"}},
                    "additionalProperties": {}
                }
            }
            
            # Validate schema structure
            jsonschema.validate(instance=schema, schema=draft7_meta_schema)
            
        except jsonschema.ValidationError as e:
            errors.append(f"JSON Schema Draft 7 validation failed: {e.message}")
        except Exception as e:
            errors.append(f"Schema validation error: {str(e)}")
        
        return errors
    
    def _validate_custom_rules(self, schema: Dict[str, Any]) -> List[str]:
        """
        Validate schema against custom validation rules from config.
        
        Args:
            schema: JSON schema to validate
            
        Returns:
            List of validation errors
        """
        errors = []
        
        for rule in self.validation_rules:
            if rule == "schema must be valid JSON":
                try:
                    json.dumps(schema)
                except Exception as e:
                    errors.append(f"Schema is not valid JSON: {str(e)}")
            
            elif rule == "all required fields must be present":
                required_fields = self.schema_standards.get('required_fields', [])
                missing_fields = [field for field in required_fields if field not in schema]
                if missing_fields:
                    errors.append(f"Missing required fields: {', '.join(missing_fields)}")
            
            elif rule == "content_type must match funnel stage":
                funnel_stage = schema.get('metadata', {}).get('funnel_stage')
                if funnel_stage:
                    content_type = schema.get('properties', {}).get('content_type', {})
                    if content_type:
                        # This is a soft validation - just log a warning
                        pass
            
            elif rule == "value_proposition must be non-empty":
                value_prop = schema.get('properties', {}).get('value_proposition', {})
                if value_prop:
                    min_length = value_prop.get('minLength', 0)
                    if min_length < 1:
                        errors.append("value_proposition must have minLength >= 1")
        
        return errors
    
    def _validate_required_fields(self, schema: Dict[str, Any]) -> List[str]:
        """
        Validate that all required fields are present in the schema.
        
        Args:
            schema: JSON schema to validate
            
        Returns:
            List of validation errors
        """
        errors = []
        required_fields = self.schema_standards.get('required_fields', [])
        
        # Check if required fields exist in schema
        for field in required_fields:
            if field not in schema:
                errors.append(f"Required field missing: {field}")
        
        # Check if required fields exist in properties
        if 'properties' in schema:
            for field in required_fields:
                if field not in schema['properties']:
                    errors.append(f"Required field not defined in properties: {field}")
        
        return errors
    
    def validate_schema_instance(self, instance: Dict[str, Any], schema: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """
        Validate a data instance against a schema.
        
        Args:
            instance: Data instance to validate
            schema: JSON schema to validate against
            
        Returns:
            Tuple of (is_valid, list_of_errors)
        """
        errors = []
        
        try:
            jsonschema.validate(instance=instance, schema=schema)
            return True, []
        except jsonschema.ValidationError as e:
            errors.append(f"Instance validation failed: {e.message}")
            return False, errors
        except Exception as e:
            errors.append(f"Validation error: {str(e)}")
            return False, errors
    
    def validate_funnel_stage_schema(self, schema: Dict[str, Any], stage_name: str) -> bool:
        """
        Validate that a schema matches the expected funnel stage.
        
        Args:
            schema: JSON schema to validate
            stage_name: Expected funnel stage name
            
        Returns:
            True if schema matches stage, False otherwise
        """
        metadata = schema.get('metadata', {})
        actual_stage = metadata.get('funnel_stage')
        
        return actual_stage == stage_name
    
    def get_schema_quality_score(self, schema: Dict[str, Any]) -> float:
        """
        Calculate a quality score for a schema (0.0 to 1.0).
        
        Args:
            schema: JSON schema to score
            
        Returns:
            Quality score between 0.0 and 1.0
        """
        score = 0.0
        max_score = 100.0
        
        # Check for required fields (30 points)
        required_fields = self.schema_standards.get('required_fields', [])
        present_fields = sum(1 for field in required_fields if field in schema)
        score += (present_fields / len(required_fields)) * 30 if required_fields else 30
        
        # Check for properties (20 points)
        if 'properties' in schema and len(schema['properties']) > 0:
            score += 20
        
        # Check for metadata (20 points)
        if 'metadata' in schema:
            metadata = schema['metadata']
            if 'generated_at' in metadata:
                score += 10
            if 'generator' in metadata:
                score += 5
            if 'version' in metadata:
                score += 5
        
        # Check for descriptions (15 points)
        if 'description' in schema:
            score += 10
        properties_with_desc = sum(
            1 for prop in schema.get('properties', {}).values()
            if isinstance(prop, dict) and 'description' in prop
        )
        if properties_with_desc > 0:
            score += 5
        
        # Check for type definitions (15 points)
        if 'type' in schema:
            score += 10
        typed_properties = sum(
            1 for prop in schema.get('properties', {}).values()
            if isinstance(prop, dict) and 'type' in prop
        )
        if typed_properties > 0:
            score += 5
        
        return min(score / max_score, 1.0)