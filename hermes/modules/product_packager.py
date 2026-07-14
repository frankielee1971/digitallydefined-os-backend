#!/usr/bin/env python3
"""
Product Packager Module
Packages content schemas for Gumroad distribution and digital product delivery.
"""

import json
import zipfile
import os
from pathlib import Path
from typing import Dict, Any, List
from datetime import datetime


class ProductPackager:
    """
    Packages content schemas for Gumroad distribution.
    
    Creates distributable product packages including:
    - JSON schema files
    - Documentation
    - Metadata files
    - Distribution-ready archives
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the product packager with configuration.
        
        Args:
            config: Hermes configuration dictionary
        """
        self.config = config
        self.gumroad_config = self._get_integration_config('gumroad')
        self.output_dir = Path("output/packages")
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_integration_config(self, service: str) -> Dict[str, Any]:
        """
        Get integration configuration for a service.
        
        Args:
            service: Service name (e.g., 'gumroad', 'supabase')
            
        Returns:
            Service configuration dictionary
        """
        enhancements = self.config.get('agent', {}).get('enhancements', [])
        for enhancement in enhancements:
            if isinstance(enhancement, dict) and 'integrations' in enhancement:
                for integration in enhancement['integrations']:
                    if service in integration:
                        return integration[service]
        return {}
    
    def package_product(self, schema: Dict[str, Any], stage: Dict[str, Any]) -> Dict[str, Any]:
        """
        Package a content schema into a distributable product.
        
        Args:
            schema: JSON schema dictionary
            stage: Funnel stage configuration
            
        Returns:
            Package metadata dictionary
        """
        # Generate package metadata
        package_id = self._generate_package_id(schema, stage)
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        package = {
            "package_id": package_id,
            "created_at": timestamp,
            "stage": stage['name'],
            "stage_order": stage['order'],
            "schema": schema,
            "files": [],
            "gumroad_ready": True,
            "metadata": {
                "title": schema.get('title', 'Untitled'),
                "description": schema.get('description', ''),
                "content_type": schema.get('properties', {}).get('content_type', {}).get('enum', ['generic'])[0],
                "version": "1.0.0",
                "packager": "Hermes ProductPackager"
            }
        }
        
        # Create package files
        package['files'] = self._create_package_files(package)
        
        # Create distributable archive
        archive_path = self._create_archive(package)
        package['archive_path'] = str(archive_path)
        
        # Generate Gumroad listing data
        package['gumroad_listing'] = self._generate_gumroad_listing(package)
        
        return package
    
    def _generate_package_id(self, schema: Dict[str, Any], stage: Dict[str, Any]) -> str:
        """
        Generate unique package ID.
        
        Args:
            schema: JSON schema dictionary
            stage: Funnel stage configuration
            
        Returns:
            Unique package ID string
        """
        import uuid
        stage_slug = stage['name'].lower().replace(' ', '_')
        schema_title = schema.get('title', 'untitled').lower().replace(' ', '_')
        unique_id = str(uuid.uuid4())[:8]
        return f"{stage_slug}_{schema_title}_{unique_id}"
    
    def _create_package_files(self, package: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Create all files for the product package.
        
        Args:
            package: Package metadata dictionary
            
        Returns:
            List of file metadata dictionaries
        """
        files = []
        package_id = package['package_id']
        package_dir = self.output_dir / package_id
        package_dir.mkdir(exist_ok=True)
        
        # 1. Schema file
        schema_file = package_dir / "schema.json"
        with open(schema_file, 'w') as f:
            json.dump(package['schema'], f, indent=2)
        files.append({
            "name": "schema.json",
            "path": str(schema_file),
            "type": "schema",
            "size": schema_file.stat().st_size
        })
        
        # 2. README file
        readme_file = package_dir / "README.md"
        readme_content = self._generate_readme(package)
        with open(readme_file, 'w') as f:
            f.write(readme_content)
        files.append({
            "name": "README.md",
            "path": str(readme_file),
            "type": "documentation",
            "size": readme_file.stat().st_size
        })
        
        # 3. Metadata file
        metadata_file = package_dir / "metadata.json"
        metadata = {
            "package_id": package_id,
            "created_at": package['created_at'],
            "stage": package['stage'],
            "version": package['metadata']['version'],
            "files": [f['name'] for f in files]
        }
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2)
        files.append({
            "name": "metadata.json",
            "path": str(metadata_file),
            "type": "metadata",
            "size": metadata_file.stat().st_size
        })
        
        # 4. Content template (if applicable)
        if package['metadata']['content_type'] in ['ebook', 'guide', 'checklist']:
            template_file = package_dir / "content_template.md"
            template_content = self._generate_content_template(package)
            with open(template_file, 'w') as f:
                f.write(template_content)
            files.append({
                "name": "content_template.md",
                "path": str(template_file),
                "type": "template",
                "size": template_file.stat().st_size
            })
        
        return files
    
    def _generate_readme(self, package: Dict[str, Any]) -> str:
        """
        Generate README content for the package.
        
        Args:
            package: Package metadata dictionary
            
        Returns:
            README content string
        """
        metadata = package['metadata']
        schema = package['schema']
        
        readme = f"""# {metadata['title']}

## Description
{metadata['description']}

## Package Information
- **Package ID**: {package['package_id']}
- **Stage**: {package['stage']} (Order: {package['stage_order']})
- **Content Type**: {metadata['content_type']}
- **Version**: {metadata['version']}
- **Created**: {package['created_at']}

## Contents
This package contains:
- `schema.json` - JSON Schema definition for this content silo
- `metadata.json` - Package metadata and version information
- `README.md` - This file

"""
        
        if 'content_template.md' in [f['name'] for f in package.get('files', [])]:
            readme += "- `content_template.md` - Content template for creating the actual product\n"
        
        readme += """
## Usage
1. Review the `schema.json` file to understand the content structure
2. Use the content template (if provided) to create your product
3. Validate your content against the schema
4. Distribute via Gumroad or other platforms

## Schema Details
"""
        
        # Add schema properties
        if 'properties' in schema:
            readme += "\n### Required Fields\n"
            required = schema.get('required', [])
            for field in required:
                if field in schema.get('properties', {}):
                    prop = schema['properties'][field]
                    readme += f"- **{field}**: {prop.get('description', 'No description')}\n"
        
        readme += "\n## Support\n"
        readme += "For questions or support, contact support@digitallydefined.online\n"
        
        return readme
    
    def _generate_content_template(self, package: Dict[str, Any]) -> str:
        """
        Generate a content template based on the schema.
        
        Args:
            package: Package metadata dictionary
            
        Returns:
            Content template string
        """
        schema = package['schema']
        content_type = package['metadata']['content_type']
        
        template = f"""# {schema.get('title', 'Content Template')}

## Overview
{schema.get('description', '')}

## Target Audience
[Define your target audience here]

## Value Proposition
[Describe the core value you're providing]

## Content Structure

"""
        
        # Add sections based on schema properties
        if 'properties' in schema:
            for prop_name, prop_def in schema['properties'].items():
                if prop_name not in ['title', 'description', 'content_type', 'target_audience', 'value_proposition']:
                    template += f"### {prop_name.replace('_', ' ').title()}\n"
                    template += f"[Add {prop_name} content here]\n\n"
        
        template += """
## Conclusion
[Wrap up your content with key takeaways]

## Call to Action
[Tell readers what to do next]
"""
        
        return template
    
    def _create_archive(self, package: Dict[str, Any]) -> Path:
        """
        Create a ZIP archive of the package.
        
        Args:
            package: Package metadata dictionary
            
        Returns:
            Path to created archive
        """
        package_id = package['package_id']
        package_dir = self.output_dir / package_id
        archive_path = self.output_dir / f"{package_id}.zip"
        
        with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file_info in package['files']:
                file_path = Path(file_info['path'])
                if file_path.exists():
                    zipf.write(file_path, file_info['name'])
        
        return archive_path
    
    def _generate_gumroad_listing(self, package: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate Gumroad listing data for the package.
        
        Args:
            package: Package metadata dictionary
            
        Returns:
            Gumroad listing data dictionary
        """
        metadata = package['metadata']
        schema = package['schema']
        
        listing = {
            "name": metadata['title'],
            "description": metadata['description'],
            "price": self._extract_price(schema),
            "product_type": metadata['content_type'],
            "category": self._determine_gumroad_category(package['stage']),
            "tags": self._generate_tags(package),
            "file_upload": {
                "main_file": f"{package['package_id']}.zip",
                "file_size": sum(f['size'] for f in package['files'])
            },
            "content_schema": {
                "package_id": package['package_id'],
                "stage": package['stage'],
                "schema_version": metadata['version']
            }
        }
        
        return listing
    
    def _extract_price(self, schema: Dict[str, Any]) -> float:
        """
        Extract price from schema properties.
        
        Args:
            schema: JSON schema dictionary
            
        Returns:
            Price value (default 0.0)
        """
        price_prop = schema.get('properties', {}).get('price', {})
        if 'default' in price_prop:
            return price_prop['default']
        return 0.0
    
    def _determine_gumroad_category(self, stage: str) -> str:
        """
        Determine Gumroad category based on funnel stage.
        
        Args:
            stage: Funnel stage name
            
        Returns:
            Gumroad category string
        """
        categories = {
            "Lead Magnet": "Digital Products > Ebooks",
            "Core Offer": "Digital Products > Courses",
            "Authority Bundle": "Digital Products > Bundles",
            "Community": "Memberships",
            "Recurring Revenue": "Memberships"
        }
        return categories.get(stage, "Digital Products")
    
    def _generate_tags(self, package: Dict[str, Any]) -> List[str]:
        """
        Generate tags for Gumroad listing.
        
        Args:
            package: Package metadata dictionary
            
        Returns:
            List of tags
        """
        tags = [
            package['stage'].lower().replace(' ', '-'),
            package['metadata']['content_type'],
            "digitallydefined",
            "authority-silo"
        ]
        return tags
    
    def batch_package(self, schemas_and_stages: List[tuple]) -> List[Dict[str, Any]]:
        """
        Package multiple schemas in batch.
        
        Args:
            schemas_and_stages: List of (schema, stage) tuples
            
        Returns:
            List of package metadata dictionaries
        """
        packages = []
        for schema, stage in schemas_and_stages:
            package = self.package_product(schema, stage)
            packages.append(package)
        return packages
    
    def get_package_status(self, package_id: str) -> Dict[str, Any]:
        """
        Get status of a packaged product.
        
        Args:
            package_id: Package ID to check
            
        Returns:
            Package status dictionary
        """
        package_dir = self.output_dir / package_id
        archive_path = self.output_dir / f"{package_id}.zip"
        
        if not package_dir.exists() and not archive_path.exists():
            return {"status": "not_found", "package_id": package_id}
        
        status = {
            "package_id": package_id,
            "status": "ready",
            "files_exist": package_dir.exists(),
            "archive_exists": archive_path.exists(),
            "archive_size": archive_path.stat().st_size if archive_path.exists() else 0
        }
        
        return status