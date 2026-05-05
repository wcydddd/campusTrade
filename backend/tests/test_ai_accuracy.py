"""
AI Category-Suggestion Accuracy Evaluation
==========================================

CA2 Aim 3.2 硬指标：在 50 张已标注的真实商品图上，
POST /ai/analyze 返回的 category 字段准确率应 ≥ 80%。

⚠️  这个测试**默认跳过**——它会真请求 OpenAI（每次约 $0.01-0.02）。
   要真实运行它必须：
     1. 在 .env 里设置真实的 OPENAI_API_KEY
     2. 把 50 张分类好的图放到 tests/ai_test_dataset/<Category>/
     3. 设置环境变量 RUN_AI_EVAL=1 再跑：
            RUN_AI_EVAL=1 pytest tests/test_ai_accuracy.py -v -s

数据集目录结构（5 个分类各 10 张图）：
    tests/ai_test_dataset/
    ├── Textbooks/   (1.jpg, 2.jpg, ..., 10.jpg)
    ├── Electronics/
    ├── Furniture/
    ├── Clothing/
    └── Kitchen/
"""
import os
from pathlib import Path
from collections import defaultdict

import pytest

# 直接从 utils 导入真实函数（绕开 conftest 里 routes.* 层的 mock）
from utils.ai_helper import analyze_image


# ── 配置 ─────────────────────────────────────────────────────────
DATASET_DIR = Path(__file__).parent / "ai_test_dataset"
ACCURACY_TARGET = 0.80
SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


# ── 默认跳过：避免误触发计费 + CI 环境跑不了 ─────────────────────
pytestmark = pytest.mark.skipif(
    os.getenv("RUN_AI_EVAL") != "1",
    reason=(
        "AI accuracy test requires real OpenAI API and is skipped by default. "
        "Set RUN_AI_EVAL=1 + valid OPENAI_API_KEY to run."
    ),
)


def _collect_images() -> list[tuple[Path, str]]:
    """
    扫描 ai_test_dataset/ 目录，返回 [(图片路径, 真值分类), ...]。
    分类名 = 子目录名。
    """
    if not DATASET_DIR.exists():
        return []

    pairs = []
    for category_dir in sorted(DATASET_DIR.iterdir()):
        if not category_dir.is_dir():
            continue
        truth = category_dir.name
        for img_file in sorted(category_dir.iterdir()):
            if img_file.suffix.lower() in SUPPORTED_EXTS:
                pairs.append((img_file, truth))
    return pairs


async def test_ai_category_accuracy_meets_target():
    """
    遍历数据集每张图 → 调真实 GPT-4o → 比对返回的 category vs 真值。
    打印混淆汇总，最后断言准确率 ≥ 80%。
    """
    images = _collect_images()
    if not images:
        pytest.skip(
            f"No images found in {DATASET_DIR}. "
            f"Prepare 50 labelled images first (see this file's docstring)."
        )

    results = []
    for img_path, truth in images:
        with open(img_path, "rb") as f:
            content = f.read()
        ai_result = await analyze_image(content)

        if not ai_result["success"]:
            predicted = "ERROR"
            note = ai_result.get("error", "")
        else:
            predicted = ai_result["data"]["category"]
            note = ""

        results.append({
            "image": str(img_path.relative_to(DATASET_DIR)),
            "truth": truth,
            "predicted": predicted,
            "match": predicted == truth,
            "note": note,
        })

    # ── 报告 ──
    total = len(results)
    correct = sum(1 for r in results if r["match"])
    accuracy = correct / total if total else 0

    print("\n" + "=" * 60)
    print(f"AI Category-Suggestion Accuracy Report")
    print("=" * 60)
    print(f"Dataset:  {total} images across "
          f"{len({r['truth'] for r in results})} categories")
    print(f"Correct:  {correct}/{total}")
    print(f"Accuracy: {accuracy:.2%}  (target ≥ {ACCURACY_TARGET:.0%})")
    print()

    # 按真值分类细分
    print("Per-category accuracy:")
    by_truth = defaultdict(list)
    for r in results:
        by_truth[r["truth"]].append(r)
    for truth in sorted(by_truth):
        rows = by_truth[truth]
        c = sum(1 for r in rows if r["match"])
        acc = c / len(rows) if rows else 0
        print(f"  {truth:<14s}: {c:>2}/{len(rows):<2}  ({acc:.0%})")
    print()

    # 错分明细
    misses = [r for r in results if not r["match"]]
    if misses:
        print("Misclassifications:")
        for r in misses:
            extra = f"  [{r['note']}]" if r["note"] else ""
            print(f"  {r['image']:<25s}  truth={r['truth']:<12s}"
                  f" predicted={r['predicted']}{extra}")
    print("=" * 60)

    # ── 断言 ──
    assert accuracy >= ACCURACY_TARGET, (
        f"AI accuracy {accuracy:.2%} below CA2 target {ACCURACY_TARGET:.0%}. "
        f"See per-category breakdown above for which categories underperform."
    )


# ── 单图调试用：方便排查"为什么 X 张错分类" ───────────────────────
async def test_single_image_debug():
    """
    可选辅助测试：跑数据集第一张图，打印 AI 完整输出。
    对调试 prompt 工程有用。
    通过 -k 选择跑：
        RUN_AI_EVAL=1 pytest -v -s -k test_single_image_debug
    """
    images = _collect_images()
    if not images:
        pytest.skip("No images in dataset.")

    img_path, truth = images[0]
    with open(img_path, "rb") as f:
        content = f.read()

    result = await analyze_image(content)
    print(f"\nImage: {img_path.name}  (truth: {truth})")
    print(f"Result: {result}")
    assert result["success"] is True
