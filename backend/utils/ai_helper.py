import openai
import base64
from config import settings

# 设置 OpenAI API Key
client = openai.OpenAI(api_key=settings.openai_api_key)

# 商品分类列表
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
    使用 GPT-4 Vision 分析商品图片
    返回: {"title": "...", "description": "...", "category": "...", "keywords": [...]}
    """
    
    # 将图片转为 base64
    base64_image = base64.b64encode(image_data).decode("utf-8")
    
    # 构建 prompt
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
        response = client.chat.completions.create(
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
        
        # 解析返回的 JSON
        result_text = response.choices[0].message.content.strip()
        
        # 清理可能的 markdown 格式
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        result_text = result_text.strip()
        
        import json
        result = json.loads(result_text)
        
        # 验证 category 是否在列表中
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
    """返回所有可用的商品分类"""
    return CATEGORIES