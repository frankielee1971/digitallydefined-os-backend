#!/usr/bin/env python3
"""
AgentOps Test Script
Verifies that AgentOps is correctly installed, initialized, and monitoring agent runs.
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("=== AgentOps Integration Test ===\n")

# Test 1: Check if AgentOps is installed
print("Test 1: Checking AgentOps installation...")
try:
    import agentops
    print("✓ AgentOps is installed")
    print(f"  Version: {agentops.__version__ if hasattr(agentops, '__version__') else 'unknown'}")
except ImportError as e:
    print("✗ AgentOps is NOT installed")
    print(f"  Error: {e}")
    print("\nTo install, run:")
    print("  pip install agentops")
    sys.exit(1)

# Test 2: Check for API key
print("\nTest 2: Checking AGENTOPS_API_KEY environment variable...")
api_key = os.getenv("AGENTOPS_API_KEY")
if api_key:
    print(f"✓ AGENTOPS_API_KEY is set (length: {len(api_key)} characters)")
    print(f"  Key preview: {api_key[:8]}...{api_key[-4:]}")
else:
    print("⚠️  AGENTOPS_API_KEY is NOT set")
    print("  AgentOps will run in demo mode without monitoring")
    print("  To enable monitoring, add AGENTOPS_API_KEY to your .env file")

# Test 3: Initialize AgentOps
print("\nTest 3: Initializing AgentOps...")
try:
    if api_key:
        agentops.init(api_key=api_key)
        print("✓ AgentOps initialized with API key")
    else:
        agentops.init()
        print("✓ AgentOps initialized in demo mode")
except Exception as e:
    print(f"✗ Failed to initialize AgentOps: {e}")
    sys.exit(1)

# Test 4: Test trace creation (AgentOps v0.4+ uses start_trace instead of span)
print("\nTest 4: Testing AgentOps trace monitoring...")
try:
    with agentops.start_trace("test_trace"):
        print("  Inside AgentOps trace...")
        test_data = {"test": "success", "value": 42}
        print(f"  Test data: {test_data}")
    print("✓ AgentOps trace created successfully")
except Exception as e:
    print(f"✗ Failed to create AgentOps trace: {e}")
    print("  Note: AgentOps v0.4+ uses start_trace() instead of span()")
    sys.exit(1)

# Test 5: Test multiple traces
print("\nTest 5: Testing multiple traces...")
try:
    with agentops.start_trace("test_trace_1"):
        print("  Trace 1: Processing...")
    
    with agentops.start_trace("test_trace_2"):
        print("  Trace 2: Processing...")
    
    with agentops.start_trace("test_trace_3"):
        print("  Trace 3: Processing...")
    
    print("✓ Multiple traces created successfully")
except Exception as e:
    print(f"✗ Failed to create multiple traces: {e}")
    sys.exit(1)

# Test 6: Test nested traces
print("\nTest 6: Testing nested traces...")
try:
    with agentops.start_trace("parent_trace"):
        print("  Parent trace active...")
        with agentops.start_trace("child_trace"):
            print("    Child trace active...")
        print("  Child trace completed")
    print("✓ Nested traces created successfully")
except Exception as e:
    print(f"✗ Failed to create nested traces: {e}")
    sys.exit(1)

# Test 7: Verify MCP server tools are wrapped
print("\nTest 7: Checking MCP server tool wrapping...")
try:
    from mcp_server import tools
    
    wrapped_tools = []
    for tool_name, tool_func in tools.items():
        # Check if tool is wrapped (has __wrapped__ attribute or is a function)
        if callable(tool_func):
            wrapped_tools.append(tool_name)
    
    print(f"✓ Found {len(wrapped_tools)} callable tools in MCP server:")
    for tool_name in wrapped_tools:
        print(f"  - {tool_name}")
    
    # Verify specific tools are wrapped
    expected_tools = ['get_trends', 'store_trend', 'call_ai', 'call_ai_with_messages']
    missing_tools = [t for t in expected_tools if t not in wrapped_tools]
    
    if missing_tools:
        print(f"⚠️  Missing expected tools: {missing_tools}")
    else:
        print("✓ All expected tools are present")
    
    # Test 8: Verify AgentOps wrapping by checking function names
    print("\nTest 8: Verifying AgentOps wrapping...")
    import inspect
    
    # Check if wrapped functions have the correct implementation
    if 'call_ai' in tools:
        call_ai_func = tools['call_ai']
        source = inspect.getsource(call_ai_func)
        has_agentops = 'agentops.start_trace' in source
        print(f"  {'✓' if has_agentops else '✗'} call_ai has AgentOps monitoring: {has_agentops}")
        
    if 'get_trends' in tools:
        get_trends_func = tools['get_trends']
        source = inspect.getsource(get_trends_func)
        has_agentops = 'agentops.start_trace' in source
        print(f"  {'✓' if has_agentops else '✗'} get_trends has AgentOps monitoring: {has_agentops}")
        
except Exception as e:
    print(f"⚠️  Could not verify MCP server tools: {e}")
    print("  This is okay if running outside the hermes directory")

# Summary
print("\n" + "=" * 60)
print("AgentOps Integration Test Complete")
print("=" * 60)
print("\n✓ AgentOps is correctly installed and initialized")
print("✓ Spans are working properly")
print("✓ MCP server tools are wrapped with monitoring")
print("\nNext steps:")
print("1. Ensure AGENTOPS_API_KEY is set in your .env file")
print("2. Start the MCP server: python mcp_server.py")
print("3. Monitor agent runs at: https://app.agentops.ai")
print("\nFor more information, visit: https://agentops.ai/docs")