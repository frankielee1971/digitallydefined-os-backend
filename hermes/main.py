#!/usr/bin/env python3
"""
HERMES - Authority Silo Architect Builder
Main entrypoint for the Hermes agent system.

Usage:
    python main.py                    # Runs with default config.yaml
    python main.py config.yaml        # Runs with specified config file
    hermes.start("config.yaml")       # Programmatic start
"""

import os
import sys
import logging
from pathlib import Path
from typing import Dict, Any

try:
    import yaml  # type: ignore
except ImportError:
    print("Error: PyYAML is not installed. Install it with: pip install pyyaml")
    sys.exit(1)

# Initialize AgentOps for telemetry and monitoring
try:
    import agentops
    AGENTOPS_AVAILABLE = True
except ImportError:
    AGENTOPS_AVAILABLE = False
    print("Warning: AgentOps not installed. Install with: pip install agentops")

# ✅ Fix Windows console encoding (prevents UnicodeEncodeError)
sys.stdout.reconfigure(encoding='utf-8')

# Add parent directory to path for module imports
sys.path.insert(0, str(Path(__file__).parent))

from modules.content_schema_generator import ContentSchemaGenerator
from modules.schema_validator import SchemaValidator
from modules.product_packager import ProductPackager
from modules.expansion_manager import ExpansionManager


class Hermes:
    """
    Main Hermes orchestrator for the Authority Silo Architect Builder.
    Coordinates all sub-agents to generate, validate, package, and expand
    content schemas for the Authority Silo Architect funnel.
    """

    def __init__(self, config_path: str = "config.yaml"):
        """Initialize Hermes with configuration."""
        self.config_path = config_path
        self.config = self._load_config(config_path)
        self._setup_logging()
        self._load_environment()
        
        # Initialize AgentOps for telemetry
        self._init_agentops()

        # Initialize sub-agents
        self.schema_generator = ContentSchemaGenerator(self.config)
        self.schema_validator = SchemaValidator(self.config)
        self.product_packager = ProductPackager(self.config)
        self.expansion_manager = ExpansionManager(self.config)

        self.logger.info("Hermes initialized successfully")

    def _load_config(self, config_path: str) -> Dict[str, Any]:
        """Load configuration from YAML file."""
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Configuration file not found: {config_path}")

        with open(config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        return config

    def _setup_logging(self):
        """Setup logging based on configuration."""
        log_config = self.config.get('agent', {}).get('enhancements', {})
        log_path = "logs/"
        log_level = "INFO"
        log_file = "authority_silo_architect.log"

        if isinstance(log_config, dict) and 'logging' in log_config:
            logging_settings = log_config['logging']
            if logging_settings.get('enabled', True):
                log_path = logging_settings.get('log_path', 'logs/')
                log_level = logging_settings.get('log_level', 'INFO')
                log_file = logging_settings.get('log_file', 'authority_silo_architect.log')

        os.makedirs(log_path, exist_ok=True)
        log_file_path = os.path.join(log_path, log_file)

        logging.basicConfig(
            level=getattr(logging, log_level),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file_path, encoding='utf-8'),
                logging.StreamHandler(sys.stdout)
            ]
        )

        self.logger = logging.getLogger('Hermes')

    def _load_environment(self):
        """Load environment variables from config."""
        env_vars = self.config.get('environment', [])
        for var in env_vars:
            if '=' in var:
                key, value = var.split('=', 1)
                os.environ[key] = value

    def _init_agentops(self):
        """Initialize AgentOps for telemetry and monitoring."""
        if not AGENTOPS_AVAILABLE:
            self.logger.warning("AgentOps not available - skipping initialization")
            return
        
        try:
            api_key = os.getenv("AGENTOPS_API_KEY")
            if api_key:
                agentops.init(api_key=api_key)
                self.logger.info("✓ AgentOps initialized with API key")
            else:
                agentops.init()
                self.logger.info("✓ AgentOps initialized in demo mode")
        except Exception as e:
            self.logger.error(f"Failed to initialize AgentOps: {e}")

    def start(self, config_path: str = None):
        """Start the Hermes agent system."""
        if config_path:
            self.config = self._load_config(config_path)
            self._setup_logging()
            self._load_environment()

        self.logger.info("=" * 60)
        self.logger.info("HERMES - Authority Silo Architect Builder")
        self.logger.info("=" * 60)
        self.logger.info(f"Agent: {self.config['agent']['name']}")
        self.logger.info(f"Version: {self.config['agent']['version']}")
        self.logger.info("")

        funnel_stages = self.config.get('funnel', {}).get('stages', [])
        self.logger.info(f"Processing {len(funnel_stages)} funnel stages...")

        # ✅ NEW: Generate and save missing schemas before validation
        schema_dir = Path("schemas")
        schema_dir.mkdir(exist_ok=True)
        self.logger.info("Checking for missing schemas...")
        for stage in funnel_stages:
            filename = f"{stage['name'].lower().replace(' ', '_')}_schema.json"
            filepath = schema_dir / filename
            if not filepath.exists():
                schema = self.schema_generator.generate_schema(stage)
                self.schema_generator.save_schema(schema, str(filepath))
                self.logger.info(f"✅ Created missing schema: {filename}")
            else:
                self.logger.info(f"⚙️ Schema already exists: {filename}")

        # Continue with normal execution
        for stage in funnel_stages:
            self.logger.info(f"\n{'='*60}")
            self.logger.info(f"Stage: {stage['name']} (Order: {stage['order']})")
            self.logger.info(f"Description: {stage['description']}")
            self.logger.info(f"{'='*60}")

            self.logger.info("1. Generating content schema...")
            schema = self.schema_generator.generate_schema(stage)

            self.logger.info("2. Validating schema...")
            is_valid = self.schema_validator.validate_schema(schema)

            if is_valid:
                self.logger.info("✓ Schema validation passed")
                self.logger.info("3. Packaging product...")
                package = self.product_packager.package_product(schema, stage)

                self.logger.info("4. Managing expansion...")
                self.expansion_manager.manage_expansion(package, stage)

                self.logger.info(f"✓ Stage '{stage['name']}' completed successfully")
            else:
                self.logger.error(f"✗ Schema validation failed for stage '{stage['name']}'")

        self.logger.info("\n" + "=" * 60)
        self.logger.info("HERMES execution completed")
        self.logger.info("=" * 60)

    def generate_silo(self, stage_name: str):
        """Generate a single content silo by name."""
        funnel_stages = self.config.get('funnel', {}).get('stages', [])
        stage = next((s for s in funnel_stages if s['name'] == stage_name), None)

        if not stage:
            self.logger.error(f"Stage not found: {stage_name}")
            return

        self.logger.info(f"Generating silo: {stage_name}")
        schema = self.schema_generator.generate_schema(stage)
        is_valid = self.schema_validator.validate_schema(schema)

        if is_valid:
            package = self.product_packager.package_product(schema, stage)
            self.expansion_manager.manage_expansion(package, stage)
            self.logger.info(f"✓ Silo '{stage_name}' generated successfully")
            return package
        else:
            self.logger.error(f"✗ Schema validation failed for '{stage_name}'")
            return None

    def validate_silo(self, schema: Dict[str, Any]) -> bool:
        """Validate a content schema."""
        return self.schema_validator.validate_schema(schema)

    def package_silo(self, schema: Dict[str, Any], stage: Dict[str, Any]):
        """Package a content silo for distribution."""
        return self.product_packager.package_product(schema, stage)

    def expand_silo(self, package, stage: Dict[str, Any]):
        """Expand a packaged silo with new content."""
        self.expansion_manager.manage_expansion(package, stage)


def main():
    """Main entrypoint for command-line execution."""
    config_path = sys.argv[1] if len(sys.argv) > 1 else "config.yaml"

    try:
        hermes = Hermes(config_path)
        hermes.start()
    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
