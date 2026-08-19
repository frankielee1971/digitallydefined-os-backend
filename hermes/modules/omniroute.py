"""
OmniRoute Client for Hermes MCP
Unified AI gateway client that replaces direct calls to Groq, OpenRouter, ZAI, Nous, etc.

All AI requests flow through OmniRoute's single endpoint with auto-fallback support.
"""

import os
import requests
import json
from typing import Optional, List, Dict, Any, Callable
from .prompts.hermes_system_prompt import HERMES_SYSTEM_PROMPT


class OmniRouteClient:
    """OmniRoute unified AI gateway client."""
    
    def __init__(self):
        self.base_url = (os.getenv('OMNIROUTE_BASE_URL', 'https://omniroute.ai')).rstrip('/')
        self.api_key = os.getenv('OMNIROUTE_API_KEY', '').strip()
        self.default_model = os.getenv('OMNIROUTE_MODEL', 'openai/gpt-4o-mini').strip()
        
        if not self.api_key:
            raise ValueError("OMNIROUTE_API_KEY environment variable is not set")
    
    def _get_headers(self) -> Dict[str, str]:
        """Get request headers with authorization."""
        return {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
        }
    
    def _build_request_body(
        self,
        prompt: str,
        model: str,
        system_prompt: str = "You are a helpful AI assistant.",
        json_mode: bool = False,
        messages: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """Build the request body for OmniRoute API."""
        if messages is None:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ]
        
        body = {
            "model": model,
            "messages": messages,
        }
        
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        
        return body
    
    def call(
        self,
        prompt: str,
        model: Optional[str] = None,
        system_prompt: str = HERMES_SYSTEM_PROMPT,
        json_mode: bool = False,
        timeout: int = 60,
        fallback_models: Optional[List[str]] = None,
        messages: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Call OmniRoute with a prompt and optional parameters.
        
        Args:
            prompt: The user prompt/message
            model: Model override (default: OMNIROUTE_MODEL env or 'openai/gpt-4o-mini')
            system_prompt: System prompt override
            json_mode: Force JSON response mode
            timeout: Request timeout in seconds (default: 60)
            fallback_models: Models to try if primary fails
            messages: Pre-built messages array (overrides prompt)
        
        Returns:
            Dict with keys: reply, provider, model, error
        """
        if not prompt or not prompt.strip():
            return {
                'reply': '',
                'provider': None,
                'model': None,
                'error': 'Invalid prompt: must be a non-empty string',
            }
        
        model = model or self.default_model
        fallback_models = fallback_models or []
        models_to_try = [model] + [m for m in fallback_models if m]
        
        last_error = None
        
        for current_model in models_to_try:
            try:
                body = self._build_request_body(
                    prompt=prompt,
                    model=current_model,
                    system_prompt=system_prompt,
                    json_mode=json_mode,
                    messages=messages
                )
                
                response = requests.post(
                    f"{self.base_url}/v1/chat/completions",
                    headers=self._get_headers(),
                    json=body,
                    timeout=timeout
                )
                
                if not response.ok:
                    error_text = response.text
                    error_message = f"OmniRoute error: {response.status_code} {response.reason}"
                    
                    try:
                        error_json = response.json()
                        error_message += f" - {error_json.get('error', {}).get('message', error_text[:200])}"
                    except:
                        error_message += f" - {error_text[:200]}"
                    
                    raise Exception(error_message)
                
                data = response.json()
                raw_reply = data.get('choices', [{}])[0].get('message', {}).get('content', '')
                
                if not raw_reply:
                    raise Exception('OmniRoute returned empty response')
                
                return {
                    'reply': raw_reply,
                    'provider': 'omniroute',
                    'model': current_model,
                    'error': None,
                }
                
            except Exception as e:
                last_error = str(e)
                print(f"[OmniRoute] Model {current_model} failed: {last_error}")
                continue
        
        return {
            'reply': '',
            'provider': None,
            'model': None,
            'error': last_error or 'All OmniRoute models failed',
        }
    
    def call_with_messages(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        json_mode: bool = False,
        timeout: int = 60,
        fallback_models: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Call OmniRoute with a pre-built messages array.
        
        Args:
            messages: List of message dicts with 'role' and 'content' keys
            model: Model override
            json_mode: Force JSON response mode
            timeout: Request timeout in seconds
            fallback_models: Models to try if primary fails
        
        Returns:
            Dict with keys: reply, provider, model, error
        """
        if not messages:
            return {
                'reply': '',
                'provider': None,
                'model': None,
                'error': 'Invalid messages: must be a non-empty list',
            }
        
        model = model or self.default_model
        fallback_models = fallback_models or []
        models_to_try = [model] + [m for m in fallback_models if m]
        
        last_error = None
        
        for current_model in models_to_try:
            try:
                body = self._build_request_body(
                    prompt="",
                    model=current_model,
                    messages=messages,
                    json_mode=json_mode
                )
                
                response = requests.post(
                    f"{self.base_url}/v1/chat/completions",
                    headers=self._get_headers(),
                    json=body,
                    timeout=timeout
                )
                
                if not response.ok:
                    error_text = response.text
                    error_message = f"OmniRoute error: {response.status_code} {response.reason}"
                    
                    try:
                        error_json = response.json()
                        error_message += f" - {error_json.get('error', {}).get('message', error_text[:200])}"
                    except:
                        error_message += f" - {error_text[:200]}"
                    
                    raise Exception(error_message)
                
                data = response.json()
                raw_reply = data.get('choices', [{}])[0].get('message', {}).get('content', '')
                
                if not raw_reply:
                    raise Exception('OmniRoute returned empty response')
                
                return {
                    'reply': raw_reply,
                    'provider': 'omniroute',
                    'model': current_model,
                    'error': None,
                }
                
            except Exception as e:
                last_error = str(e)
                print(f"[OmniRoute] Model {current_model} failed: {last_error}")
                continue
        
        return {
            'reply': '',
            'provider': None,
            'model': None,
            'error': last_error or 'All OmniRoute models failed',
        }


# Singleton instance
_client: Optional[OmniRouteClient] = None


def get_client() -> OmniRouteClient:
    """Get or create the OmniRoute client singleton."""
    global _client
    if _client is None:
        _client = OmniRouteClient()
    return _client


def call_ai(
    prompt: str,
    model: Optional[str] = None,
    system_prompt: str = "You are a helpful AI assistant.",
    json_mode: bool = False,
    timeout: int = 60,
    fallback_models: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Convenience function to call OmniRoute AI.
    
    Args:
        prompt: The user prompt/message
        model: Model override
        system_prompt: System prompt override
        json_mode: Force JSON response mode
        timeout: Request timeout in seconds
        fallback_models: Models to try if primary fails
    
    Returns:
        Dict with keys: reply, provider, model, error
    """
    client = get_client()
    return client.call(
        prompt=prompt,
        model=model,
        system_prompt=system_prompt,
        json_mode=json_mode,
        timeout=timeout,
        fallback_models=fallback_models
    )


def call_ai_with_messages(
    messages: List[Dict[str, str]],
    model: Optional[str] = None,
    json_mode: bool = False,
    timeout: int = 60,
    fallback_models: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Convenience function to call OmniRoute AI with messages array.
    
    Args:
        messages: List of message dicts
        model: Model override
        json_mode: Force JSON response mode
        timeout: Request timeout in seconds
        fallback_models: Models to try if primary fails
    
    Returns:
        Dict with keys: reply, provider, model, error
    """
    client = get_client()
    return client.call_with_messages(
        messages=messages,
        model=model,
        json_mode=json_mode,
        timeout=timeout,
        fallback_models=fallback_models
    )