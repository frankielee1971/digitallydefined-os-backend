# DigitallyDefined Unified System + JSON Design System Enforcer

import json
from mcp import Skill
from utils.file_ops import update_file, apply_component
from utils.agents import ensure_agent_available
from utils.brand import remove_emoji_icons, replace_with_svg_icons

class DigitallyDefinedUnifiedDesignSystemEnforcer(Skill):
    """
    Uses the DigitallyDefined JSON design system instead of Figma.
    Applies colors, spacing, typography, components, and replaces emoji icons
    with SVG icons defined in the JSON file.
    """

    def __init__(self):
        # Load JSON design system
        with open("digitallydefined-online-local/src/design-system/digitallydefined-design-system.json", "r") as f:
            self.design = json.load(f)

    def run(self, params):
        # 1. Apply brand tokens
        self.apply_brand_tokens()

        # 2. Fix website pages
        self.fix_website_pages()

        # 3. Fix dashboard pages
        self.fix_dashboard_pages()

        # 4. Fix calculators
        self.fix_calculators()

        # 5. Replace emoji icons with SVG icons
        self.replace_icons()

        # 6. Ensure agents are available
        ensure_agent_available()

        return {
            "status": "success",
            "message": "DigitallyDefined unified system updated using JSON design system, SVG icons, and full agent integration."
        }

    # -------------------------------------------------------------------------
    # BRAND TOKENS
    # -------------------------------------------------------------------------

    def apply_brand_tokens(self):
        # Hermes will use the JSON design system for colors, spacing, typography
        pass

    # -------------------------------------------------------------------------
    # WEBSITE FIXES
    # -------------------------------------------------------------------------

    def fix_website_pages(self):
        pages = [
            "digitallydefined-online-local/src/pages/Tools.jsx",
            "digitallydefined-online-local/src/pages/FreedomNumber.jsx",
            "digitallydefined-online-local/src/pages/GapCalculator.jsx",
            "digitallydefined-online-local/src/pages/NicheScorecard.jsx",
            "digitallydefined-online-local/src/pages/ROI.jsx",
            "digitallydefined-online-local/src/pages/Home.jsx"
        ]

        for page in pages:
            update_file(page, lambda content: apply_component(content, self.design))

    # -------------------------------------------------------------------------
    # DASHBOARD FIXES
    # -------------------------------------------------------------------------

    def fix_dashboard_pages(self):
        pages = [
            "digitallydefined-dashboard/src/pages/DashboardPage.jsx",
            "digitallydefined-dashboard/src/pages/AnalyticsPage.jsx",
            "digitallydefined-dashboard/src/pages/AssistantPage.jsx"
        ]

        for page in pages:
            update_file(page, lambda content: apply_component(content, self.design))

    # -------------------------------------------------------------------------
    # CALCULATOR FIXES
    # -------------------------------------------------------------------------

    def fix_calculators(self):
        calculators = [
            "digitallydefined-online-local/src/pages/FreedomNumber.jsx",
            "digitallydefined-online-local/src/pages/GapCalculator.jsx",
            "digitallydefined-online-local/src/pages/ROI.jsx"
        ]

        for calc in calculators:
            update_file(calc, lambda content: apply_component(content, self.design))

    # -------------------------------------------------------------------------
    # ICON FIXES
    # -------------------------------------------------------------------------

    def replace_icons(self):
        pages = [
            "digitallydefined-online-local/src/pages/Tools.jsx",
            "digitallydefined-online-local/src/pages/FreedomNumber.jsx",
            "digitallydefined-online-local/src/pages/Home.jsx",
            "digitallydefined-dashboard/src/pages/DashboardPage.jsx"
        ]

        for page in pages:
            update_file(
                page,
                lambda content: replace_with_svg_icons(
                    remove_emoji_icons(content),
                    self.design["icons"]
                )
            )
