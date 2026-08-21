# digitallydefined_unified_figma_enforcer.py
# DigitallyDefined Unified System + Figma MCP Layout Enforcer

from mcp import Skill
from figma_mcp import FigmaClient
from utils.file_ops import update_file, apply_component
from utils.agents import ensure_agent_available
from utils.brand import apply_brand_tokens, remove_emoji_icons, replace_with_figma_icons

class DigitallyDefinedUnifiedFigmaEnforcer(Skill):
    """
    Ensures Hermes uses all three DigitallyDefined folders together (website, dashboard, backend),
    applies the Figma design system, replaces emoji icons with real Figma icons, fixes layout,
    spacing, cards, CTAs, calculators, and guarantees agent availability.
    """

    def __init__(self):
        self.figma = FigmaClient()

    def run(self, params):
        # 1. Load Figma design system
        design = self.figma.get_design_system()

        # 2. Apply brand tokens (colors, spacing, typography)
        apply_brand_tokens(design)

        # 3. Fix website pages
        self.fix_website_pages(design)

        # 4. Fix dashboard pages
        self.fix_dashboard_pages(design)

        # 5. Fix calculators
        self.fix_calculators(design)

        # 6. Remove emoji icons + replace with Figma icons
        self.replace_icons(design)

        # 7. Ensure agents are available
        ensure_agent_available()

        return {
            "status": "success",
            "message": "DigitallyDefined unified system updated using Figma design system, real icons, and full agent integration."
        }

    # -------------------------------------------------------------------------
    # WEBSITE FIXES
    # -------------------------------------------------------------------------

    def fix_website_pages(self, design):
        pages = [
            "digitallydefined-online-local/src/pages/Tools.jsx",
            "digitallydefined-online-local/src/pages/FreedomNumber.jsx",
            "digitallydefined-online-local/src/pages/GapCalculator.jsx",
            "digitallydefined-online-local/src/pages/NicheScorecard.jsx",
            "digitallydefined-online-local/src/pages/ROI.jsx",
            "digitallydefined-online-local/src/pages/Home.jsx"
        ]

        for page in pages:
            update_file(page, lambda content: apply_component(content, design))

    # -------------------------------------------------------------------------
    # DASHBOARD FIXES
    # -------------------------------------------------------------------------

    def fix_dashboard_pages(self, design):
        pages = [
            "digitallydefined-dashboard/src/pages/DashboardPage.jsx",
            "digitallydefined-dashboard/src/pages/AnalyticsPage.jsx",
            "digitallydefined-dashboard/src/pages/AssistantPage.jsx"
        ]

        for page in pages:
            update_file(page, lambda content: apply_component(content, design))

    # -------------------------------------------------------------------------
    # CALCULATOR FIXES
    # -------------------------------------------------------------------------

    def fix_calculators(self, design):
        calculators = [
            "digitallydefined-online-local/src/pages/FreedomNumber.jsx",
            "digitallydefined-online-local/src/pages/GapCalculator.jsx",
            "digitallydefined-online-local/src/pages/ROI.jsx"
        ]

        for calc in calculators:
            update_file(calc, lambda content: apply_component(content, design))

    # -------------------------------------------------------------------------
    # ICON FIXES
    # -------------------------------------------------------------------------

    def replace_icons(self, design):
        """
        Removes emoji icons and replaces them with Figma icons.
        Ensures icons are thin-line, minimal, black, and consistent.
        """

        pages = [
            "digitallydefined-online-local/src/pages/Tools.jsx",
            "digitallydefined-online-local/src/pages/FreedomNumber.jsx",
            "digitallydefined-online-local/src/pages/Home.jsx",
            "digitallydefined-dashboard/src/pages/DashboardPage.jsx"
        ]

        for page in pages:
            update_file(
                page,
                lambda content: replace_with_figma_icons(
                    remove_emoji_icons(content),
                    design
                )
            )
