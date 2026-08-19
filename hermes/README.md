# HERMES - Authority Silo Architect Builder

## Overview

HERMES is an intelligent agent system that automates the creation, validation, and packaging of JSON Schema-based content silos for the Authority Silo Architect funnel. It serves as the backbone for generating scalable, structured digital products across your entire sales funnel.

## Authority Silo Architect Funnel

```
Lead Magnet → Core Offer → Authority Bundle → Community → Recurring Revenue
```

Each stage in the funnel is managed by HERMES to ensure consistent, high-quality content delivery.

## Features

- **Automated Schema Generation**: Creates JSON Schema Draft 7 compliant schemas for each funnel stage
- **Schema Validation**: Validates schemas against custom rules and JSON Schema standards
- **Product Packaging**: Packages content for Gumroad distribution with metadata and documentation
- **Version Control**: Semantic versioning with historical snapshots and rollback capabilities
- **Monthly Updates**: Automated monthly schema updates and expansion management
- **Integration Ready**: Built-in support for Gumroad, Supabase, and Notion

## Project Structure

```
hermes/
├── config.yaml              # Hermes configuration file
├── main.py                  # Main entrypoint
├── modules/                 # Agent modules
│   ├── content_schema_generator.py  # Generates JSON schemas
│   ├── schema_validator.py          # Validates schemas
│   ├── product_packager.py          # Packages for distribution
│   └── expansion_manager.py         # Manages versions and updates
├── logs/                    # Runtime logs
└── README.md               # This file
```

## Installation

### Prerequisites

- Python 3.8+
- pip package manager

### Setup

1. Navigate to the hermes directory:
   ```bash
   cd hermes
   ```

2. Install required dependencies:
   ```bash
   pip install pyyaml jsonschema packaging
   ```

3. Configure environment variables:
   ```bash
   # Copy .env.example to .env
   cp .env.example .env
   
   # Edit .env and fill in your actual API keys and configuration values
   ```

4. Verify installation:
   ```bash
   python main.py
   ```

## Usage

### Starting HERMES

#### Command Line

```bash
# Run with default config.yaml
python main.py

# Run with specific config file
python main.py path/to/config.yaml
```

#### Programmatic Usage

```python
from main import Hermes

# Initialize HERMES
hermes = Hermes("config.yaml")

# Start the full system
hermes.start()

# Or generate a specific silo
package = hermes.generate_silo("Core Offer")

# Validate a schema
is_valid = hermes.validate_silo(schema)

# Package a silo
package = hermes.package_silo(schema, stage_config)

# Expand a silo
hermes.expand_silo(package, stage_config)
```

## Configuration

### config.yaml Structure

The configuration file defines:

- **Agent Configuration**: Name, version, role, and architecture
- **Sub-Agents**: ContentSchemaGenerator, SchemaValidator, ProductPackager, ExpansionManager
- **Funnel Stages**: Lead Magnet, Core Offer, Authority Bundle, Community, Recurring Revenue
- **Schema Standards**: JSON Schema Draft 7 requirements and validation rules
- **Integrations**: Gumroad, Supabase, and Notion API configurations
- **Enhancements**: Logging, version control, monthly updates

### Environment Variables

Set these in your `.env` file or environment:

```env
# Gumroad Integration
GUMROAD_API_KEY=your_gumroad_api_key
GUMROAD_PRODUCT_ID=your_gumroad_product_id

# Supabase Integration
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Notion Integration
NOTION_TOKEN=your_notion_token
NOTION_DATABASE_ID=your_notion_database_id
```

## Agent Modules

### ContentSchemaGenerator

Generates JSON schemas for content silos based on funnel stage configuration.

**Key Methods:**
- `generate_schema(stage)` - Generate schema for a funnel stage
- `generate_all_schemas()` - Generate schemas for all stages
- `save_schema(schema, output_path)` - Save schema to JSON file

### SchemaValidator

Validates JSON schemas against JSON Schema Draft 7 standards and custom rules.

**Key Methods:**
- `validate_schema(schema)` - Validate a schema
- `get_validation_errors(schema)` - Get list of validation errors
- `validate_schema_instance(instance, schema)` - Validate data against schema
- `get_schema_quality_score(schema)` - Calculate quality score (0.0-1.0)

### ProductPackager

Packages content schemas for Gumroad distribution and digital product delivery.

**Key Methods:**
- `package_product(schema, stage)` - Package a single product
- `batch_package(schemas_and_stages)` - Package multiple products
- `get_package_status(package_id)` - Check package status

### ExpansionManager

Manages schema expansion, version control, and monthly updates.

**Key Methods:**
- `manage_expansion(package, stage)` - Manage package expansion
- `expand_schema(package_id, expansion_type, content)` - Expand existing schema
- `get_version_history(package_id)` - Get version history
- `rollback_to_version(package_id, target_version)` - Rollback to specific version
- `check_for_updates(package_id)` - Check if updates are needed

## Integration with Frontend/Backend

HERMES is designed to work independently but can integrate with your existing systems:

### API Integration

Call HERMES from your backend API:

```javascript
// Example: Node.js API endpoint
import { spawn } from 'child_process';

app.post('/api/hermes/generate-silo', async (req, res) => {
  const { stage } = req.body;
  
  const hermes = spawn('python', ['main.py', 'config.yaml']);
  
  hermes.stdout.on('data', (data) => {
    console.log(`Output: ${data}`);
  });
  
  hermes.on('close', (code) => {
    res.json({ success: code === 0, stage });
  });
});
```

### Supabase Integration

HERMES can store generated schemas in Supabase:

```python
from supabase import create_client

supabase = create_client(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_KEY')
)

# Store schema
supabase.table('authority_silos').insert({
    'stage': stage_name,
    'schema': schema,
    'version': '1.0.0'
}).execute()
```

### Notion Integration

Sync content schemas with Notion databases:

```python
from notion_client import Client

notion = Client(auth=os.getenv('NOTION_TOKEN'))

# Create page in database
notion.pages.create(
    parent={"database_id": os.getenv('NOTION_DATABASE_ID')},
    properties={
        "Name": {"title": [{"text": {"content": schema['title']}}]},
        "Stage": {"select": {"name": stage_name}},
        "Version": {"rich_text": [{"text": {"content": "1.0.0"}}]}
    }
)
```

## Extending HERMES

### Adding New Schema Modules

1. Create a new module in the `modules/` directory:

```python
# modules/custom_module.py
class CustomModule:
    def __init__(self, config):
        self.config = config
    
    def process(self, data):
        # Your custom logic
        return processed_data
```

2. Register the module in `config.yaml`:

```yaml
agent:
  architecture:
    sub_agents:
      - name: "CustomModule"
        module: "modules.custom_module"
        function: "process"
        description: "Custom processing module"
```

3. Initialize in `main.py`:

```python
from modules.custom_module import CustomModule

class Hermes:
    def __init__(self, config_path):
        # ... existing code ...
        self.custom_module = CustomModule(self.config)
```

### Adding New Funnel Stages

1. Add the stage to `config.yaml`:

```yaml
funnel:
  stages:
    - name: "New Stage"
      order: 6
      description: "Description of new stage"
      schema_template: "new_stage_schema.json"
```

2. Define stage-specific properties in `content_schema_generator.py`:

```python
def _get_stage_specific_properties(self, stage_name: str) -> Dict[str, Any]:
    stage_properties = {
        # ... existing stages ...
        "New Stage": {
            "custom_property": {
                "type": "string",
                "description": "Custom property description"
            }
        }
    }
    return stage_properties.get(stage_name, {})
```

## Development

### Running Tests

```bash
# Test individual modules
python -m modules.content_schema_generator
python -m modules.schema_validator
python -m modules.product_packager
python -m modules.expansion_manager
```

### Debugging

Logs are stored in the `logs/` directory:

```bash
# View logs
tail -f logs/hermes.log
```

## Deployment

### Deploying to Production

1. Set environment variables in your production environment
2. Configure integrations (Gumroad, Supabase, Notion)
3. Run HERMES as a service or scheduled job:

```bash
# Using cron (Linux/Mac)
0 0 * * 1 cd /path/to/hermes && python main.py  # Run weekly

# Using Windows Task Scheduler
# Schedule main.py to run at desired intervals
```

### MCP Environment Deployment

To deploy HERMES as an MCP (Model Context Protocol) agent:

1. **Install Dependencies**:
   ```bash
   pip install pyyaml jsonschema packaging
   ```

2. **Configure Environment Variables**:
   ```bash
   # Copy .env.example to .env
   cp .env.example .env
   
   # Fill in your API keys and configuration
   nano .env  # or use your preferred editor
   ```

3. **Test HERMES Locally**:
   ```bash
   python main.py
   ```
   
   Verify:
   - Logs are written to `/hermes/logs/authority_silo_architect.log`
   - All 5 funnel stages are processed
   - Output packages are created in `output/packages/`

4. **Deploy as MCP Service**:
   
   HERMES can be invoked as a service from your MCP environment:
   
   ```python
   # Example MCP tool wrapper
   from mcp import Tool
   from main import Hermes
   
   @Tool()
   async def generate_authority_silo(stage_name: str) -> dict:
       """Generate a content silo for a specific funnel stage."""
       hermes = Hermes("config.yaml")
       package = hermes.generate_silo(stage_name)
       return package
   ```

5. **Integration with Backend**:

   **Option A: Supabase Functions**
   ```python
   # supabase/functions/generate-silo/index.py
   import json
   from main import Hermes
   
   def main(event, context):
       hermes = Hermes("config.yaml")
       stage = event.get('stage', 'Core Offer')
       package = hermes.generate_silo(stage)
       return json.dumps(package)
   ```

   **Option B: API Endpoint**
   ```javascript
   // backend/api/hermes-generate.js
   import { spawn } from 'child_process';
   
   export default async function handler(req, res) {
     const { stage } = req.body;
     
     const hermes = spawn('python', ['main.py'], {
       cwd: '/path/to/hermes',
       env: { ...process.env, STAGE: stage }
     });
     
     let output = '';
     hermes.stdout.on('data', (data) => {
       output += data.toString();
     });
     
     hermes.on('close', (code) => {
       res.json({ success: code === 0, output });
     });
   }
   ```

6. **Verify Deployment**:
   - Check logs: `tail -f logs/authority_silo_architect.log`
   - Test schema generation: `python -c "from main import Hermes; h = Hermes(); h.generate_silo('Lead Magnet')"`
   - Validate config: `python -c "import yaml; yaml.safe_load(open('config.yaml'))"`

## Environment Variables

Create a `.env` file in the hermes directory with the following variables:

```env
# Gumroad Integration
GUMROAD_API_KEY=your_gumroad_api_key_here
GUMROAD_PRODUCT_ID=your_gumroad_product_id_here

# Supabase Integration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key_here

# Notion Integration
NOTION_TOKEN=secret_your_notion_token_here
NOTION_DATABASE_ID=your_notion_database_id_here
```

See `.env.example` for a template.

## Troubleshooting

### Common Issues

**Issue**: `ModuleNotFoundError: No module named 'yaml'`
**Solution**: Install PyYAML: `pip install pyyaml`

**Issue**: `FileNotFoundError: Configuration file not found`
**Solution**: Ensure config.yaml exists in the hermes directory or provide full path

**Issue**: Schema validation fails
**Solution**: Check schema standards in config.yaml and ensure all required fields are present

**Issue**: Logs not writing to file
**Solution**: Ensure the `logs/` directory exists and has write permissions

**Issue**: Environment variables not loading
**Solution**: Ensure `.env` file is in the hermes directory and properly formatted

## Support

For questions or support:
- Email: support@digitallydefined.online
- Documentation: https://digitallydefined.online/docs/hermes
- GitHub Issues: https://github.com/frankielee1971/digitallydefined-os-backend/issues

## License

Proprietary - All rights reserved © DigitallyDefined

## Changelog

### v1.0.0 (Current)
- Initial release
- Authority Silo Architect Builder agent
- Four sub-agents: ContentSchemaGenerator, SchemaValidator, ProductPackager, ExpansionManager
- Gumroad, Supabase, and Notion integrations
- Version control and monthly updates