import json

import openai
import base64
import re
from config import settings

# Use async client to avoid sync connection errors in FastAPI async event loop
client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

# Product category list
CATEGORIES = [
    "Electronics",
    "Textbooks", 
    "Furniture",
    "Clothing",
    "Sports",
    "Kitchen",
    "Stationery",
    "Other"
]

async def analyze_image(image_data: bytes) -> dict:
    """
    Analyze product image using GPT-4 Vision
    Returns: {"title": "...", "description": "...", "category": "...", "keywords": [...]}
    """
    
    # Convert image to base64
    base64_image = base64.b64encode(image_data).decode("utf-8")
    
    # Build prompt
    prompt = f"""Analyze this product image for a campus second-hand marketplace.

Please provide:
1. A concise product title (5-10 words)
2. A detailed description (40-60 words) highlighting condition, features, and appeal to students
3. The most appropriate category from this list: {', '.join(CATEGORIES)}
4. 3-5 relevant search keywords

Respond in this exact JSON format:
{{
    "title": "Product title here",
    "description": "Product description here",
    "category": "Category from list",
    "keywords": ["keyword1", "keyword2", "keyword3"]
}}

Only respond with the JSON, no other text."""

    async def _call_once():
        return await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=500
        )

    def _try_parse_result_text(result_text: str):
        if not result_text:
            raise json.JSONDecodeError("empty response", "", 0)

        cleaned = result_text.strip()

        # Strip possible markdown formatting
        if cleaned.startswith("```"):
            parts = cleaned.split("```")
            if len(parts) >= 2:
                cleaned = parts[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
        cleaned = cleaned.strip()

        # First try: parse as whole JSON
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass

        # Fallback: extract first JSON object from text
        m = re.search(r"\{[\s\S]*\}", cleaned)
        if m:
            return json.loads(m.group(0))

        raise json.JSONDecodeError("no json object found", cleaned, 0)

    try:
        last_err = None
        for _ in range(2):  # retry once for occasional malformed outputs
            try:
                response = await _call_once()
                content = response.choices[0].message.content
                if isinstance(content, str):
                    result_text = content
                elif isinstance(content, list):
                    texts = [c.get("text", "") for c in content if isinstance(c, dict)]
                    result_text = "".join(texts)
                else:
                    result_text = ""

                result = _try_parse_result_text(result_text)

                # Verify category is in the list
                if result.get("category") not in CATEGORIES:
                    result["category"] = "Other"

                return {
                    "success": True,
                    "data": result
                }
            except json.JSONDecodeError as e:
                last_err = e
                continue

        return {
            "success": False,
            "error": f"Failed to parse AI response: {str(last_err)}"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"AI analysis failed: {str(e)}"
        }


def get_categories() -> list:
    """Return all available product categories"""
    return CATEGORIES
