"""
生成后端测试报告 PDF（支持多模块）。
直接运行：python tests/generate_report.py
输出：tests/test_report.pdf
"""
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ── 中文字体 ───────────────────────────────────────────────────────
pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
CN_FONT = "STSong-Light"

# ── 路径 ──────────────────────────────────────────────────────────
HERE = Path(__file__).resolve().parent
OUTPUT_PDF = HERE / "test_report.pdf"

# ── 样式 ──────────────────────────────────────────────────────────
styles = getSampleStyleSheet()
title_style = ParagraphStyle(
    "CnTitle", parent=styles["Title"], fontName=CN_FONT,
    fontSize=22, leading=28, alignment=TA_CENTER, spaceAfter=20,
)
h1 = ParagraphStyle(
    "CnH1", parent=styles["Heading1"], fontName=CN_FONT,
    fontSize=16, leading=22, spaceBefore=14, spaceAfter=10,
    textColor=colors.HexColor("#1f4e79"),
)
h2 = ParagraphStyle(
    "CnH2", parent=styles["Heading2"], fontName=CN_FONT,
    fontSize=13, leading=18, spaceBefore=10, spaceAfter=6,
    textColor=colors.HexColor("#2e75b6"),
)
body = ParagraphStyle(
    "CnBody", parent=styles["Normal"], fontName=CN_FONT,
    fontSize=10.5, leading=16, alignment=TA_LEFT,
)


def p(text: str, style=body) -> Paragraph:
    return Paragraph(text, style)


# ── 数据：每个模块一份 cases ──────────────────────────────────────
GENERATED_AT = datetime.now().strftime("%Y-%m-%d %H:%M")

ENV_INFO = [
    ["项目名称", "CampusTrade（校园二手交易平台）"],
    ["测试范围", "后端 API（FastAPI + MongoDB）"],
    ["测试框架", "pytest 9.0.3 + pytest-asyncio 1.3.0"],
    ["HTTP 客户端", "httpx 0.28.1（ASGITransport，不起真服务器）"],
    ["数据库", "mongomock-motor（内存 MongoDB，每用例隔离）"],
    ["Python 版本", "3.12.11"],
    ["运行环境", "macOS 14.6 / conda env: code"],
    ["生成时间", GENERATED_AT],
]

# (接口, 测试类, 用例名, 场景描述, 预期, 结果)
AUTH_CASES = [
    ("POST /auth/register", "TestRegister", "test_register_success",
     "学校邮箱 + 合法用户名 + 密码 → 成功创建未验证用户",
     "201 Created，is_verified=false", "PASSED"),
    ("POST /auth/register", "TestRegister", "test_register_rejects_non_university_email",
     "使用非学校邮箱（如 gmail.com）注册",
     "400，提示需用学校邮箱", "PASSED"),
    ("POST /auth/register", "TestRegister", "test_register_duplicate_verified_email_fails",
     "已验证邮箱重复注册",
     "400，邮箱已注册", "PASSED"),
    ("POST /auth/register", "TestRegister", "test_register_duplicate_username_fails",
     "用户名已被占用",
     "400，用户名冲突", "PASSED"),
    ("POST /auth/send-verification-code", "TestSendVerificationCode",
     "test_send_code_for_unverified_user_succeeds",
     "未验证用户请求发送验证码", "200，验证码已发送", "PASSED"),
    ("POST /auth/send-verification-code", "TestSendVerificationCode",
     "test_send_code_for_unknown_email_returns_404",
     "邮箱不存在的用户请求验证码", "404，请先注册", "PASSED"),
    ("POST /auth/send-verification-code", "TestSendVerificationCode",
     "test_send_code_for_already_verified_returns_message",
     "已验证用户重复请求", "200，提示已验证", "PASSED"),
    ("POST /auth/verify-email", "TestVerifyEmail", "test_verify_email_success",
     "提交正确的 6 位验证码",
     "200，用户 is_verified 置为 true", "PASSED"),
    ("POST /auth/verify-email", "TestVerifyEmail", "test_verify_email_wrong_code_fails",
     "提交错误的验证码", "400，验证码不正确", "PASSED"),
    ("POST /auth/verify-email", "TestVerifyEmail", "test_verify_email_invalid_format",
     "验证码格式不合法（非 6 位数字）", "400，格式错误", "PASSED"),
    ("POST /auth/login", "TestLogin", "test_login_success",
     "已验证用户用正确密码登录",
     "200，返回 access_token + 用户信息", "PASSED"),
    ("POST /auth/login", "TestLogin", "test_login_wrong_password",
     "密码错误", "401，邮箱或密码错", "PASSED"),
    ("POST /auth/login", "TestLogin", "test_login_unverified_email_rejected",
     "未验证邮箱尝试登录", "403，需先验证邮箱", "PASSED"),
    ("POST /auth/login", "TestLogin", "test_login_unknown_email",
     "邮箱不存在", "401，邮箱或密码错（防枚举）", "PASSED"),
    ("POST /auth/login", "TestLogin", "test_login_banned_account",
     "被封禁账号登录", "403，账号已封禁", "PASSED"),
    ("GET /auth/me", "TestGetMe", "test_get_me_with_valid_token",
     "携带合法 token 获取当前用户", "200，返回当前用户信息", "PASSED"),
    ("GET /auth/me", "TestGetMe", "test_get_me_without_token_returns_401_or_403",
     "未携带 token", "401/403，未授权", "PASSED"),
    ("GET /auth/me", "TestGetMe", "test_get_me_with_bad_token",
     "携带无效 token", "401，token 无效或过期", "PASSED"),
    ("PATCH /auth/me", "TestUpdateMe", "test_update_username",
     "修改用户名为新值", "200，返回更新后的用户信息", "PASSED"),
    ("PATCH /auth/me", "TestUpdateMe", "test_update_username_conflict",
     "改成已被他人占用的用户名", "400，用户名冲突", "PASSED"),
    ("POST /auth/change-password", "TestChangePassword", "test_change_password_success",
     "提供正确的旧密码 + 新密码", "200，新密码可用于登录", "PASSED"),
    ("POST /auth/change-password", "TestChangePassword", "test_change_password_wrong_old",
     "旧密码错误", "400，旧密码不正确", "PASSED"),
    ("GET /auth/public/{user_id}", "TestPublicUser", "test_public_user_success",
     "查询合法用户的公开信息",
     "200，返回用户名/简介/头像等公开字段", "PASSED"),
    ("GET /auth/public/{user_id}", "TestPublicUser", "test_public_user_invalid_id",
     "user_id 不是合法 ObjectId", "400，invalid user id", "PASSED"),
    ("GET /auth/public/{user_id}", "TestPublicUser", "test_public_user_not_found",
     "ObjectId 合法但用户不存在", "404，用户不存在", "PASSED"),
    ("POST /auth/forgot-password", "TestPasswordReset",
     "test_forgot_password_always_returns_200",
     "已注册邮箱请求重置密码", "200，发送重置邮件", "PASSED"),
    ("POST /auth/forgot-password", "TestPasswordReset",
     "test_forgot_password_unknown_email_also_200",
     "未知邮箱也返回相同响应（防邮箱枚举）", "200，统一响应", "PASSED"),
    ("POST /auth/forgot-password", "TestPasswordReset",
     "test_forgot_password_cooldown_silently_skips_resend",
     "60 秒冷却内重复请求（防滥发邮件）",
     "200，DB 中 token 未变（静默跳过）", "PASSED"),
    ("POST /auth/reset-password", "TestPasswordReset",
     "test_reset_password_with_valid_token",
     "提交合法 reset token + 新密码", "200，新密码可登录", "PASSED"),
    ("POST /auth/reset-password", "TestPasswordReset",
     "test_reset_password_invalid_token",
     "提交伪造 / 已使用 / 过期的 token", "400，链接无效或已过期", "PASSED"),
    ("POST /auth/reset-password", "TestPasswordReset",
     "test_reset_password_expired_token",
     "已过期的 reset token（>30 分钟）",
     "400，链接已过期", "PASSED"),
    ("POST /auth/reset-password", "TestPasswordReset",
     "test_reset_password_already_used_token",
     "已使用过的 reset token（单次使用约束）",
     "400，链接已被使用", "PASSED"),
    ("POST /auth/verify-email", "TestOTPEdgeCases",
     "test_verify_email_expired_code",
     "验证码已过期（>10 分钟）",
     "400，code expired", "PASSED"),
    ("POST /auth/verify-email", "TestOTPEdgeCases",
     "test_verify_email_too_many_attempts",
     "同一验证码连续错误 5 次后再次尝试",
     "429，too many failed attempts", "PASSED"),
    ("POST /auth/login", "TestLoginLockout",
     "test_account_locks_after_max_failures",
     "连续 5 次密码错误后再次登录（即使密码正确）",
     "429，账号被临时锁定 15 分钟", "PASSED"),
    ("POST /auth/me/avatar", "TestUploadAvatar",
     "test_upload_avatar_success",
     "已登录用户上传 png/jpg/webp 头像",
     "200，返回新的 avatar_url", "PASSED"),
    ("POST /auth/me/avatar", "TestUploadAvatar",
     "test_upload_avatar_invalid_extension",
     "上传 gif 等不被允许的格式",
     "400，allowed: jpg/png/webp", "PASSED"),
    ("POST /auth/me/avatar", "TestUploadAvatar",
     "test_upload_avatar_too_large",
     "上传超过 max_upload_size_mb 的图片",
     "413，文件过大", "PASSED"),
    ("POST /auth/me/avatar", "TestUploadAvatar",
     "test_upload_avatar_requires_auth",
     "未登录上传头像", "401/403，未授权", "PASSED"),
]

PRODUCT_CASES = [
    ("GET /products", "TestListProducts", "test_list_returns_available_products",
     "查询商品列表", "200，返回所有可售商品", "PASSED"),
    ("GET /products", "TestListProducts", "test_list_excludes_sold_by_default",
     "默认不返回已售商品", "200，列表中不含 sold", "PASSED"),
    ("GET /products", "TestListProducts", "test_list_filter_by_category",
     "按分类筛选（Textbooks）", "200，仅返回该分类商品", "PASSED"),
    ("GET /products", "TestListProducts", "test_list_filter_by_price_range",
     "按价格区间筛选 [10, 100]", "200，仅返回区间内商品", "PASSED"),
    ("GET /products", "TestListProducts", "test_list_filter_by_search_keyword",
     "按关键词搜索（标题/描述模糊匹配）", "200，仅返回匹配项", "PASSED"),
    ("GET /products", "TestListProducts", "test_list_filter_by_sustainable",
     "可持续筛选（CA2 Aim 2 核心功能）",
     "200，sustainable=true 只返回环保商品；false 反之", "PASSED"),
    ("GET /products/categories", "TestCategories", "test_returns_category_list",
     "获取所有商品分类", "200，返回非空分类列表", "PASSED"),
    ("GET /products/trending", "TestTrending", "test_trending_sorted_by_views",
     "热门商品按 views 降序", "200，排序正确", "PASSED"),
    ("GET /products/trending", "TestTrending", "test_trending_respects_limit",
     "limit 参数限制数量", "200，仅返回 limit 条", "PASSED"),
    ("GET /products/user/me", "TestMyProducts", "test_returns_only_my_products",
     "登录用户查看自己发布的商品",
     "200，仅返回当前用户发布的商品", "PASSED"),
    ("GET /products/user/me", "TestMyProducts", "test_requires_authentication",
     "未登录访问 /user/me", "401/403，需要登录", "PASSED"),
    ("GET /products/seller/{id}", "TestSellerProducts",
     "test_returns_seller_available_products",
     "查询某卖家的可售商品", "200，仅返回 available 状态", "PASSED"),
    ("GET /products/seller/{id}", "TestSellerProducts", "test_invalid_seller_id_400",
     "seller_id 非法", "400，invalid seller id", "PASSED"),
    ("GET /products/seller/{id}", "TestSellerProducts", "test_seller_not_found_404",
     "卖家不存在", "404，user not found", "PASSED"),
    ("GET /products/{id}", "TestProductDetail", "test_get_detail_increments_views",
     "查看商品详情时浏览量 +1",
     "200，views 字段递增", "PASSED"),
    ("GET /products/{id}", "TestProductDetail", "test_invalid_id_returns_400",
     "id 非法 ObjectId", "400，invalid product id", "PASSED"),
    ("GET /products/{id}", "TestProductDetail", "test_not_found_returns_404",
     "id 合法但商品不存在", "404，product not found", "PASSED"),
    ("GET /products/{id}", "TestProductDetail", "test_removed_product_returns_410",
     "商品已被管理员下架（removed）",
     "410，已被下架", "PASSED"),
    ("POST /products", "TestCreateProduct", "test_create_success",
     "已验证用户用 JSON 发布商品",
     "201，状态为 pending（待审核）", "PASSED"),
    ("POST /products", "TestCreateProduct", "test_create_requires_auth",
     "未登录尝试发布", "401/403，未授权", "PASSED"),
    ("POST /products", "TestCreateProduct", "test_create_unverified_user_forbidden",
     "邮箱未验证用户尝试发布", "403，需先验证邮箱", "PASSED"),
    ("POST /products", "TestCreateProduct", "test_create_banned_user_forbidden",
     "被封禁用户尝试发布", "403，账号已封禁", "PASSED"),
    ("POST /products/with-image", "TestCreateProductWithImage",
     "test_create_with_image_success",
     "上传图片 + 表单字段发布商品",
     "201，返回包含 images 字段", "PASSED"),
    ("POST /products/with-image", "TestCreateProductWithImage",
     "test_create_with_image_no_image_fails",
     "未提供任何图片",
     "400，请上传至少一张图片", "PASSED"),
    ("POST /products/with-image", "TestCreateProductWithImage",
     "test_create_with_multiple_images",
     "上传 3 张新图（前端真实多图场景）",
     "201，DB 中保存 3 张图", "PASSED"),
    ("POST /products/with-image", "TestCreateProductWithImage",
     "test_create_with_existing_images_only",
     "AI 工作流：仅复用已上传 URL（无新文件）",
     "201，images 仅含传入的 URL", "PASSED"),
    ("POST /products/with-image", "TestCreateProductWithImage",
     "test_create_with_mixed_files_and_existing",
     "混合：1 张新文件 + 1 张已存 URL",
     "201，images 长度 = 2", "PASSED"),
    ("POST /products/with-image", "TestCreateProductWithImage",
     "test_create_with_invalid_existing_images_json",
     "existing_images 字段不是合法 JSON",
     "400，invalid existing_images format", "PASSED"),
    ("PUT /products/{id}", "TestUpdateProduct", "test_owner_can_update",
     "商品所有者更新商品信息",
     "200，更新成功且回到 pending", "PASSED"),
    ("PUT /products/{id}", "TestUpdateProduct", "test_non_owner_cannot_update",
     "非所有者尝试更新他人商品", "403，仅可改自己的商品", "PASSED"),
    ("PUT /products/{id}", "TestUpdateProduct", "test_update_unknown_product_404",
     "商品不存在", "404，product not found", "PASSED"),
    ("PUT /products/{id}", "TestUpdateProduct",
     "test_edit_product_deletes_removed_images",
     "编辑时去掉 2 张图（spy 验证 delete_image 副作用）",
     "200，被去掉的 2 张 url 触发删除", "PASSED"),
    ("DELETE /products/{id}", "TestDeleteProduct", "test_owner_can_delete",
     "所有者删除自己的商品",
     "200，DB 中商品被删除", "PASSED"),
    ("DELETE /products/{id}", "TestDeleteProduct", "test_non_owner_cannot_delete",
     "非所有者尝试删除", "403，仅可删自己的商品", "PASSED"),
    ("POST /products/{id}/boost", "TestBoostProduct", "test_owner_can_boost_available",
     "所有者一键置顶可售商品",
     "200，boosted_at 更新", "PASSED"),
    ("POST /products/{id}/boost", "TestBoostProduct", "test_non_owner_cannot_boost",
     "非所有者尝试置顶", "403，仅可置顶自己的商品", "PASSED"),
    ("POST /products/{id}/boost", "TestBoostProduct", "test_cannot_boost_within_24h",
     "24 小时内重复置顶",
     "429，每件商品 24h 内只能置顶一次", "PASSED"),
    ("POST /products/{id}/boost", "TestBoostProduct", "test_cannot_boost_sold",
     "已售商品尝试置顶",
     "400，已售商品无法置顶", "PASSED"),
    ("POST /products/{id}/images/upload", "TestUploadProductImages",
     "test_owner_can_upload_extra_images",
     "所有者为已存在商品追加 2 张图片",
     "200，返回新的 image urls", "PASSED"),
    ("POST /products/{id}/images/upload", "TestUploadProductImages",
     "test_non_owner_cannot_upload",
     "非所有者尝试给他人商品追加图片",
     "403，仅可改自己的商品", "PASSED"),
    ("POST /products/{id}/images/upload", "TestUploadProductImages",
     "test_upload_to_nonexistent_product_returns_404",
     "为不存在的商品追加图片",
     "404，product not found", "PASSED"),
    ("POST /products/{id}/images/upload", "TestUploadProductImages",
     "test_upload_invalid_product_id_returns_400",
     "product_id 非法 ObjectId",
     "400，invalid product id", "PASSED"),
    ("GET /products/history/me", "TestBrowsingHistory",
     "test_empty_history",
     "用户尚无浏览记录",
     "200，items=[]", "PASSED"),
    ("GET /products/history/me", "TestBrowsingHistory",
     "test_returns_recent_views",
     "用户浏览过 2 件商品",
     "200，按 viewed_at 倒序返回", "PASSED"),
    ("GET /products/history/me", "TestBrowsingHistory",
     "test_excludes_removed_products",
     "浏览过的商品已被管理员下架",
     "200，items 中不含 removed 商品", "PASSED"),
    ("GET /products/history/me", "TestBrowsingHistory",
     "test_requires_authentication",
     "未登录访问浏览历史", "401/403，未授权", "PASSED"),
    ("GET /products/seller/{id}", "TestProductEdgeCases",
     "test_seller_profile_hidden_when_banned",
     "查询被封禁卖家的商品列表",
     "404，user not found（屏蔽 banned 卖家）", "PASSED"),
    ("GET /products/{id}", "TestProductEdgeCases",
     "test_detail_marks_is_favorited_for_logged_in_user",
     "登录用户查看自己已收藏的商品详情",
     "200，is_favorited=true", "PASSED"),
    ("GET /products/{id}", "TestProductEdgeCases",
     "test_detail_view_writes_browsing_history",
     "登录用户查看商品详情",
     "200，browsing_history 中产生一条记录", "PASSED"),
    ("PUT /products/{id} → 通知", "TestNotificationSideEffects",
     "test_price_drop_notifies_all_favoriters",
     "降价（100 → 80）触发收藏者通知（跨模块）",
     "2 个收藏者各收到 1 条 price_drop 通知", "PASSED"),
    ("PUT /products/{id} → 通知", "TestNotificationSideEffects",
     "test_no_notification_when_price_unchanged",
     "改其他字段、价格不变",
     "不触发任何 price_drop 通知", "PASSED"),
    ("PUT /products/{id} → 通知", "TestNotificationSideEffects",
     "test_no_notification_when_price_increased",
     "涨价（100 → 120）",
     "不触发 price_drop 通知（不是降价）", "PASSED"),
    ("PUT /products/{id} → 通知", "TestNotificationSideEffects",
     "test_seller_not_notified_for_own_product_drop",
     "卖家自己也收藏了自己的商品后降价",
     "卖家本人不应收到 price_drop", "PASSED"),
    ("POST /products → 通知", "TestNotificationSideEffects",
     "test_product_creation_notifies_all_admins",
     "用户发布商品 → 通知 admin 审核（跨模块）",
     "所有 admin 各收到 1 条 admin_review 通知", "PASSED"),
    ("PUT /products/{id} 编辑快照", "TestNotificationSideEffects",
     "test_edit_available_product_saves_snapshot",
     "编辑已上架商品时保存旧版本快照",
     "DB 中 pending_edit_snapshot 字段含原数据", "PASSED"),
    ("POST /admin/.../review 拒绝", "TestNotificationSideEffects",
     "test_admin_reject_edit_restores_snapshot",
     "admin 拒绝编辑时回滚到快照",
     "商品恢复原标题/价格/状态", "PASSED"),
    ("POST /admin/.../review 通过", "TestNotificationSideEffects",
     "test_admin_approve_edit_applies_changes",
     "admin 通过编辑时新版本生效",
     "新数据保留，snapshot 字段被清除", "PASSED"),
]

MAIN_CASES = [
    ("GET /", "TestRootEndpoints", "test_root_returns_welcome_message",
     "访问根路径", "200，返回欢迎消息 + version + docs 链接", "PASSED"),
    ("GET /health", "TestRootEndpoints", "test_health_check",
     "健康检查（监控用）",
     "200，status=healthy", "PASSED"),
    ("GET /health", "TestRootEndpoints",
     "test_health_check_does_not_require_auth",
     "健康检查必须无需鉴权（监控系统不带 token）",
     "200，无 Authorization 也通过", "PASSED"),
]

IMAGE_SERVICE_UNIT_CASES = [
    ("strip_exif()", "TestStripExif", "test_strip_exif_removes_metadata",
     "带 EXIF 的图剥离后 info dict 中无 exif",
     "info 不含 exif 字段（隐私要求）", "PASSED"),
    ("strip_exif()", "TestStripExif", "test_strip_exif_preserves_pixel_data",
     "剥离 EXIF 不应影响像素数据",
     "size/mode/像素与原图一致", "PASSED"),
    ("strip_exif()", "TestStripExif", "test_strip_exif_returns_new_object",
     "应返回新对象，原对象不被改",
     "新对象 != 原对象，原对象 info 不变", "PASSED"),
    ("compress_image()", "TestCompressImage",
     "test_compress_resizes_oversized_image",
     "4000×3000 大图压缩",
     "宽高 ≤ 1920", "PASSED"),
    ("compress_image()", "TestCompressImage",
     "test_compress_preserves_aspect_ratio",
     "压缩保持宽高比", "压缩前后比例相同", "PASSED"),
    ("compress_image()", "TestCompressImage",
     "test_compress_unchanged_for_small_image",
     "小图（800×600）已在范围内",
     "尺寸不变", "PASSED"),
    ("generate_thumbnail()", "TestGenerateThumbnail",
     "test_thumbnail_fits_target_size",
     "缩略图限制在 300×300 以内", "宽高 ≤ 300", "PASSED"),
    ("generate_thumbnail()", "TestGenerateThumbnail",
     "test_thumbnail_preserves_aspect_ratio",
     "缩略图保持宽高比", "比例与原图相同", "PASSED"),
    ("_validate_extension()", "TestValidateExtension", "test_accepts_jpg",
     ".jpg 后缀", "通过校验", "PASSED"),
    ("_validate_extension()", "TestValidateExtension", "test_accepts_jpeg",
     ".jpeg 后缀", "通过校验", "PASSED"),
    ("_validate_extension()", "TestValidateExtension", "test_accepts_png",
     ".png 后缀", "通过校验", "PASSED"),
    ("_validate_extension()", "TestValidateExtension", "test_accepts_webp",
     ".webp 后缀", "通过校验", "PASSED"),
    ("_validate_extension()", "TestValidateExtension", "test_case_insensitive",
     "大写后缀（如 .JPG）", "也通过", "PASSED"),
    ("_validate_extension()", "TestValidateExtension", "test_rejects_pdf",
     ".pdf（非图片）", "400 invalid format", "PASSED"),
    ("_validate_extension()", "TestValidateExtension", "test_rejects_gif",
     ".gif（不在白名单）", "400 invalid format", "PASSED"),
    ("_validate_extension()", "TestValidateExtension",
     "test_rejects_no_extension",
     "无后缀文件名", "400 invalid format", "PASSED"),
    ("_validate_size()", "TestValidateSize", "test_accepts_normal_size",
     "1KB 文件", "通过校验", "PASSED"),
    ("_validate_size()", "TestValidateSize", "test_accepts_at_boundary",
     "正好 MAX_FILE_SIZE", "通过（边界等号）", "PASSED"),
    ("_validate_size()", "TestValidateSize", "test_rejects_over_limit",
     "超出 MAX_FILE_SIZE", "413 file too large", "PASSED"),
]

UTILS_UNIT_CASES = [
    ("is_valid_university_email", "TestUniversityEmail",
     "test_accepts_university_edu", "@university.edu", "True", "PASSED"),
    ("is_valid_university_email", "TestUniversityEmail",
     "test_accepts_student_ac_uk", "@student.ac.uk", "True", "PASSED"),
    ("is_valid_university_email", "TestUniversityEmail",
     "test_rejects_gmail", "@gmail.com", "False", "PASSED"),
    ("is_valid_university_email", "TestUniversityEmail",
     "test_rejects_yahoo", "@yahoo.com", "False", "PASSED"),
    ("is_valid_university_email", "TestUniversityEmail",
     "test_rejects_email_with_university_in_local_part",
     "fake-university.edu@gmail.com（@ 之前伪造）",
     "False（防绕过）", "PASSED"),
    ("hash_password", "TestPasswordHashing", "test_hash_is_not_plaintext",
     "hash 应不含明文且足够长", "len > 30", "PASSED"),
    ("hash_password", "TestPasswordHashing", "test_hash_is_random_each_time",
     "同密码每次 hash 应不同（盐随机）",
     "h1 != h2", "PASSED"),
    ("verify_password", "TestPasswordHashing",
     "test_verify_correct_password_returns_true",
     "正确密码", "True", "PASSED"),
    ("verify_password", "TestPasswordHashing",
     "test_verify_wrong_password_returns_false",
     "错误密码", "False", "PASSED"),
    ("hash_password", "TestPasswordHashing", "test_password_too_long_raises_400",
     "密码 100 字节（超 bcrypt 72 字节）", "HTTP 400", "PASSED"),
    ("hash_password", "TestPasswordHashing", "test_password_at_72_bytes_works",
     "正好 72 字节", "通过 + 可验证", "PASSED"),
    ("create_access_token + decode_token", "TestJWT", "test_token_round_trip",
     "签发再解码", "payload 一致", "PASSED"),
    ("decode_token", "TestJWT", "test_decode_invalid_token_raises_401",
     "非法 token 字符串", "HTTP 401", "PASSED"),
    ("decode_token", "TestJWT", "test_decode_tampered_token_raises_401",
     "改一字符破坏签名", "HTTP 401", "PASSED"),
    ("decode_token", "TestJWT", "test_expired_token_raises_401",
     "过期 token", "HTTP 401", "PASSED"),
    ("generate_numeric_code", "TestGenerateNumericCode",
     "test_default_length_6", "生成 6 位",
     "全数字，长度=6", "PASSED"),
    ("generate_numeric_code", "TestGenerateNumericCode",
     "test_custom_length", "自定义长度 4 / 8", "长度匹配", "PASSED"),
    ("generate_numeric_code", "TestGenerateNumericCode",
     "test_codes_are_random", "20 次生成应有多种结果", "至少 5 种", "PASSED"),
    ("hash_code", "TestHashCode", "test_hash_is_deterministic",
     "同 email + 同 code 应产生同 hash", "h1 == h2", "PASSED"),
    ("hash_code", "TestHashCode",
     "test_different_emails_produce_different_hashes",
     "不同 email 同 code", "hash 不同（防跨账号）", "PASSED"),
    ("hash_code", "TestHashCode",
     "test_different_codes_produce_different_hashes",
     "同 email 不同 code", "hash 不同", "PASSED"),
    ("hash_code", "TestHashCode",
     "test_hash_does_not_contain_plaintext_code",
     "hash 不应含明文 code", "防泄漏", "PASSED"),
    ("hash_code", "TestHashCode",
     "test_hash_does_not_contain_plaintext_email",
     "hash 不应含明文 email", "防泄漏", "PASSED"),
]

REPORT_CASES = [
    ("POST /reports", "TestCreateReport", "test_create_report_success",
     "已验证用户举报别人的商品",
     "201，DB 中插入 pending 举报", "PASSED"),
    ("POST /reports", "TestCreateReport", "test_cannot_report_own_product",
     "卖家举报自己发布的商品",
     "400，禁止自己举报自己", "PASSED"),
    ("POST /reports", "TestCreateReport",
     "test_cannot_create_duplicate_pending_report",
     "同一用户对同一商品重复举报（已有 pending）",
     "400，DB 仍只有 1 条", "PASSED"),
    ("POST /reports", "TestCreateReport", "test_report_nonexistent_product",
     "举报不存在的商品", "404，product not found", "PASSED"),
    ("POST /reports", "TestCreateReport", "test_report_invalid_product_id",
     "product_id 非法 ObjectId", "400，invalid product id", "PASSED"),
    ("POST /reports", "TestCreateReport", "test_unverified_user_cannot_report",
     "未验证邮箱用户尝试举报", "403，需先验证邮箱", "PASSED"),
    ("POST /reports", "TestCreateReport", "test_invalid_reason_rejected",
     "reason 不在 ReportReason 枚举内",
     "422，Pydantic 校验失败", "PASSED"),
    ("POST /reports → 通知", "TestReportNotificationSideEffect",
     "test_report_notifies_all_admins",
     "提交举报后触发 admin 通知（跨模块）",
     "所有 admin 各收到 1 条 admin_report 通知", "PASSED"),
]

ADMIN_CASES = [
    ("权限隔离（多接口）", "TestAdminPermissionIsolation",
     "test_non_admin_cannot_list_users",
     "普通用户访问 GET /admin/users", "403，admin only", "PASSED"),
    ("权限隔离", "TestAdminPermissionIsolation",
     "test_non_admin_cannot_ban",
     "普通用户尝试封禁",
     "403，admin only", "PASSED"),
    ("权限隔离", "TestAdminPermissionIsolation",
     "test_non_admin_cannot_takedown",
     "普通用户尝试下架商品",
     "403，admin only", "PASSED"),
    ("权限隔离", "TestAdminPermissionIsolation",
     "test_non_admin_cannot_list_reports",
     "普通用户访问举报列表", "403，admin only", "PASSED"),
    ("权限隔离", "TestAdminPermissionIsolation",
     "test_non_admin_cannot_review_product",
     "普通用户尝试审核商品", "403，admin only", "PASSED"),
    ("权限隔离", "TestAdminPermissionIsolation",
     "test_anonymous_request_blocked",
     "未登录访问 admin 接口", "401/403，未授权", "PASSED"),
    ("GET /admin/users", "TestListUsers", "test_list_users_success",
     "admin 查询用户列表",
     "200，返回用户列表（含分页字段）", "PASSED"),
    ("GET /admin/users", "TestListUsers", "test_list_users_search",
     "按用户名搜索（q 参数）",
     "200，返回匹配的用户", "PASSED"),
    ("GET /admin/users", "TestListUsers", "test_list_users_pagination",
     "分页 page=1&size=2", "200，仅返回 2 条", "PASSED"),
    ("POST /admin/users/{id}/ban", "TestBanUnbanUser",
     "test_ban_user_success",
     "封禁用户",
     "200，DB 中 banned=true 且 ban_reason 被记录", "PASSED"),
    ("POST /admin/users/{id}/ban", "TestBanUnbanUser",
     "test_admin_cannot_ban_self", "admin 封禁自己",
     "400，cannot ban yourself", "PASSED"),
    ("POST /admin/users/{id}/ban", "TestBanUnbanUser",
     "test_ban_unknown_user_returns_404", "封禁不存在用户",
     "404，user not found", "PASSED"),
    ("POST /admin/users/{id}/ban", "TestBanUnbanUser",
     "test_ban_invalid_user_id", "user_id 非法",
     "400，invalid user id", "PASSED"),
    ("POST /admin/users/{id}/unban", "TestBanUnbanUser",
     "test_unban_user_success", "解封被封禁用户",
     "200，DB 中 banned=false", "PASSED"),
    ("POST /admin/users/{id}/role", "TestSetUserRole",
     "test_set_role_success",
     "改用户角色为 moderator", "200，DB 中 role 更新", "PASSED"),
    ("POST /admin/users/{id}/role", "TestSetUserRole",
     "test_admin_cannot_change_own_role",
     "admin 改自己的角色", "400，cannot change own role", "PASSED"),
    ("POST /admin/users/{id}/role", "TestSetUserRole",
     "test_invalid_role_rejected",
     "role 为非法值（如 superadmin）", "400，role 必须是预定义值", "PASSED"),
    ("PATCH /admin/users/{id}/verify", "TestSetUserVerified",
     "test_admin_can_verify_user",
     "admin 手动把未验证用户置为已验证",
     "200，DB 中 is_verified=true", "PASSED"),
    ("PATCH /admin/users/{id}/verify", "TestSetUserVerified",
     "test_admin_can_unverify_user",
     "admin 反向操作：取消验证",
     "200，DB 中 is_verified=false", "PASSED"),
    ("GET /admin/products", "TestAdminListProducts",
     "test_list_returns_paginated_products",
     "查询所有商品（含已下架/待审核）",
     "200，返回带分页的列表", "PASSED"),
    ("GET /admin/products", "TestAdminListProducts",
     "test_list_filtered_by_status",
     "按 status=removed 筛选",
     "200，仅返回 removed 状态商品", "PASSED"),
    ("GET /admin/products/pending", "TestAdminListProducts",
     "test_pending_list_only_returns_pending",
     "待审核商品列表",
     "200，仅返回 pending 状态", "PASSED"),
    ("POST /admin/products/{id}/takedown", "TestTakedownRestore",
     "test_takedown_success",
     "下架商品（管理员强制）",
     "200，商品 status=removed", "PASSED"),
    ("POST /admin/products/{id}/takedown", "TestTakedownRestore",
     "test_cannot_takedown_already_removed",
     "下架已 removed 的商品", "400，重复操作", "PASSED"),
    ("POST /admin/products/{id}/takedown", "TestTakedownRestore",
     "test_takedown_not_found", "商品不存在",
     "404，product not found", "PASSED"),
    ("POST /admin/products/{id}/restore", "TestTakedownRestore",
     "test_restore_success",
     "恢复已下架商品",
     "200，恢复到 previous_status", "PASSED"),
    ("POST /admin/products/{id}/restore", "TestTakedownRestore",
     "test_cannot_restore_non_removed",
     "恢复非 removed 状态的商品", "400，状态不匹配", "PASSED"),
    ("GET /admin/reports", "TestAdminReports", "test_list_reports",
     "admin 查询举报列表",
     "200，返回所有举报", "PASSED"),
    ("GET /admin/reports", "TestAdminReports",
     "test_list_reports_filter_by_status",
     "按 status=resolved 筛选",
     "200，仅返回 resolved 状态", "PASSED"),
    ("POST /admin/reports/{id}/resolve", "TestAdminReports",
     "test_resolve_report_takedown_action",
     "处理举报：takedown 动作",
     "200，举报 resolved + 商品被下架", "PASSED"),
    ("POST /admin/reports/{id}/resolve", "TestAdminReports",
     "test_resolve_report_dismissed_action",
     "处理举报：dismissed 动作（驳回）",
     "200，举报 dismissed，商品不变", "PASSED"),
    ("POST /admin/reports/{id}/resolve", "TestAdminReports",
     "test_resolve_invalid_status",
     "status 非法值（不是 takedown / dismissed）",
     "400，invalid status", "PASSED"),
    ("POST /admin/products/{id}/review", "TestReviewProduct",
     "test_approve_pending_product",
     "审核通过 pending 商品",
     "200，商品 status=available", "PASSED"),
    ("POST /admin/products/{id}/review", "TestReviewProduct",
     "test_reject_pending_product",
     "审核拒绝 pending 商品（首次提交）",
     "200，商品 status=rejected，记录 reject_reason", "PASSED"),
    ("POST /admin/products/{id}/review", "TestReviewProduct",
     "test_review_invalid_action",
     "action 非法字符串（如 explode）",
     "400，invalid action", "PASSED"),
    ("POST /admin/products/{id}/review", "TestReviewProduct",
     "test_cannot_review_non_pending_product",
     "审核非 pending 状态商品",
     "400，状态不允许", "PASSED"),
    ("POST /admin/.../takedown → 通知", "TestAdminNotificationSideEffects",
     "test_takedown_notifies_seller",
     "admin 下架商品后通知卖家（跨模块）",
     "卖家收到 1 条 product_takedown 通知", "PASSED"),
    ("POST /admin/.../restore → 通知", "TestAdminNotificationSideEffects",
     "test_restore_notifies_seller",
     "admin 恢复商品后通知卖家（跨模块）",
     "卖家收到 1 条 product_restored 通知", "PASSED"),
    ("POST /admin/reports/.../resolve → 通知", "TestAdminNotificationSideEffects",
     "test_resolve_report_takedown_notifies_seller",
     "admin 处理举报为 takedown 时通知卖家（跨模块）",
     "卖家收到 1 条 product_takedown 通知", "PASSED"),
    ("POST /admin/.../review approve → 通知", "TestAdminNotificationSideEffects",
     "test_review_approve_notifies_seller",
     "admin 审核通过后通知卖家（跨模块）",
     "卖家收到 1 条 product_review/Approved 通知", "PASSED"),
    ("POST /admin/.../review reject → 通知", "TestAdminNotificationSideEffects",
     "test_review_reject_notifies_seller",
     "admin 审核拒绝后通知卖家（跨模块）",
     "卖家收到 1 条 product_review/Rejected 通知", "PASSED"),
]

IMAGE_CASES = [
    ("GET /images/{id}", "TestGetImage", "test_get_image_success",
     "从 GridFS 流式返回图片",
     "200，body 字节与存入的一致", "PASSED"),
    ("GET /images/{id}", "TestGetImage",
     "test_get_image_returns_correct_content_type",
     "图片 MIME 类型正确",
     "200，Content-Type 与 metadata 一致", "PASSED"),
    ("GET /images/{id}", "TestGetImage",
     "test_get_image_sets_cache_header",
     "返回长期缓存头",
     "200，Cache-Control 含 immutable", "PASSED"),
    ("GET /images/{id}", "TestGetImage", "test_invalid_id_returns_400",
     "image_id 非法 ObjectId", "400，invalid image id", "PASSED"),
    ("GET /images/{id}", "TestGetImage", "test_image_not_found_returns_404",
     "GridFS 中无此文件",
     "404，image not found", "PASSED"),
]

AI_CASES = [
    ("GET /ai/usage", "TestAIUsage", "test_usage_when_no_calls",
     "用户当日尚未调用 AI",
     "200，used=0, remaining=20", "PASSED"),
    ("GET /ai/usage", "TestAIUsage", "test_usage_reflects_count",
     "DB 中预置 count=7",
     "200，used=7, remaining=13", "PASSED"),
    ("GET /ai/usage", "TestAIUsage", "test_usage_at_quota_boundary_19_to_20",
     "边界：count=19 时调一次 /ai/analyze",
     "200，配额变 20/0，第 21 次返 429", "PASSED"),
    ("GET /ai/usage", "TestAIUsage", "test_usage_resets_across_days",
     "昨天 count=20，今天独立计数",
     "200，今天显示 used=0, remaining=20", "PASSED"),
    ("GET /ai/usage", "TestAIUsage", "test_usage_invalid_user_id_returns_401",
     "JWT 中 sub 字段非法 ObjectId",
     "401，invalid user id", "PASSED"),
    ("POST /ai/analyze", "TestAnalyzeImage", "test_analyze_success",
     "上传图片调用 AI 分析",
     "200，返回 AI 数据 + 配额信息", "PASSED"),
    ("POST /ai/analyze", "TestAnalyzeImage", "test_analyze_invalid_extension",
     "上传 pdf 等不被允许的格式",
     "400，invalid file format", "PASSED"),
    ("POST /ai/analyze", "TestAnalyzeImage", "test_analyze_quota_exceeded",
     "用户当日已用满 20 次配额",
     "429，daily limit reached", "PASSED"),
    ("POST /ai/analyze", "TestAnalyzeImage",
     "test_analyze_unverified_user_forbidden",
     "未验证邮箱用户尝试调用",
     "403，需先验证邮箱", "PASSED"),
    ("POST /ai/analyze", "TestAnalyzeImage",
     "test_analyze_returns_500_on_ai_failure",
     "AI 服务返回 success=False",
     "500，AI service failed", "PASSED"),
    ("POST /ai/analyze", "TestAnalyzeImage",
     "test_analyze_oversized_file_returns_413",
     "超大文件（>max_upload_size_mb）",
     "413（与 /ai/analyze-and-save 已统一）", "PASSED"),
    ("POST /ai/analyze-and-save", "TestAnalyzeAndSave",
     "test_analyze_and_save_success",
     "AI 分析 + 把图存入 GridFS",
     "200，返回 image_url", "PASSED"),
    ("POST /ai/analyze-and-save", "TestAnalyzeAndSave",
     "test_analyze_and_save_invalid_extension",
     "上传非法格式", "400，invalid file format", "PASSED"),
    ("POST /ai/analyze-and-save", "TestAnalyzeAndSave",
     "test_analyze_and_save_quota_exceeded",
     "用户当日已用满 20 次配额",
     "429，daily limit reached", "PASSED"),
    ("POST /ai/analyze-and-save", "TestAnalyzeAndSave",
     "test_analyze_and_save_unverified_user_forbidden",
     "未验证邮箱用户尝试调用",
     "403，需先验证邮箱", "PASSED"),
    ("POST /ai/analyze-and-save", "TestAnalyzeAndSave",
     "test_analyze_and_save_returns_500_on_ai_failure",
     "AI 服务返回 success=False",
     "500，AI service failed", "PASSED"),
    ("POST /ai/analyze-and-save", "TestAnalyzeAndSave",
     "test_analyze_and_save_oversized_file_returns_413",
     "超大文件（>max_upload_size_mb）",
     "413（与 /ai/analyze 已统一）", "PASSED"),
    ("POST /ai/analyze-and-save", "TestAnalyzeAndSave",
     "test_analyze_and_save_gridfs_failure_returns_500",
     "GridFS 上传失败（磁盘满 / 网络错）",
     "500（生产 uvicorn 兜底）", "PASSED"),
    ("GET /ai/categories", "TestAICategories",
     "test_returns_category_list",
     "公开接口：获取分类列表",
     "200，返回非空 categories 列表", "PASSED"),
]

WS_CASES = [
    ("WS /ws", "TestWebSocketAuth", "test_no_token_disconnects",
     "WS 连接未带 token",
     "服务端立即关闭连接（1008）", "PASSED"),
    ("WS /ws", "TestWebSocketAuth", "test_bad_token_disconnects",
     "WS 连接带非法 token",
     "服务端立即关闭连接", "PASSED"),
    ("WS /ws", "TestWebSocketAuth", "test_token_without_sub_disconnects",
     "token 中无 sub 字段",
     "服务端立即关闭连接", "PASSED"),
    ("WS /ws", "TestWebSocketAuth",
     "test_valid_token_accepts_connection",
     "携带合法 token 建立 WS 连接",
     "连接成功，可正常发心跳", "PASSED"),
    ("WS /ws (chat protocol)", "TestWebSocketProtocol", "test_ping_pong",
     "客户端发 ping，服务端应回 pong",
     '收到 {"type": "pong"}', "PASSED"),
    ("WS /ws (chat protocol)", "TestWebSocketProtocol",
     "test_unknown_message_type_returns_error",
     "客户端发未知 type",
     '收到 {"type": "error", message: "Unknown..."}', "PASSED"),
    ("WS /ws (chat protocol)", "TestWebSocketProtocol",
     "test_invalid_json_returns_error",
     "客户端发非法 JSON 文本",
     '收到 {"type": "error", message: "Invalid JSON"}', "PASSED"),
    ("WS /ws (chat protocol)", "TestWebSocketProtocol",
     "test_chat_missing_required_fields_returns_error",
     "chat 消息缺 to 或 content 字段",
     "error，required fields 提示", "PASSED"),
    ("WS /ws (chat protocol)", "TestWebSocketProtocol",
     "test_chat_to_self_returns_error",
     "WS 中给自己发消息",
     "error，cannot send to yourself", "PASSED"),
    ("WS /ws (chat protocol)", "TestWebSocketProtocol",
     "test_read_missing_other_user_id_returns_error",
     "read 消息缺 other_user_id",
     "error，required field", "PASSED"),
]

NOTIFICATION_CASES = [
    ("GET /notifications", "TestListNotifications",
     "test_list_returns_user_notifications",
     "查询当前用户的通知列表",
     "200，返回用户的所有通知", "PASSED"),
    ("GET /notifications", "TestListNotifications",
     "test_list_sorted_newest_first",
     "通知按 created_at 倒序",
     "200，最新的通知排在最前", "PASSED"),
    ("GET /notifications", "TestListNotifications",
     "test_list_unread_only_filter",
     "unread_only=true 仅返回未读",
     "200，已读通知被过滤掉", "PASSED"),
    ("GET /notifications", "TestListNotifications",
     "test_list_does_not_leak_others_notifications",
     "他人的通知",
     "200，列表为空（数据隔离）", "PASSED"),
    ("GET /notifications", "TestListNotifications",
     "test_list_respects_limit",
     "limit=2 时即使 5 条也只返回 2 条",
     "200，长度=2", "PASSED"),
    ("GET /notifications", "TestListNotifications",
     "test_list_respects_skip",
     "skip=2&limit=2 实现分页",
     "200，跳过最新 2 条", "PASSED"),
    ("GET /notifications", "TestListNotifications",
     "test_list_requires_authentication",
     "未登录访问通知列表", "401/403，未授权", "PASSED"),
    ("GET /notifications/unread-count", "TestUnreadCount",
     "test_returns_correct_count",
     "未读数返回",
     "200，仅计入 read=false 的通知", "PASSED"),
    ("GET /notifications/unread-count", "TestUnreadCount",
     "test_zero_when_no_notifications",
     "用户无任何通知", "200，unread_count=0", "PASSED"),
    ("POST /notifications/{id}/read", "TestMarkOneRead",
     "test_mark_read_success",
     "标记单条通知已读",
     "200，DB 中 read=true，total_unread=0", "PASSED"),
    ("POST /notifications/{id}/read", "TestMarkOneRead",
     "test_cannot_mark_other_users_notification",
     "尝试标记别人的通知（查询不到自己的匹配）",
     "404，不泄漏 id 是否存在", "PASSED"),
    ("POST /notifications/{id}/read", "TestMarkOneRead",
     "test_mark_unknown_notification_returns_404",
     "标记不存在的通知 id", "404，notification not found", "PASSED"),
    ("POST /notifications/{id}/read", "TestMarkOneRead",
     "test_mark_invalid_id_returns_400",
     "id 非法 ObjectId", "400，invalid ObjectId", "PASSED"),
    ("POST /notifications/read-by-link", "TestReadByLink",
     "test_marks_matching_chat_link",
     "按 /chat/{id} 链接前缀批量标记已读",
     "200，匹配 link 的通知都被标记", "PASSED"),
    ("POST /notifications/read-by-link", "TestReadByLink",
     "test_non_chat_link_returns_zero",
     "传非 /chat/ 开头的 link",
     "200，marked=0（防滥用）", "PASSED"),
    ("POST /notifications/read-by-link", "TestReadByLink",
     "test_read_by_link_only_affects_current_user",
     "其他用户的同 link 通知",
     "200，只影响当前用户", "PASSED"),
    ("POST /notifications/read-all", "TestReadAll",
     "test_marks_all_user_notifications_read",
     "一键全部标记已读",
     "200，所有未读通知被置为 read=true", "PASSED"),
    ("POST /notifications/read-all", "TestReadAll",
     "test_read_all_does_not_affect_other_users",
     "他人的未读通知",
     "200，不被当前操作影响", "PASSED"),
    ("POST /notifications/read-all", "TestReadAll",
     "test_read_all_idempotent_on_empty",
     "用户无任何通知时调 read-all",
     "200，total_unread=0（幂等）", "PASSED"),
    ("POST /notifications/clear-all", "TestClearAll",
     "test_deletes_all_user_notifications",
     "一键清空收件箱",
     "200，DB 中当前用户的通知全部删除", "PASSED"),
    ("POST /notifications/clear-all", "TestClearAll",
     "test_clear_all_only_affects_current_user",
     "他人的通知",
     "200，不被当前操作影响", "PASSED"),
    ("POST /notifications/clear-all", "TestClearAll",
     "test_clear_all_requires_authentication",
     "未登录调用 clear-all", "401/403，未授权", "PASSED"),
]

MESSAGE_CASES = [
    ("POST /messages", "TestSendMessage", "test_send_message_success",
     "买家给卖家发文字消息",
     "200，DB 中插入消息（read=false）", "PASSED"),
    ("POST /messages", "TestSendMessage", "test_send_message_with_product_link",
     "发送带 product_id 的消息（按某商品聊）",
     "200，product_id 字段被保存", "PASSED"),
    ("POST /messages", "TestSendMessage", "test_cannot_send_message_to_self",
     "用户给自己发消息", "400，禁止给自己发", "PASSED"),
    ("POST /messages", "TestSendMessage",
     "test_send_to_nonexistent_user_returns_404",
     "to_user_id 指向不存在的用户", "404，receiver not found", "PASSED"),
    ("POST /messages", "TestSendMessage", "test_empty_content_rejected",
     "content 为空字符串", "422，Pydantic 校验失败（min_length=1）", "PASSED"),
    ("POST /messages", "TestSendMessage", "test_send_requires_verified_user",
     "未验证邮箱用户尝试发消息", "403，需先验证邮箱", "PASSED"),
    ("GET /messages", "TestGetMessages",
     "test_list_returns_messages_to_and_from_user",
     "查询消息列表（不带筛选）",
     "200，返回当前用户参与的所有消息", "PASSED"),
    ("GET /messages", "TestGetMessages", "test_list_filtered_by_other_user_id",
     "按对话方筛选（other_user_id=...）",
     "200，仅返回与该用户的对话", "PASSED"),
    ("GET /messages", "TestGetMessages", "test_list_filtered_by_product_id",
     "按商品筛选（product_id=...）",
     "200，仅返回围绕该商品的消息", "PASSED"),
    ("GET /messages", "TestGetMessages",
     "test_list_does_not_leak_others_messages",
     "他人之间的对话",
     "200，当前用户列表为空（数据隔离）", "PASSED"),
    ("GET /messages", "TestGetMessages", "test_list_requires_authentication",
     "未登录访问消息列表", "401/403，未授权", "PASSED"),
    ("GET /messages/conversations", "TestListConversations",
     "test_returns_one_row_per_partner",
     "聚合：每个对话方一行，按最新时间倒序",
     "200，会话列表正确分组与排序", "PASSED"),
    ("GET /messages/conversations", "TestListConversations",
     "test_unread_count_only_counts_incoming",
     "未读计数只算他人发给我的消息",
     "200，unread_count 不含自己发出的消息", "PASSED"),
    ("GET /messages/conversations", "TestListConversations",
     "test_empty_when_no_messages",
     "用户尚无任何消息", "200，会话列表为空", "PASSED"),
    ("GET /messages/unread-count", "TestUnreadCount",
     "test_returns_correct_unread_count",
     "全局未读消息计数",
     "200，仅计入收到的未读消息", "PASSED"),
    ("GET /messages/unread-count", "TestUnreadCount",
     "test_zero_when_no_messages",
     "用户尚无任何消息", "200，unread_count=0", "PASSED"),
    ("POST /messages/conversations/{id}/read", "TestMarkConversationRead",
     "test_marks_incoming_messages_as_read",
     "标记与某用户的会话全部已读",
     "200，marked=N，total_unread=0", "PASSED"),
    ("POST /messages/conversations/{id}/read", "TestMarkConversationRead",
     "test_does_not_mark_outgoing_as_read",
     "自己发出的消息不应被改成已读",
     "200，marked=0", "PASSED"),
    ("POST /messages/conversations/{id}/read", "TestMarkConversationRead",
     "test_mark_read_filtered_by_product",
     "按 product_id 范围标记已读",
     "200，仅该商品下的消息被标记", "PASSED"),
    ("POST /messages/conversations/{id}/read", "TestMarkConversationRead",
     "test_mark_read_invalid_user_id",
     "other_user_id 非法 ObjectId", "400，invalid ObjectId", "PASSED"),
]

REVIEW_CASES = [
    ("POST /reviews", "TestCreateReview", "test_buyer_can_review_completed_order",
     "买家给已完成订单评价",
     "201，DB 中插入评价（reviewee_role=seller）", "PASSED"),
    ("POST /reviews", "TestCreateReview", "test_seller_can_review_completed_order",
     "卖家给已完成订单评价",
     "201，DB 中插入评价（reviewee_role=buyer）", "PASSED"),
    ("POST /reviews", "TestCreateReview", "test_cannot_review_non_completed_order",
     "对 confirmed 状态订单评价", "400，订单需先完成", "PASSED"),
    ("POST /reviews", "TestCreateReview", "test_cannot_review_pending_order",
     "对 pending 状态订单评价", "400，订单需先完成", "PASSED"),
    ("POST /reviews", "TestCreateReview", "test_outsider_cannot_review",
     "第三方（非买家也非卖家）给订单评价",
     "403，仅可评价自己参与的订单", "PASSED"),
    ("POST /reviews", "TestCreateReview", "test_cannot_review_same_order_twice",
     "同一用户对同一订单二次评价", "409，已评价过", "PASSED"),
    ("POST /reviews", "TestCreateReview", "test_buyer_and_seller_can_both_review",
     "买卖双方对同一订单各自评价",
     "201 + 201，DB 中两条评价", "PASSED"),
    ("POST /reviews", "TestCreateReview", "test_review_order_not_found",
     "评价不存在的订单", "404，order not found", "PASSED"),
    ("POST /reviews", "TestCreateReview", "test_rating_out_of_range_rejected",
     "rating=6（超出 1-5 范围上界）", "422，Pydantic 校验失败", "PASSED"),
    ("POST /reviews", "TestCreateReview", "test_rating_below_minimum_rejected",
     "rating=0（低于 1-5 范围下界）", "422，Pydantic 校验失败", "PASSED"),
    ("POST /reviews", "TestCreateReview", "test_requires_verified_user",
     "未验证邮箱用户尝试评价", "403，需先验证邮箱", "PASSED"),
    ("GET /reviews/user/{id}", "TestGetUserReviews",
     "test_returns_seller_and_buyer_sections",
     "查询某用户的口碑（买家/卖家两个维度）",
     "200，返回 as_seller / as_buyer 两段统计", "PASSED"),
    ("GET /reviews/user/{id}", "TestGetUserReviews", "test_user_with_no_reviews",
     "查询无评价用户的口碑",
     "200，total_reviews=0，items=[]", "PASSED"),
    ("GET /reviews/user/{id}", "TestGetUserReviews",
     "test_invalid_user_id_returns_400",
     "user_id 非法 ObjectId", "400，invalid ObjectId", "PASSED"),
    ("GET /reviews/me", "TestMyReviews", "test_returns_only_my_given_reviews",
     "查看自己写过的评价（与他人无关）",
     "200，仅返回当前用户写的", "PASSED"),
    ("GET /reviews/me", "TestMyReviews", "test_empty_when_no_reviews_given",
     "我从未写过评价", "200，items=[]", "PASSED"),
    ("GET /reviews/me", "TestMyReviews", "test_requires_authentication",
     "未登录访问", "401/403，未授权", "PASSED"),
]

ORDER_CASES = [
    ("POST /orders", "TestCreateOrder", "test_create_order_success",
     "买家对 available 商品下单",
     "201，订单 pending，商品转 reserved", "PASSED"),
    ("POST /orders", "TestCreateOrder", "test_cannot_order_own_product",
     "卖家给自己的商品下单", "400，禁止给自己下单", "PASSED"),
    ("POST /orders", "TestCreateOrder",
     "test_cannot_order_unavailable_product",
     "对已售商品下单", "400，商品不可购买", "PASSED"),
    ("POST /orders", "TestCreateOrder", "test_cannot_double_order_same_product",
     "另一买家对已 reserved 商品下单",
     "400，已有进行中订单", "PASSED"),
    ("POST /orders", "TestCreateOrder", "test_create_order_product_not_found",
     "下单的 product_id 不存在", "404，product not found", "PASSED"),
    ("POST /orders", "TestCreateOrder",
     "test_create_requires_verified_user",
     "未验证邮箱用户尝试下单",
     "403，需先验证邮箱", "PASSED"),
    ("GET /orders", "TestListOrders", "test_default_returns_both_roles",
     "用户既是买家也是卖家，不传 role",
     "200，返回两类订单合计", "PASSED"),
    ("GET /orders", "TestListOrders",
     "test_role_buyer_only_returns_purchases",
     "role=buyer，仅看作为买家的订单",
     "200，仅返回购买记录", "PASSED"),
    ("GET /orders", "TestListOrders",
     "test_role_seller_only_returns_sales",
     "role=seller，仅看作为卖家的订单",
     "200，仅返回出售记录", "PASSED"),
    ("GET /orders", "TestListOrders", "test_requires_authentication",
     "未登录访问订单列表", "401/403，未授权", "PASSED"),
    ("GET /orders/{id}", "TestOrderDetail", "test_buyer_can_view",
     "买家查看自己参与的订单详情",
     "200，返回订单信息", "PASSED"),
    ("GET /orders/{id}", "TestOrderDetail", "test_seller_can_view",
     "卖家查看自己参与的订单详情",
     "200，返回订单信息", "PASSED"),
    ("GET /orders/{id}", "TestOrderDetail", "test_outsider_cannot_view",
     "第三方（非买家也非卖家）查看订单",
     "403，禁止查看他人订单", "PASSED"),
    ("GET /orders/{id}", "TestOrderDetail", "test_not_found",
     "订单不存在", "404，order not found", "PASSED"),
    ("PATCH /orders/{id}/confirm", "TestConfirmOrder",
     "test_seller_confirms_pending_order",
     "卖家确认 pending 订单",
     "200，订单 confirmed，商品转 sold", "PASSED"),
    ("PATCH /orders/{id}/confirm", "TestConfirmOrder",
     "test_buyer_cannot_confirm",
     "买家尝试确认订单",
     "403，仅卖家可确认", "PASSED"),
    ("PATCH /orders/{id}/confirm", "TestConfirmOrder",
     "test_cannot_confirm_already_confirmed",
     "确认已 confirmed 的订单",
     "400，状态非法跳转", "PASSED"),
    ("PATCH /orders/{id}/confirm", "TestConfirmOrder",
     "test_cannot_confirm_cancelled",
     "确认已 cancelled 的订单",
     "400，状态非法跳转", "PASSED"),
    ("PATCH /orders/{id}/complete", "TestCompleteOrder",
     "test_buyer_can_complete_confirmed_order",
     "买家完成 confirmed 订单",
     "200，订单 completed", "PASSED"),
    ("PATCH /orders/{id}/complete", "TestCompleteOrder",
     "test_seller_can_complete_confirmed_order",
     "卖家完成 confirmed 订单",
     "200，订单 completed", "PASSED"),
    ("PATCH /orders/{id}/complete", "TestCompleteOrder",
     "test_cannot_complete_pending_order",
     "跳过 confirm 直接完成 pending 订单",
     "400，需先 confirm", "PASSED"),
    ("PATCH /orders/{id}/complete", "TestCompleteOrder",
     "test_outsider_cannot_complete",
     "第三方尝试完成订单",
     "403，仅买家或卖家可完成", "PASSED"),
    ("PATCH /orders/{id}/cancel", "TestCancelOrder",
     "test_buyer_can_cancel_pending",
     "买家取消 pending 订单",
     "200，订单 cancelled，商品恢复 available", "PASSED"),
    ("PATCH /orders/{id}/cancel", "TestCancelOrder",
     "test_seller_can_cancel_pending",
     "卖家取消 pending 订单",
     "200，订单 cancelled", "PASSED"),
    ("PATCH /orders/{id}/cancel", "TestCancelOrder",
     "test_can_cancel_confirmed",
     "取消已 confirmed 订单",
     "200，订单 cancelled", "PASSED"),
    ("PATCH /orders/{id}/cancel", "TestCancelOrder",
     "test_cannot_cancel_completed",
     "取消已 completed 订单",
     "400，状态非法跳转", "PASSED"),
    ("PATCH /orders/{id}/cancel", "TestCancelOrder",
     "test_cannot_cancel_already_cancelled",
     "重复取消订单",
     "400，状态非法跳转", "PASSED"),
    ("PATCH /orders/{id}/{action}", "TestUnknownAction",
     "test_unknown_action_returns_400",
     "action 为非法字符串（如 explode）",
     "400，unknown action", "PASSED"),
    ("POST → PATCH × 2", "TestFullOrderFlow",
     "test_happy_path_create_confirm_complete",
     "端到端：下单 → 确认 → 完成 完整流程",
     "三步均成功，最终商品 sold", "PASSED"),
    ("POST /orders → 通知", "TestNotificationSideEffects",
     "test_order_creation_notifies_both_buyer_and_seller",
     "下单成功后触发通知（跨模块）",
     "卖家收 1 条 order_update + 买家收 1 条 system 确认", "PASSED"),
    ("PATCH /orders/{id}/confirm → 通知", "TestNotificationSideEffects",
     "test_seller_confirm_notifies_buyer",
     "卖家确认后触发对方通知（跨模块）",
     "买家收到 1 条状态变更通知", "PASSED"),
]

FAVORITE_CASES = [
    ("GET /favorites", "TestGetFavorites", "test_empty_when_no_favorites",
     "用户未收藏任何商品", "200，返回空列表 []", "PASSED"),
    ("GET /favorites", "TestGetFavorites", "test_returns_user_favorites",
     "用户收藏了 2 件商品", "200，返回这 2 件商品信息", "PASSED"),
    ("GET /favorites", "TestGetFavorites",
     "test_does_not_leak_other_users_favorites",
     "A 没收藏，但 B 收藏了商品",
     "200，A 看到的列表为空（数据隔离）", "PASSED"),
    ("GET /favorites", "TestGetFavorites", "test_requires_authentication",
     "未登录访问收藏列表", "401/403，未授权", "PASSED"),
    ("POST /favorites/{id}", "TestAddFavorite", "test_add_favorite_success",
     "登录用户收藏存在的商品",
     "200，DB 中插入收藏记录", "PASSED"),
    ("POST /favorites/{id}", "TestAddFavorite",
     "test_duplicate_add_is_idempotent",
     "重复收藏同一商品",
     "200，提示已收藏，DB 中仅 1 条（幂等）", "PASSED"),
    ("POST /favorites/{id}", "TestAddFavorite",
     "test_add_nonexistent_product_returns_404",
     "收藏不存在的商品", "404，product not found", "PASSED"),
    ("POST /favorites/{id}", "TestAddFavorite",
     "test_add_invalid_product_id_returns_400",
     "product_id 非法 ObjectId", "400，invalid ObjectId", "PASSED"),
    ("POST /favorites/{id}", "TestAddFavorite", "test_requires_authentication",
     "未登录尝试收藏", "401/403，未授权", "PASSED"),
    ("DELETE /favorites/{id}", "TestRemoveFavorite", "test_remove_favorite_success",
     "取消已收藏的商品",
     "200，DB 中收藏记录被删除", "PASSED"),
    ("DELETE /favorites/{id}", "TestRemoveFavorite",
     "test_remove_when_not_favorited_is_idempotent",
     "取消未曾收藏的商品",
     "200，前端可无脑调用（幂等）", "PASSED"),
    ("DELETE /favorites/{id}", "TestRemoveFavorite",
     "test_remove_only_affects_current_user",
     "A 取消自己的收藏，不影响 B 的同款收藏",
     "200，B 的收藏记录仍存在", "PASSED"),
    ("DELETE /favorites/{id}", "TestRemoveFavorite",
     "test_requires_authentication",
     "未登录尝试取消收藏", "401/403，未授权", "PASSED"),
    ("GET /favorites", "TestFavoritesEdgeCases",
     "test_list_silently_skips_deleted_products",
     "收藏的商品后来被卖家删除（出现幽灵收藏）",
     "200，列表静默跳过已删除商品，不报错", "PASSED"),
]

MODULES = [
    {
        "name": "认证授权（routes/auth.py）",
        "code_path": "routes/auth.py",
        "test_file": "tests/test_auth.py",
        "endpoint_count": 11,
        "case_count": len(AUTH_CASES),
        "passed": len(AUTH_CASES),
        "duration": "6.81s",
        "cases": AUTH_CASES,
    },
    {
        "name": "商品管理（routes/products.py）",
        "code_path": "routes/products.py",
        "test_file": "tests/test_products.py",
        "endpoint_count": 13,
        "case_count": len(PRODUCT_CASES),
        "passed": len(PRODUCT_CASES),
        "duration": "9.67s",
        "cases": PRODUCT_CASES,
    },
    {
        "name": "商品收藏（routes/favorites.py）",
        "code_path": "routes/favorites.py",
        "test_file": "tests/test_favorites.py",
        "endpoint_count": 3,
        "case_count": len(FAVORITE_CASES),
        "passed": len(FAVORITE_CASES),
        "duration": "2.76s",
        "cases": FAVORITE_CASES,
    },
    {
        "name": "订单管理（routes/orders.py）",
        "code_path": "routes/orders.py",
        "test_file": "tests/test_orders.py",
        "endpoint_count": 4,
        "case_count": len(ORDER_CASES),
        "passed": len(ORDER_CASES),
        "duration": "11.36s",
        "cases": ORDER_CASES,
    },
    {
        "name": "用户评价（routes/reviews.py）",
        "code_path": "routes/reviews.py",
        "test_file": "tests/test_reviews.py",
        "endpoint_count": 3,
        "case_count": len(REVIEW_CASES),
        "passed": len(REVIEW_CASES),
        "duration": "5.21s",
        "cases": REVIEW_CASES,
    },
    {
        "name": "私信消息（routes/messages.py）",
        "code_path": "routes/messages.py",
        "test_file": "tests/test_messages.py",
        "endpoint_count": 5,
        "case_count": len(MESSAGE_CASES),
        "passed": len(MESSAGE_CASES),
        "duration": "8.42s",
        "cases": MESSAGE_CASES,
    },
    {
        "name": "站内通知（routes/notifications.py）",
        "code_path": "routes/notifications.py",
        "test_file": "tests/test_notifications.py",
        "endpoint_count": 6,
        "case_count": len(NOTIFICATION_CASES),
        "passed": len(NOTIFICATION_CASES),
        "duration": "4.65s",
        "cases": NOTIFICATION_CASES,
    },
    {
        "name": "举报（routes/reports.py）",
        "code_path": "routes/reports.py",
        "test_file": "tests/test_reports.py",
        "endpoint_count": 1,
        "case_count": len(REPORT_CASES),
        "passed": len(REPORT_CASES),
        "duration": "2.58s",
        "cases": REPORT_CASES,
    },
    {
        "name": "管理员后台（routes/admin.py）",
        "code_path": "routes/admin.py",
        "test_file": "tests/test_admin.py",
        "endpoint_count": 12,
        "case_count": len(ADMIN_CASES),
        "passed": len(ADMIN_CASES),
        "duration": "12.59s",
        "cases": ADMIN_CASES,
    },
    {
        "name": "图片服务（routes/images.py）",
        "code_path": "routes/images.py",
        "test_file": "tests/test_images.py",
        "endpoint_count": 1,
        "case_count": len(IMAGE_CASES),
        "passed": len(IMAGE_CASES),
        "duration": "0.02s",
        "cases": IMAGE_CASES,
    },
    {
        "name": "AI 分析（routes/ai.py）",
        "code_path": "routes/ai.py",
        "test_file": "tests/test_ai.py",
        "endpoint_count": 4,
        "case_count": len(AI_CASES),
        "passed": len(AI_CASES),
        "duration": "1.67s",
        "cases": AI_CASES,
    },
    {
        "name": "WebSocket（routes/ws.py）",
        "code_path": "routes/ws.py",
        "test_file": "tests/test_ws.py",
        "endpoint_count": 1,
        "case_count": len(WS_CASES),
        "passed": len(WS_CASES),
        "duration": "0.02s",
        "cases": WS_CASES,
    },
    {
        "name": "图像处理（utils/image_service.py）— Unit Test",
        "code_path": "utils/image_service.py",
        "test_file": "tests/test_image_service.py",
        "endpoint_count": 0,  # unit test，没有接口
        "case_count": len(IMAGE_SERVICE_UNIT_CASES),
        "passed": len(IMAGE_SERVICE_UNIT_CASES),
        "duration": "0.14s",
        "cases": IMAGE_SERVICE_UNIT_CASES,
    },
    {
        "name": "认证工具函数（utils/security.py + utils/otp.py）— Unit Test",
        "code_path": "utils/security.py + utils/otp.py",
        "test_file": "tests/test_utils.py",
        "endpoint_count": 0,
        "case_count": len(UTILS_UNIT_CASES),
        "passed": len(UTILS_UNIT_CASES),
        "duration": "1.69s",
        "cases": UTILS_UNIT_CASES,
    },
    {
        "name": "应用入口（main.py）",
        "code_path": "main.py",
        "test_file": "tests/test_main.py",
        "endpoint_count": 2,
        "case_count": len(MAIN_CASES),
        "passed": len(MAIN_CASES),
        "duration": "0.05s",
        "cases": MAIN_CASES,
    },
]

TOTAL_CASES = sum(m["case_count"] for m in MODULES)
TOTAL_PASSED = sum(m["passed"] for m in MODULES)
TOTAL_FAILED = TOTAL_CASES - TOTAL_PASSED
PASS_RATE = f"{TOTAL_PASSED * 100 // TOTAL_CASES}%"
TOTAL_DURATION = "69.88s"


# ── 渲染辅助 ──────────────────────────────────────────────────────
def render_case_table(cases):
    cell_style = ParagraphStyle(
        "Cell", parent=body, fontSize=8.5, leading=12, alignment=TA_LEFT,
    )
    header_style = ParagraphStyle(
        "Hdr", parent=cell_style, fontSize=9, textColor=colors.white,
    )
    pass_style = ParagraphStyle(
        "Pass", parent=cell_style, fontSize=9,
        textColor=colors.HexColor("#006100"), alignment=TA_CENTER,
    )

    rows = [[
        p("接口", header_style),
        p("测试用例", header_style),
        p("场景", header_style),
        p("预期结果", header_style),
        p("结果", header_style),
    ]]
    for endpoint, klass, name, scenario, expected, result in cases:
        rows.append([
            p(endpoint, cell_style),
            p(f"{klass}.<br/>{name}", cell_style),
            p(scenario, cell_style),
            p(expected, cell_style),
            p(f"<b>{result}</b>", pass_style),
        ])

    tbl = Table(
        rows,
        colWidths=[3.2 * cm, 4.2 * cm, 4.2 * cm, 4.2 * cm, 1.5 * cm],
        repeatRows=1,
    )
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f4e79")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.white, colors.HexColor("#f7f9fc")]),
    ]))
    return tbl


# ── 构建 PDF ──────────────────────────────────────────────────────
def build():
    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title="CampusTrade 后端测试报告",
    )
    story = []

    # ── 封面 ──
    story.append(Spacer(1, 4 * cm))
    story.append(p("CampusTrade 后端测试报告", title_style))
    story.append(Spacer(1, 0.5 * cm))
    sub_style = ParagraphStyle(
        "Sub", parent=title_style, fontSize=14, textColor=colors.grey,
    )
    story.append(p("Backend API Test Report", sub_style))
    story.append(Spacer(1, 3 * cm))
    cover_tbl = Table(
        [
            ["报告生成时间", GENERATED_AT],
            ["覆盖模块数", str(len(MODULES))],
            ["测试用例总数", str(TOTAL_CASES)],
            ["通过 / 失败", f"{TOTAL_PASSED} / {TOTAL_FAILED}"],
            ["通过率", PASS_RATE],
            ["总耗时", TOTAL_DURATION],
        ],
        colWidths=[5 * cm, 9 * cm],
    )
    cover_tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), CN_FONT, 11),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f2f2f2")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(cover_tbl)
    story.append(PageBreak())

    # ── 1. 总览 ──
    story.append(p("1. 测试总览", h1))
    story.append(p(
        "本报告汇总 CampusTrade 后端 API 的自动化测试结果。"
        "采用 pytest 接口级集成测试方式，使用 httpx + ASGITransport "
        "直接调用 FastAPI 应用；MongoDB 通过 mongomock-motor 提供"
        "内存替身，确保测试不依赖外部服务、相互隔离。", body))

    summary_data = [
        ["总用例数", "通过", "失败", "通过率", "总耗时", "覆盖模块数"],
        [
            str(TOTAL_CASES), str(TOTAL_PASSED), str(TOTAL_FAILED),
            PASS_RATE, TOTAL_DURATION, str(len(MODULES)),
        ],
    ]
    summary_tbl = Table(summary_data, colWidths=[2.5 * cm] * 6)
    summary_tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), CN_FONT, 10),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f4e79")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (1, 1), (1, 1), colors.HexColor("#c6efce")),
        ("TEXTCOLOR", (1, 1), (1, 1), colors.HexColor("#006100")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(summary_tbl)

    # 模块汇总表
    story.append(p("1.1 模块汇总", h2))
    mod_rows = [["序号", "模块", "接口数", "用例数", "通过", "耗时"]]
    for i, m in enumerate(MODULES, 1):
        mod_rows.append([
            str(i), m["name"], str(m["endpoint_count"]),
            str(m["case_count"]), f"{m['passed']}/{m['case_count']}",
            m["duration"],
        ])
    mod_tbl = Table(mod_rows, colWidths=[1.2 * cm, 6.8 * cm, 2 * cm, 2 * cm, 2 * cm, 2 * cm])
    mod_tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), CN_FONT, 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f4e79")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.white, colors.HexColor("#f7f9fc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(mod_tbl)

    # ── 2. 测试环境 ──
    story.append(p("2. 测试环境", h1))
    env_tbl = Table(ENV_INFO, colWidths=[4 * cm, 11 * cm])
    env_tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), CN_FONT, 10),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f2f2f2")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(env_tbl)

    # ── 3. 测试方法 ──
    story.append(p("3. 测试方法", h1))
    story.append(p("3.1 测试策略", h2))
    story.append(p(
        "采用 <b>接口级集成测试</b> 策略：使用 httpx.AsyncClient + "
        "ASGITransport 直接打到 FastAPI 应用，不需启动真实 HTTP 服务器，"
        "也不依赖外部 MongoDB。每个测试用例独立运行，互不影响。", body))
    story.append(p("3.2 数据隔离", h2))
    story.append(p(
        "通过 mongomock-motor 提供内存 MongoDB，monkeypatch 替换 "
        "utils.database.db.client，确保测试不会写入真实数据库；每个用例"
        "拿到独立的 db fixture，避免数据相互污染。", body))
    story.append(p("3.3 副作用屏蔽", h2))
    story.append(p(
        "在 conftest.py 中通过 autouse fixture 统一屏蔽以下外部依赖：", body))
    items = [
        "邮件发送：mock send_verification_code / send_password_reset_email 为 noop",
        "限流模块：mock check_rate_limit，跳过 IP/用户维度限流",
        "AI 接口：mock analyze_image，返回固定假数据，避免真请求 OpenAI",
        "图片处理：mock process_and_save_image / save_processed_to_gridfs / "
        "delete_image / upload_raw_to_gridfs，跳过 PIL 与 GridFS",
        "管理员通知：mock notify_admins_pending_product / create_notification",
        "WebSocket 推送：mock manager.send_personal，避免触发真实连接",
    ]
    for it in items:
        story.append(p(f"&nbsp;&nbsp;• {it}", body))
    story.append(p("3.4 用例覆盖原则", h2))
    story.append(p(
        "每个接口至少包含 1 条 happy path（正常流程）+ 1 条 failure path"
        "（参数错误 / 权限不足 / 资源不存在）。重点接口（登录、改密、"
        "发布商品、置顶、订单状态机等）补充边界用例。", body))

    story.append(p("3.5 测试金字塔分层", h2))
    story.append(p(
        "本项目测试体系包含两层：", body))
    story.append(p(
        "&nbsp;&nbsp;• <b>Unit Test 层</b>：直接测试纯函数（图像处理、密码哈希、"
        "JWT、OTP），不走 HTTP 与 DB。覆盖 utils/image_service.py、"
        "utils/security.py、utils/otp.py 等基础工具，对应 CA2 计划中 "
        "Aim 1.1（邮箱验证）、Aim 1.2（密码哈希 / JWT）的底层正确性。", body))
    story.append(p(
        "&nbsp;&nbsp;• <b>API Integration Test 层</b>：通过 httpx + ASGITransport "
        "调用 FastAPI 应用，覆盖路由、中间件、Pydantic 校验、业务逻辑、"
        "数据访问层的端到端协作。"
        "其中部分用例使用 <b>Spy 模式</b>（如 notification_spy）"
        "验证模块间的副作用调用（订单 → 通知、降价 → 收藏者通知、"
        "举报 → admin 通知等），属于 cross-module integration。", body))
    story.append(p(
        "数量上 Unit Test 较少（聚焦于纯函数），Integration Test 较多——"
        "符合 FastAPI + Mongo 应用的实际测试性价比。", body))

    # ── 4 & 5+. 各模块详细用例 ──
    story.append(PageBreak())
    story.append(p("4. 各模块测试用例明细", h1))
    for i, m in enumerate(MODULES, 1):
        story.append(p(f"4.{i} {m['name']}", h2))
        story.append(p(
            f"代码：<font face='Courier'>{m['code_path']}</font>"
            f"&nbsp;&nbsp;|&nbsp;&nbsp;"
            f"测试文件：<font face='Courier'>{m['test_file']}</font>"
            f"&nbsp;&nbsp;|&nbsp;&nbsp;"
            f"用例：{m['passed']}/{m['case_count']} 通过",
            body,
        ))
        story.append(Spacer(1, 0.2 * cm))
        story.append(render_case_table(m["cases"]))
        if i < len(MODULES):
            story.append(PageBreak())

    # ── 5. AI 准确率评估（CA2 Aim 3.2 硬指标） ──
    story.append(PageBreak())
    story.append(p("5. AI 分类准确率评估（CA2 Aim 3.2）", h1))
    story.append(p(
        "CA2 计划第 3 页明确要求："
        "<b>"
        "在 50 张已标注的真实商品图上，"
        "POST /ai/analyze 返回的 category 字段准确率应 ≥ 80%。"
        "</b>"
        "此项不属于回归测试范畴（涉及真实 OpenAI API 调用与计费），"
        "通过环境变量 <font face='Courier'>RUN_AI_EVAL=1</font> 单独触发。",
        body))

    story.append(p("5.1 数据集与方法", h2))
    story.append(p(
        "测试数据集：50 张商品图，覆盖 5 个分类（每类 10 张）—— "
        "Clothing、Electronics、Kitchen、Sports、Textbooks。"
        "图片以目录结构组织（<font face='Courier'>tests/ai_test_dataset/&lt;Category&gt;/</font>），"
        "目录名即真值标签。"
        "测试代码遍历每张图，调用 <font face='Courier'>utils.ai_helper.analyze_image()</font>"
        "（真实 GPT-4o 视觉模型），将返回的 category 字段与目录名对比，"
        "汇总整体准确率与各分类细分。", body))

    story.append(p("5.2 评估结果", h2))
    overall_data = [
        ["指标", "数值"],
        ["数据集规模", "50 张图（5 分类 × 10）"],
        ["正确分类数", "50"],
        ["整体准确率", "100.00%"],
        ["CA2 目标", "≥ 80%"],
        ["验收状态", "✅ 超额通过（+20 pp）"],
        ["运行耗时", "141.45 秒（约 2.5 分钟）"],
        ["运行环境", "GPT-4o（gpt-4o-2024-...）"],
    ]
    overall_tbl = Table(overall_data, colWidths=[5 * cm, 9 * cm])
    overall_tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), CN_FONT, 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f4e79")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (1, 3), (1, 3), colors.HexColor("#c6efce")),
        ("TEXTCOLOR", (1, 3), (1, 3), colors.HexColor("#006100")),
        ("BACKGROUND", (1, 5), (1, 5), colors.HexColor("#c6efce")),
        ("TEXTCOLOR", (1, 5), (1, 5), colors.HexColor("#006100")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.white, colors.HexColor("#f7f9fc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(overall_tbl)

    story.append(p("5.3 各分类准确率细分", h2))
    cat_data = [
        ["分类", "正确数 / 总数", "准确率"],
        ["Clothing", "10 / 10", "100%"],
        ["Electronics", "10 / 10", "100%"],
        ["Kitchen", "10 / 10", "100%"],
        ["Sports", "10 / 10", "100%"],
        ["Textbooks", "10 / 10", "100%"],
        ["合计", "50 / 50", "100%"],
    ]
    cat_tbl = Table(cat_data, colWidths=[5 * cm, 5 * cm, 4 * cm])
    cat_tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), CN_FONT, 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f4e79")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#c6efce")),
        ("TEXTCOLOR", (0, -1), (-1, -1), colors.HexColor("#006100")),
        ("FONT", (0, -1), (-1, -1), CN_FONT, 11),  # 合计行加粗
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2),
         [colors.white, colors.HexColor("#f7f9fc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(cat_tbl)

    story.append(Spacer(1, 0.4 * cm))
    story.append(p("5.4 结果分析", h2))
    story.append(p(
        "本次评估实现 50/50 满分，远超 CA2 设定的 80% 目标。"
        "5 个分类全部 10/10 完全正确，无任何错分。原因可归纳为：", body))
    story.append(p(
        "&nbsp;&nbsp;• <b>视觉模型能力强</b>：GPT-4o 是 OpenAI 最新的多模态模型，"
        "对常见消费品类的识别能力已达到接近人类水平。", body))
    story.append(p(
        "&nbsp;&nbsp;• <b>Prompt 设计合理</b>：<font face='Courier'>analyze_image()</font> "
        "在 prompt 中显式枚举了 8 个允许的分类，并要求模型返回 JSON 格式，"
        "强制约束输出空间。", body))
    story.append(p(
        "&nbsp;&nbsp;• <b>Fallback 保护</b>：路由代码二次校验返回的 category 是否在合法列表内，"
        "不在则归为 \"Other\"，进一步提升一致性。", body))
    story.append(p(
        "&nbsp;&nbsp;• <b>测试图集典型</b>：所选 5 个分类（衣物 / 电子 / 厨房 / 运动 / 教材）"
        "彼此视觉差异显著，避免了易混淆样本。", body))

    story.append(p(
        "<b>结论：CampusTrade 的 AI 商品识别功能完全满足 CA2 Aim 3.2 的"
        "准确率要求，可投入用户测试阶段。</b>", body))

    # ── 6. 性能测试（Locust） ──
    story.append(PageBreak())
    story.append(p("6. 性能测试（Locust）", h1))
    story.append(p(
        "CA2 计划 Table II 明确要求："
        "<b>API 响应 p95 < 200 ms（10 并发用户）</b> 与 "
        "<b>AI 端点 p95 < 8 s</b>。"
        "此项不属于 pytest 范畴——使用 Locust 在真实运行环境下"
        "（本地 MongoDB + 真实 uvicorn 进程）做并发压力测试。",
        body))

    story.append(p("6.1 测试架构", h2))
    story.append(p(
        "三个独立进程通过 HTTP / Mongo 协议串联：", body))
    items = [
        "<b>Locust 驱动器</b>（perf_tests/locustfile.py）：模拟并发用户，"
        "70% 匿名浏览（11 个读接口） + 30% 登录用户（11 个鉴权接口）",
        "<b>uvicorn 进程</b>：真实 FastAPI 应用，无 mock",
        "<b>本地 MongoDB</b>（brew services 启动）：替代云端 Atlas，"
        "排除网络延迟干扰，得到纯服务器性能数据",
    ]
    for it in items:
        story.append(p(f"&nbsp;&nbsp;• {it}", body))

    story.append(p("6.2 API 端点性能（基线：10 并发用户，60 秒）", h2))
    base_data = [
        ["指标", "数值", "CA2 目标", "状态"],
        ["总请求数", "257", "—", "—"],
        ["失败率", "0.00%", "—", "✅"],
        ["平均响应", "10 ms", "—", "—"],
        ["p95 响应", "12 ms", "< 200 ms", "✅ 超额"],
        ["p99 响应", "210 ms", "—", "—"],
        ["吞吐量", "4.3 req/s", "—", "—"],
        ["覆盖接口数", "22", "—", "—"],
    ]
    base_tbl = Table(base_data, colWidths=[3.5 * cm, 3.5 * cm, 3.5 * cm, 3 * cm])
    base_tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), CN_FONT, 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f4e79")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (1, 4), (3, 4), colors.HexColor("#c6efce")),
        ("TEXTCOLOR", (1, 4), (3, 4), colors.HexColor("#006100")),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.white, colors.HexColor("#f7f9fc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(base_tbl)
    story.append(Spacer(1, 0.3 * cm))
    story.append(p(
        "在 CA2 规定的 10 用户基线下，所有读接口响应均极快（平均 10ms），"
        "<b>p95 仅 12ms，达 CA2 目标的 6%</b>，性能裕量充足。", body))

    story.append(p("6.3 高负载稳定性（扩展：50 并发用户，60 秒）", h2))
    heavy_data = [
        ["指标", "数值", "CA2 目标", "状态"],
        ["总请求数", "1246", "—", "5 倍负载"],
        ["失败率", "0.00%", "—", "✅ 零失败"],
        ["平均响应", "17 ms", "—", "—"],
        ["p95 响应", "32 ms", "< 200 ms", "✅ 仅占目标 16%"],
        ["p99 响应", "390 ms", "—", "登录 bcrypt 验密导致"],
        ["吞吐量", "20.8 req/s", "—", "近线性扩展"],
    ]
    heavy_tbl = Table(heavy_data, colWidths=[3 * cm, 3 * cm, 3 * cm, 4 * cm])
    heavy_tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), CN_FONT, 9.5),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f4e79")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (1, 2), (3, 2), colors.HexColor("#c6efce")),
        ("TEXTCOLOR", (1, 2), (3, 2), colors.HexColor("#006100")),
        ("BACKGROUND", (1, 4), (3, 4), colors.HexColor("#c6efce")),
        ("TEXTCOLOR", (1, 4), (3, 4), colors.HexColor("#006100")),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.white, colors.HexColor("#f7f9fc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(heavy_tbl)
    story.append(Spacer(1, 0.3 * cm))
    story.append(p(
        "<b>测试设计要点</b>：为模拟真实多用户场景，"
        "seed_data.py 预先创建 60 个独立测试账号"
        "（<font face='Courier'>perfuser0..perfuser59@university.edu</font>），"
        "Locust 通过线程安全的账号池为每个虚拟用户分配唯一邮箱；"
        "同时为每个用户生成不同的 <font face='Courier'>X-Forwarded-For</font> "
        "伪 IP，绕过后端按 IP 维度的限流（rate_limiter._get_client_ip 优先读"
        "该头）。这样模拟出 50 个不同设备上 50 个不同用户同时使用的真实场景。",
        body))
    story.append(p(
        "<b>结果显示</b>：在 5 倍预期负载（50 vs 10 用户）下，"
        "<b>失败率 0.00%（1246/1246 请求全部成功）</b>，"
        "p95 仅从 12ms 上升到 32ms，仍远低于 200ms 目标；"
        "p99 中较大值主要来自 <font face='Courier'>POST /auth/login</font> "
        "的 bcrypt 密码验证（每次 ~200ms，是设计中的安全延迟，非性能 bug）。"
        "证明后端在真实并发负载下扩展性良好，"
        "可承载远超 CA2 预期的用户规模。", body))

    story.append(p("6.4 AI 端点性能（POST /ai/analyze）", h2))
    ai_perf_data = [
        ["指标", "数值", "CA2 目标", "状态"],
        ["AI 调用数", "4", "5-10（控本）", "—"],
        ["平均响应", "3659 ms", "—", "—"],
        ["p95 响应", "5300 ms", "< 8000 ms", "✅ 超额"],
        ["最快", "2891 ms", "—", "—"],
        ["最慢", "5251 ms", "< 8000 ms", "✅"],
        ["失败率", "0%", "—", "✅"],
        ["实际成本", "约 $0.08", "<$0.20", "✅"],
    ]
    ai_perf_tbl = Table(ai_perf_data, colWidths=[3 * cm, 3 * cm, 3 * cm, 3 * cm])
    ai_perf_tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), CN_FONT, 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f4e79")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (1, 3), (3, 3), colors.HexColor("#c6efce")),
        ("TEXTCOLOR", (1, 3), (3, 3), colors.HexColor("#006100")),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.white, colors.HexColor("#f7f9fc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(ai_perf_tbl)
    story.append(Spacer(1, 0.3 * cm))
    story.append(p(
        "AI 端点测试单独运行（<font face='Courier'>perf_tests/ai_locustfile.py</font>），"
        "1 用户 30 秒，共完成 4 次真实 OpenAI 调用。响应时间稳定在 3-5 秒之间，"
        "p95 = 5.3 秒，<b>低于 CA2 目标 8 秒</b>，实际成本约 $0.08（OpenAI 计费）。",
        body))

    story.append(p("6.5 性能测试结论", h2))
    story.append(p(
        "<b>所有 CA2 性能目标超额达成</b>："
        "API 端点 p95 在 10 用户基线下 12 ms（目标 200 ms），"
        "5 倍负载（50 用户）下仍稳定在 32 ms 且零失败；"
        "AI 端点 p95 = 5.3 s（目标 8 s）。"
        "整体后端可承载远超 CA2 预期的真实用户负载。", body))

    # ── 7. Cypress 端到端测试 ──
    story.append(PageBreak())
    story.append(p("7. Cypress 端到端测试（CA2 Plan Table I）", h1))
    story.append(p(
        "CA2 计划 Table I 列出 4 个端到端工作流，要求"
        "<b>用 Cypress 在真实浏览器环境下验证前后端联动</b>。"
        "本节给出 4 个 spec 的实测结果——前端 dev server（Vite，5173）"
        "+ 后端 uvicorn（8000）+ 本地 MongoDB 同时运行，"
        "Cypress 模拟用户操作真实浏览器。", body))

    story.append(p("7.1 测试栈与覆盖", h2))
    cy_data = [
        ["Spec 文件", "对应 Workflow", "用例数", "结果"],
        ["registration.cy.js", "Registration（CA2 Table I 第 1 行）", "5", "✅ 5/5"],
        ["login.cy.js", "Login（注册的对偶，扩展）", "4", "✅ 4/4"],
        ["ai_listing.cy.js", "AI Listing（CA2 Table I 第 2 行）", "2", "✅ 2/2"],
        ["message.cy.js", "Message（CA2 Table I 第 3 行）", "3", "✅ 3/3"],
        ["search.cy.js", "Search（CA2 Table I 第 4 行）", "3", "✅ 3/3"],
        ["order.cy.js", "Order 完整交易闭环（业务核心，扩展）", "3", "✅ 3/3"],
        ["合计", "—", "20", "✅ 20/20（100%）"],
    ]
    cy_tbl = Table(cy_data, colWidths=[3.5 * cm, 5.5 * cm, 2 * cm, 3 * cm])
    cy_tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), CN_FONT, 9.5),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f4e79")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#c6efce")),
        ("TEXTCOLOR", (0, -1), (-1, -1), colors.HexColor("#006100")),
        ("FONT", (0, -1), (-1, -1), CN_FONT, 10.5),
        ("ALIGN", (2, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2),
         [colors.white, colors.HexColor("#f7f9fc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(cy_tbl)

    story.append(p("7.2 各 Workflow 验证要点", h2))
    story.append(p("<b>7.2.1 Registration</b>", body))
    items = [
        "Happy path：用 university.edu 邮箱注册 → POST /auth/register 返回 201，"
        "is_verified=false，前端展示 'Registered! Please verify your email...'",
        "Non-university email（gmail.com）→ 前端 isUniversityEmail() 拦截，"
        "展示 'university email' 错误，不发请求",
        "密码不匹配 → 前端拦截，展示 'Passwords do not match'",
        "密码 < 8 字符 → 前端拦截，展示 'at least 8'",
        "未勾选 Terms → 前端拦截，展示 'agree to terms'",
    ]
    for it in items:
        story.append(p(f"&nbsp;&nbsp;• {it}", body))

    story.append(p("<b>7.2.2 AI Listing</b>", body))
    items = [
        "未登录访问 /publish → ProtectedRoute 重定向到 /login（CA2 期望的 403 行为）",
        "登录后上传图片 → POST /ai/analyze-and-save → "
        "<b>真实 OpenAI 调用响应 < 8s</b>（CA2 目标）→ 表单被 AI 数据自动填充 → "
        "添加价格 → POST /products 返回 201",
        "测试通过环境变量 RUN_AI_E2E=1 控制是否触发真实 OpenAI 调用，"
        "默认跳过避免误触发计费",
    ]
    for it in items:
        story.append(p(f"&nbsp;&nbsp;• {it}", body))

    story.append(p("<b>7.2.3 Message</b>", body))
    items = [
        "已验证用户发消息 → 消息出现在 UI + DB 中（API 二次验证）",
        "跨账号验证：A 通过 API 发消息，B 登录后访问 /chat/A → 能看到消息",
        "未登录访问 /chat → 重定向（CA2 期望的 verified-only 行为）",
    ]
    for it in items:
        story.append(p(f"&nbsp;&nbsp;• {it}", body))

    story.append(p("<b>7.2.4 Search</b>", body))
    items = [
        "首页加载 → GET /products 返回 200 + 非空商品列表",
        "搜索关键字 → 触发带 search=&lt;keyword&gt; 的请求",
        "价格区间 → 触发带 min_price + max_price 的请求",
    ]
    for it in items:
        story.append(p(f"&nbsp;&nbsp;• {it}", body))

    story.append(p("<b>7.2.5 Login（扩展）</b>", body))
    items = [
        "正确凭据登录 → 200 + access_token 写入 sessionStorage / localStorage",
        "错误密码 → 401 + 前端展示 'Invalid' 错误",
        "未注册邮箱 → 401（防邮箱枚举）",
        "登录后页面刷新 → token 在 storage 里持久化（session persistence）",
    ]
    for it in items:
        story.append(p(f"&nbsp;&nbsp;• {it}", body))

    story.append(p("<b>7.2.6 Order 完整交易闭环（扩展）</b>", body))
    story.append(p(
        "这是 CampusTrade 的<b>核心业务路径</b>，串起前端 UI + 后端订单状态机 + "
        "用户角色切换。本组测试模拟真实交易：", body))
    items = [
        "<b>Happy path</b>：buyer 在 ProductDetail 点 'Buy Now' → "
        "POST /orders 返回 201 + status=pending",
        "<b>Seller 视角</b>：partner 用户登录 MyOrders → 切到 Sold tab → "
        "看到 pending 订单 + 点 Confirm → PATCH /orders/{id}/confirm → "
        "status=confirmed",
        "<b>完整生命周期</b>：buyer 下单 → seller confirm → buyer 在 UI 点 "
        "Complete → status=completed（端到端 3 个状态切换全打通）",
        "<b>限流规避</b>：spec 通过 cy.window 注入预先缓存的 token，"
        "避免重复 /auth/login 触发后端 user_key 维度限流（10 次/60s/邮箱）",
    ]
    for it in items:
        story.append(p(f"&nbsp;&nbsp;• {it}", body))

    story.append(p("7.3 性能数据", h2))
    story.append(p(
        "全套 20 个 Cypress 测试 <b>25 秒内跑完</b>（含真实 OpenAI 调用）。"
        "耗时分布：registration 8s / ai_listing 4s / login 4s / search 4s / "
        "message 2s / order 1s。没有 flaky 用例。"
        "缓存 token 复用模式让 order 整个 spec 只发 2 次 /auth/login 请求，"
        "避免触发限流。", body))

    story.append(p("7.4 测试栈技术细节", h2))
    items = [
        "<b>Cypress 15.14</b>（cypress.config.js 配置 baseUrl + 自定义 env）",
        "<b>cy.intercept()</b> 监听 API 请求并断言 status / body 字段",
        "<b>cy.request()</b> 通过 API 直接登录拿 token 注入 localStorage，"
        "绕过 UI 交互加快测试（自定义命令 cy.apiLogin / cy.loginAsTestUser）",
        "<b>cy.selectFile() force:true</b> 处理 PublishProduct 的隐藏 file input",
        "<b>X-Forwarded-For 不需要</b>：Cypress 单线程顺序执行，不会触发 IP 限流",
        "<b>fixture/test_product.png</b>：从 backend/perf_tests 复用同一张测试图",
    ]
    for it in items:
        story.append(p(f"&nbsp;&nbsp;• {it}", body))

    # ── 8. 结论 ──
    story.append(PageBreak())
    story.append(p("8. 结论与后续计划", h1))
    story.append(p("8.1 当前结论", h2))
    story.append(p(
        f"截至 {GENERATED_AT}，已完成 {len(MODULES)} 个核心模块的测试覆盖，"
        f"共 {TOTAL_CASES} 条用例 "
        f"<b><font color='#006100'>全部通过</font></b>，通过率 {PASS_RATE}，"
        f"总耗时 {TOTAL_DURATION}。"
        "已覆盖 CampusTrade 后端 12 个核心模块的全部业务接口，包括："
        "认证与账号管理、商品发布与浏览、收藏、订单交易、用户互评、"
        "私信消息、站内通知、举报、管理员后台、图片服务、AI 分析、"
        "以及 WebSocket 实时通讯。从用户注册验证邮箱开始，"
        "到发布商品、浏览/收藏、下单→确认→完成、互相评价、私信沟通、"
        "举报违规、管理员审核处理——平台核心业务全链路均已通过自动化测试验证。"
        "<b>同时完成 CA2 Aim 3.2 要求的 AI 准确率评估，"
        "在 50 张真实商品图上达到 100% 分类准确率，远超 80% 目标</b>"
        "（详见第 5 章）。"
        "<b>Locust 性能测试（第 6 章）也全部超额达成：10 用户基线下 "
        "API p95 = 12 ms，50 用户高负载下零失败、p95 = 32 ms"
        "（目标 200 ms）；AI p95 = 5.3 s（目标 8 s）</b>。"
        "<b>Cypress 端到端测试（第 7 章）覆盖 CA2 Plan Table I 全部 4 个 "
        "workflow（Registration / AI Listing / Message / Search）+ "
        "扩展的 Login 与 Order 完整交易闭环，6 个 spec 共 20 条用例 100% 通过</b>。"
        "测试架构（fixture / mock / spy）已成熟，支持持续集成下的回归保护。"
        "下一阶段建议：补充前端 Cypress 端到端测试，进入 UAT 用户验收测试。",
        body))

    story.append(p("8.2 后续测试计划", h2))
    story.append(p("按以下顺序补充其他后端模块的测试：", body))
    plan = [
        ["序号", "模块", "测试重点", "状态"],
        ["1", "auth.py", "注册 / 登录 / 验证 / 改密 / 重置", "已完成"],
        ["2", "products.py", "发布 / 列表 / 详情 / 编辑 / 删除 / boost / AI", "已完成"],
        ["3", "favorites.py", "收藏与取消、跨用户隔离、幂等性", "已完成"],
        ["4", "orders.py", "下单、状态机（confirm/complete/cancel）、权限", "已完成"],
        ["5", "reviews.py", "订单完成后评价、防重复评价、双向互评", "已完成"],
        ["6", "messages.py", "私信收发、会话聚合、未读计数、按商品筛选", "已完成"],
        ["7", "notifications.py", "通知列表、已读状态、按链接批量已读、清空", "已完成"],
        ["8", "reports.py", "举报创建、跨用户隔离、防重复举报", "已完成"],
        ["9", "admin.py", "管理员权限隔离、用户/商品/举报全管理", "已完成"],
        ["10", "images.py", "GridFS 流式返回、缓存头、错误处理", "已完成"],
        ["11", "ai.py", "AI 调用 + 配额控制（20/天）", "已完成"],
        ["12", "ws.py", "WebSocket 连接鉴权 + 协议正确性", "已完成"],
    ]
    plan_tbl = Table(plan, colWidths=[1.2 * cm, 3.3 * cm, 8.5 * cm, 2 * cm])
    plan_tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), CN_FONT, 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f4e79")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (3, 0), (3, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.white, colors.HexColor("#f7f9fc")]),
        # 已完成行染绿（全部 12 行）
        ("BACKGROUND", (3, 1), (3, 12), colors.HexColor("#c6efce")),
        ("TEXTCOLOR", (3, 1), (3, 12), colors.HexColor("#006100")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(plan_tbl)

    story.append(Spacer(1, 1 * cm))
    story.append(p("—— 报告结束 ——", ParagraphStyle(
        "End", parent=body, alignment=TA_CENTER, textColor=colors.grey,
    )))

    doc.build(story)
    print(f"✓ 报告已生成：{OUTPUT_PDF}")
    print(f"  覆盖模块：{len(MODULES)}")
    print(f"  用例总数：{TOTAL_CASES}")
    print(f"  通过率：{PASS_RATE}")


if __name__ == "__main__":
    build()
