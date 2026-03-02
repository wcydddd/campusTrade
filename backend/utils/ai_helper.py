import json

import openai
import base64
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

    try:
        response = await client.chat.completions.create(
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
        
        # Parse returned JSON
        result_text = response.choices[0].message.content.strip()
        
        # Strip possible markdown formatting
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        result_text = result_text.strip()
        
        result = json.loads(result_text)
        
        # Verify category is in the list
        if result.get("category") not in CATEGORIES:
            result["category"] = "Other"
        
        return {
            "success": True,
            "data": result
        }
        
    except json.JSONDecodeError as e:
        return {
            "success": False,
            "error": f"Failed to parse AI response: {str(e)}"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"AI analysis failed: {str(e)}"
        }


def get_categories() -> list:
    """Return all available product categories"""
    return CATEGORIES
