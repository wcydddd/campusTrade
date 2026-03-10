import openai
import base64
import json
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

# OpenAI 拒绝处理的关键词
REFUSAL_KEYWORDS = [
    "sorry", "can't", "cannot", "unable", "inappropriate",
    "not able", "i'm afraid", "i cannot", "i can't",
    "against my", "policy", "harmful", "dangerous"
]


async def analyze_image(image_data: bytes) -> dict:
    """
    使用 GPT-4 Vision 分析商品图片
    返回: {"success": bool, "data": {...}, "error": str}

    处理情况:
    1. 正常返回 JSON -> 解析并返回
    2. OpenAI 拒绝处理 -> 返回错误信息
    3. 网络/API 错误 -> 返回错误信息
    """
    base64_image = base64.b64encode(image_data).decode("utf-8")

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
        print("🔄 Calling OpenAI API...")

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

        result_text = response.choices[0].message.content.strip()
        print(f"🤖 AI 原始返回: {result_text[:200]}...")

        # 检查是否是拒绝消息
        result_lower = result_text.lower()
        for keyword in REFUSAL_KEYWORDS:
            if keyword in result_lower:
                print("⚠️ AI 拒绝处理此图片")
                return {
                    "success": False,
                    "error": "AI refused to process this image. The image may contain inappropriate or prohibited content (weapons, dangerous items, etc.).",
                    "ai_message": result_text,
                    "is_refused": True
                }

        # 清理可能的 markdown 格式
        cleaned_text = result_text
        if cleaned_text.startswith("```"):
            parts = cleaned_text.split("```")
            if len(parts) >= 2:
                cleaned_text = parts[1]
                if cleaned_text.startswith("json"):
                    cleaned_text = cleaned_text[4:]
                elif cleaned_text.startswith("JSON"):
                    cleaned_text = cleaned_text[4:]
        cleaned_text = cleaned_text.strip()

        # 尝试解析 JSON
        try:
            result = json.loads(cleaned_text)
        except json.JSONDecodeError as e:
            print(f"❌ JSON 解析失败: {e}")
            try:
                start = result_text.find("{")
                end = result_text.rfind("}") + 1
                if start != -1 and end > start:
                    json_str = result_text[start:end]
                    result = json.loads(json_str)
                    print("✅ 成功从文本中提取 JSON")
                else:
                    raise ValueError("No JSON found in response")
            except Exception as e2:
                return {
                    "success": False,
                    "error": f"Failed to parse AI response: {str(e)}",
                    "raw_response": result_text
                }

        # 验证必要字段
        required_fields = ["title", "description", "category", "keywords"]
        for field in required_fields:
            if field not in result:
                return {
                    "success": False,
                    "error": f"AI response missing required field: {field}",
                    "raw_response": result_text
                }

        # 验证 category 是否在列表中
        if result.get("category") not in CATEGORIES:
            print(f"⚠️ 未知分类 '{result.get('category')}'，改为 'Other'")
            result["category"] = "Other"

        # 确保 keywords 是列表
        if not isinstance(result.get("keywords"), list):
            result["keywords"] = []

        print(f"✅ AI 分析成功: {result.get('title')}")

        return {
            "success": True,
            "data": result
        }

    except openai.APIError as e:
        print(f"❌ OpenAI API 错误: {e}")
        return {
            "success": False,
            "error": f"OpenAI API error: {str(e)}"
        }
    except openai.AuthenticationError as e:
        print(f"❌ OpenAI 认证错误: {e}")
        return {
            "success": False,
            "error": "OpenAI API key is invalid or expired"
        }
    except openai.RateLimitError as e:
        print(f"❌ OpenAI 速率限制: {e}")
        return {
            "success": False,
            "error": "OpenAI rate limit exceeded. Please try again later."
        }
    except Exception as e:
        print(f"❌ 未知错误: {e}")
        return {
            "success": False,
            "error": f"AI analysis failed: {str(e)}"
        }


def get_categories() -> list:
    """返回所有可用的商品分类"""
    return CATEGORIES
