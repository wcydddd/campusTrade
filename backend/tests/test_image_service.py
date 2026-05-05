"""
utils/image_service.py 的 **unit test**（首次出现真正的单元测试层）。

跟其他文件不同：这里不走 HTTP、不碰 DB、不 await——直接调函数。
对应 CA2 计划中"strip EXIF metadata for privacy"的隐私要求。
"""
import pytest
from PIL import Image
from fastapi import HTTPException

from utils.image_service import (
    strip_exif,
    compress_image,
    generate_thumbnail,
    _validate_extension,
    _validate_size,
    MAX_FILE_SIZE,
    MAX_IMAGE_SIZE,
    THUMBNAIL_SIZE,
)


# =====================================================
# strip_exif —— 隐私功能（CA2 计划）
# =====================================================
class TestStripExif:
    def test_strip_exif_removes_metadata(self):
        """带 EXIF 的图像经 strip 后，info dict 中不应再含 exif 字段。"""
        img = Image.new("RGB", (50, 50), color="red")
        img.info["exif"] = b"fake-exif-bytes-from-camera"
        img.info["dpi"] = (72, 72)  # 其他元数据

        stripped = strip_exif(img)
        assert "exif" not in stripped.info
        # 实现是新建一张图复制像素，所以其他元数据也会被清空
        assert stripped.info == {}

    def test_strip_exif_preserves_pixel_data(self):
        """剥离 EXIF 不应影响像素数据。"""
        img = Image.new("RGB", (10, 10), color=(123, 45, 67))
        img.info["exif"] = b"some-exif"

        stripped = strip_exif(img)
        assert stripped.size == (10, 10)
        assert stripped.mode == "RGB"
        # 像素数据应完全一致
        assert list(stripped.getdata()) == list(img.getdata())

    def test_strip_exif_returns_new_object(self):
        """应返回新 Image 对象（不修改原对象）。"""
        original = Image.new("RGB", (5, 5))
        original.info["exif"] = b"x"

        stripped = strip_exif(original)
        assert stripped is not original
        # 原对象未被修改
        assert "exif" in original.info


# =====================================================
# compress_image
# =====================================================
class TestCompressImage:
    def test_compress_resizes_oversized_image(self):
        """超过 MAX_IMAGE_SIZE 的图应被缩放。"""
        big = Image.new("RGB", (4000, 3000))
        compressed = compress_image(big)
        assert compressed.width <= MAX_IMAGE_SIZE[0]
        assert compressed.height <= MAX_IMAGE_SIZE[1]

    def test_compress_preserves_aspect_ratio(self):
        """缩放保持原宽高比。"""
        big = Image.new("RGB", (4000, 2000))  # 2:1
        compressed = compress_image(big)
        ratio = compressed.width / compressed.height
        assert abs(ratio - 2.0) < 0.05

    def test_compress_unchanged_for_small_image(self):
        """已经在 MAX_IMAGE_SIZE 以内的图不被改动。"""
        small = Image.new("RGB", (800, 600))
        compressed = compress_image(small)
        assert compressed.size == (800, 600)


# =====================================================
# generate_thumbnail
# =====================================================
class TestGenerateThumbnail:
    def test_thumbnail_fits_target_size(self):
        """缩略图被限制在 THUMBNAIL_SIZE (300x300) 内。"""
        big = Image.new("RGB", (2000, 1500))
        thumb = generate_thumbnail(big)
        assert thumb.width <= THUMBNAIL_SIZE[0]
        assert thumb.height <= THUMBNAIL_SIZE[1]

    def test_thumbnail_preserves_aspect_ratio(self):
        big = Image.new("RGB", (2000, 1000))  # 2:1
        thumb = generate_thumbnail(big)
        ratio = thumb.width / thumb.height
        assert abs(ratio - 2.0) < 0.1


# =====================================================
# _validate_extension
# =====================================================
class TestValidateExtension:
    def test_accepts_jpg(self):
        assert _validate_extension("photo.jpg") == "jpg"

    def test_accepts_jpeg(self):
        assert _validate_extension("a.jpeg") == "jpeg"

    def test_accepts_png(self):
        assert _validate_extension("logo.png") == "png"

    def test_accepts_webp(self):
        assert _validate_extension("anim.webp") == "webp"

    def test_case_insensitive(self):
        """大写后缀也应被接受。"""
        assert _validate_extension("PHOTO.JPG") == "jpg"

    def test_rejects_pdf(self):
        with pytest.raises(HTTPException) as exc:
            _validate_extension("doc.pdf")
        assert exc.value.status_code == 400

    def test_rejects_gif(self):
        """gif 不在白名单。"""
        with pytest.raises(HTTPException):
            _validate_extension("anim.gif")

    def test_rejects_no_extension(self):
        with pytest.raises(HTTPException):
            _validate_extension("filename_without_ext")


# =====================================================
# _validate_size
# =====================================================
class TestValidateSize:
    def test_accepts_normal_size(self):
        # 1KB，远低于上限
        _validate_size(b"x" * 1024)

    def test_accepts_at_boundary(self):
        """正好等于上限不应被拒。"""
        _validate_size(b"x" * MAX_FILE_SIZE)

    def test_rejects_over_limit(self):
        oversize = b"x" * (MAX_FILE_SIZE + 1)
        with pytest.raises(HTTPException) as exc:
            _validate_size(oversize)
        assert exc.value.status_code == 413
