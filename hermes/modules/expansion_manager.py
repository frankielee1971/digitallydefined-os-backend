#!/usr/bin/env python3
"""
Expansion Manager Module
Manages schema expansion, version control, and monthly updates for content silos.
"""

import json
import shutil
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta


class ExpansionManager:
    """
    Manages schema expansion and version control for content silos.
    
    Handles:
    - Version control using semantic versioning
    - Monthly schema updates
    - Schema expansion with new content
    - Historical version tracking
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the expansion manager with configuration.
        
        Args:
            config: Hermes configuration dictionary
        """
        self.config = config
        self.enhancements = self._get_enhancements_config()
        self.versions_dir = Path("output/versions")
        self.versions_dir.mkdir(parents=True, exist_ok=True)
        
        # Track current versions
        self.current_versions = {}
    
    def _get_enhancements_config(self) -> Dict[str, Any]:
        """
        Extract enhancements configuration.
        
        Returns:
            Enhancements configuration dictionary
        """
        enhancements = {}
        enhancement_list = self.config.get('agent', {}).get('enhancements', [])
        
        for enhancement in enhancement_list:
            if isinstance(enhancement, dict):
                if 'version_control' in enhancement:
                    enhancements['version_control'] = enhancement['version_control']
                    enhancements['version_schema'] = enhancement.get('version_schema', 'semantic')
                
                if 'monthly_schema_updates' in enhancement:
                    enhancements['monthly_updates'] = enhancement['monthly_schema_updates']
                    enhancements['update_schedule'] = enhancement.get('update_schedule', 'monthly')
        
        return enhancements
    
    def manage_expansion(self, package: Dict[str, Any], stage: Dict[str, Any]) -> Dict[str, Any]:
        """
        Manage expansion of a packaged silo.
        
        Args:
            package: Packaged product dictionary
            stage: Funnel stage configuration
            
        Returns:
            Expansion management result dictionary
        """
        result = {
            "package_id": package['package_id'],
            "stage": stage['name'],
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "actions": []
        }
        
        # Initialize version control
        if self.enhancements.get('version_control'):
            version_info = self._initialize_version_control(package, stage)
            result['version'] = version_info
            result['actions'].append("version_control_initialized")
        
        # Save version snapshot
        version_path = self._save_version_snapshot(package, stage)
        result['version_snapshot'] = str(version_path)
        result['actions'].append("version_snapshot_saved")
        
        # Setup monthly update schedule
        if self.enhancements.get('monthly_updates'):
            update_schedule = self._setup_monthly_updates(package, stage)
            result['update_schedule'] = update_schedule
            result['actions'].append("monthly_updates_scheduled")
        
        # Create expansion roadmap
        roadmap = self._create_expansion_roadmap(package, stage)
        result['expansion_roadmap'] = roadmap
        result['actions'].append("expansion_roadmap_created")
        
        return result
    
    def _initialize_version_control(self, package: Dict[str, Any], stage: Dict[str, Any]) -> Dict[str, Any]:
        """
        Initialize version control for a package.
        
        Args:
            package: Packaged product dictionary
            stage: Funnel stage configuration
            
        Returns:
            Version information dictionary
        """
        package_id = package['package_id']
        initial_version = "1.0.0"
        
        version_info = {
            "package_id": package_id,
            "current_version": initial_version,
            "version_schema": self.enhancements.get('version_schema', 'semantic'),
            "created_at": datetime.utcnow().isoformat() + "Z",
            "history": [
                {
                    "version": initial_version,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "changes": "Initial version"
                }
            ]
        }
        
        self.current_versions[package_id] = version_info
        
        # Save version info
        version_file = self.versions_dir / f"{package_id}_version.json"
        with open(version_file, 'w') as f:
            json.dump(version_info, f, indent=2)
        
        return version_info
    
    def _save_version_snapshot(self, package: Dict[str, Any], stage: Dict[str, Any]) -> Path:
        """
        Save a snapshot of the current package version.
        
        Args:
            package: Packaged product dictionary
            stage: Funnel stage configuration
            
        Returns:
            Path to saved snapshot
        """
        package_id = package['package_id']
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        
        # Create versioned snapshot
        snapshot_dir = self.versions_dir / package_id / "snapshots"
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        
        snapshot_file = snapshot_dir / f"v{timestamp}.json"
        with open(snapshot_file, 'w') as f:
            json.dump(package, f, indent=2)
        
        return snapshot_file
    
    def _setup_monthly_updates(self, package: Dict[str, Any], stage: Dict[str, Any]) -> Dict[str, Any]:
        """
        Setup monthly update schedule for a package.
        
        Args:
            package: Packaged product dictionary
            stage: Funnel stage configuration
            
        Returns:
            Update schedule dictionary
        """
        package_id = package['package_id']
        update_schedule = self.enhancements.get('update_schedule', 'monthly')
        
        # Calculate next update date
        next_update = datetime.utcnow()
        if update_schedule == 'monthly':
            next_update = next_update.replace(day=1) + timedelta(days=32)
            next_update = next_update.replace(day=1)
        
        schedule = {
            "package_id": package_id,
            "schedule": update_schedule,
            "next_update": next_update.isoformat() + "Z",
            "update_history": [],
            "auto_update": True,
            "update_triggers": [
                "schema_standard_changes",
                "new_content_requirements",
                "customer_feedback",
                "market_changes"
            ]
        }
        
        # Save schedule
        schedule_file = self.versions_dir / package_id / "update_schedule.json"
        schedule_file.parent.mkdir(parents=True, exist_ok=True)
        with open(schedule_file, 'w') as f:
            json.dump(schedule, f, indent=2)
        
        return schedule
    
    def _create_expansion_roadmap(self, package: Dict[str, Any], stage: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create an expansion roadmap for the package.
        
        Args:
            package: Packaged product dictionary
            stage: Funnel stage configuration
            
        Returns:
            Expansion roadmap dictionary
        """
        package_id = package['package_id']
        schema = package['schema']
        
        roadmap = {
            "package_id": package_id,
            "stage": stage['name'],
            "current_version": "1.0.0",
            "planned_expansions": [
                {
                    "version": "1.1.0",
                    "description": "Add new content sections based on user feedback",
                    "priority": "medium",
                    "estimated_completion": "2 weeks"
                },
                {
                    "version": "1.2.0",
                    "description": "Enhance schema with additional validation rules",
                    "priority": "low",
                    "estimated_completion": "1 month"
                },
                {
                    "version": "2.0.0",
                    "description": "Major schema revision with new properties",
                    "priority": "high",
                    "estimated_completion": "3 months"
                }
            ],
            "expansion_areas": [
                "Additional content types",
                "Enhanced metadata fields",
                "Integration with new platforms",
                "Advanced validation rules"
            ]
        }
        
        # Save roadmap
        roadmap_file = self.versions_dir / package_id / "expansion_roadmap.json"
        with open(roadmap_file, 'w') as f:
            json.dump(roadmap, f, indent=2)
        
        return roadmap
    
    def expand_schema(self, package_id: str, expansion_type: str, content: Dict[str, Any]) -> Dict[str, Any]:
        """
        Expand an existing schema with new content.
        
        Args:
            package_id: Package ID to expand
            expansion_type: Type of expansion (e.g., 'add_property', 'update_validation')
            content: New content to add
            
        Returns:
            Expansion result dictionary
        """
        if package_id not in self.current_versions:
            # Load version info from file
            version_file = self.versions_dir / f"{package_id}_version.json"
            if not version_file.exists():
                return {"status": "error", "message": "Package not found"}
            
            with open(version_file, 'r') as f:
                version_info = json.load(f)
            self.current_versions[package_id] = version_info
        
        version_info = self.current_versions[package_id]
        current_version = version_info['current_version']
        
        # Increment version
        new_version = self._increment_version(current_version, expansion_type)
        
        # Record expansion
        expansion_record = {
            "version": new_version,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "expansion_type": expansion_type,
            "changes": content
        }
        
        version_info['history'].append(expansion_record)
        version_info['current_version'] = new_version
        
        # Save updated version info
        version_file = self.versions_dir / f"{package_id}_version.json"
        with open(version_file, 'w') as f:
            json.dump(version_info, f, indent=2)
        
        return {
            "status": "success",
            "package_id": package_id,
            "new_version": new_version,
            "expansion": expansion_record
        }
    
    def _increment_version(self, current_version: str, expansion_type: str) -> str:
        """
        Increment semantic version based on expansion type.
        
        Args:
            current_version: Current version string (e.g., "1.2.3")
            expansion_type: Type of expansion
            
        Returns:
            New version string
        """
        parts = current_version.split('.')
        major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
        
        if expansion_type == 'major':
            major += 1
            minor = 0
            patch = 0
        elif expansion_type == 'minor':
            minor += 1
            patch = 0
        else:
            patch += 1
        
        return f"{major}.{minor}.{patch}"
    
    def get_version_history(self, package_id: str) -> Dict[str, Any]:
        """
        Get version history for a package.
        
        Args:
            package_id: Package ID to check
            
        Returns:
            Version history dictionary
        """
        if package_id in self.current_versions:
            return self.current_versions[package_id]
        
        # Load from file
        version_file = self.versions_dir / f"{package_id}_version.json"
        if version_file.exists():
            with open(version_file, 'r') as f:
                return json.load(f)
        
        return {"status": "error", "message": "Package not found"}
    
    def rollback_to_version(self, package_id: str, target_version: str) -> Dict[str, Any]:
        """
        Rollback a package to a specific version.
        
        Args:
            package_id: Package ID to rollback
            target_version: Version to rollback to
            
        Returns:
            Rollback result dictionary
        """
        # Find snapshot for target version
        snapshot_dir = self.versions_dir / package_id / "snapshots"
        if not snapshot_dir.exists():
            return {"status": "error", "message": "No snapshots found"}
        
        # Find the snapshot file (simplified - in production, match by version)
        snapshot_files = sorted(snapshot_dir.glob("*.json"))
        if not snapshot_files:
            return {"status": "error", "message": "No snapshot files found"}
        
        # Load the snapshot
        snapshot_file = snapshot_files[0]
        with open(snapshot_file, 'r') as f:
            snapshot_data = json.load(f)
        
        # Update version info
        if package_id in self.current_versions:
            self.current_versions[package_id]['current_version'] = target_version
            self.current_versions[package_id]['history'].append({
                "version": target_version,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "changes": f"Rolled back to {target_version}"
            })
        
        return {
            "status": "success",
            "package_id": package_id,
            "rolled_back_to": target_version,
            "snapshot": str(snapshot_file)
        }
    
    def check_for_updates(self, package_id: str) -> Dict[str, Any]:
        """
        Check if updates are needed for a package.
        
        Args:
            package_id: Package ID to check
            
        Returns:
            Update check result dictionary
        """
        schedule_file = self.versions_dir / package_id / "update_schedule.json"
        
        if not schedule_file.exists():
            return {"status": "no_schedule", "message": "No update schedule found"}
        
        with open(schedule_file, 'r') as f:
            schedule = json.load(f)
        
        next_update = datetime.fromisoformat(schedule['next_update'].replace('Z', '+00:00'))
        now = datetime.utcnow().replace(tzinfo=next_update.tzinfo)
        
        needs_update = now >= next_update
        
        return {
            "status": "success",
            "package_id": package_id,
            "needs_update": needs_update,
            "next_update": schedule['next_update'],
            "update_triggers": schedule.get('update_triggers', [])
        }