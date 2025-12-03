"""
SAM & Inpaint Service (Hugging Face Inference API 版本)

示例服务：调用 Hugging Face Hub 云端的最大号 SAM 模型（facebook/sam-vit-huge）
获取分割 mask，再调用 runwayml/stable-diffusion-inpainting 做远程 inpaint。

注意：
- 需要环境变量 HUGGINGFACEHUB_API_TOKEN（或 HF_TOKEN）来访问推理 API。
- 这是 Demo 代码，未做复杂的重试/限流处理。
"""
from __future__ import annotations

import io
import os
from dataclasses import dataclass
from typing import Tuple, List

import numpy as np
from PIL import Image

from huggingface_hub import InferenceClient  # type: ignore


_SAM_MODEL_NAME = "facebook/sam-vit-huge"
_INPAINT_MODEL_NAME = "runwayml/stable-diffusion-inpainting"


@dataclass
class Rect:
    x: int
    y: int
    width: int
    height: int

    def to_box_xyxy(self) -> Tuple[int, int, int, int]:
        """Convert to SAM expected [x1, y1, x2, y2] box."""
        return self.x, self.y, self.x + self.width, self.y + self.height


class SamInpaintService:
    """
    负责：
    - 使用 huggingface_hub.InferenceClient 远程调用 SAM 模型
    - 利用 OpenCV 在本地对被抠出区域做 inpaint 修复
    """

    def __init__(self) -> None:
        token = (
            os.getenv("HUGGINGFACEHUB_API_TOKEN")
            or os.getenv("HF_TOKEN")
            or os.getenv("HUGGING_FACE_TOKEN")
        )
        # 如果没有 token，也可以匿名，但会非常受限
        self.sam_client = InferenceClient(model=_SAM_MODEL_NAME, token=token)
        self.inpaint_client = InferenceClient(model=_INPAINT_MODEL_NAME, token=token)

    def _segment_with_sam(self, image: Image.Image, rect: Rect) -> np.ndarray:
        """
        使用远程 SAM 在给定矩形内做前景分割，返回 0/1 mask（H, W）。

        为了避免依赖特定服务端 schema，这里使用 image-segmentation 通用接口：
        - 输入：整张图片（二进制）
        - 输出：若干 mask 结果（polygon 或 rle）；这里只做示例，简单合并所有 mask。
        """
        # 将图像转为 PNG bytes
        buf = io.BytesIO()
        image.save(buf, format="PNG")
        img_bytes = buf.getvalue()

        # 说明：当前 HF 官方 image_segmentation 接口对 SAM 的 box prompt 支持还不稳定，
        # 为了简单起见，我们这里直接获取全图分割结果并合并所有 mask。
        # 如果之后想精确控制矩形区域，可以改为调用自建 Space / 专用推理服务。
        # 显式传入模型 ID，避免 provider 解析失败
        results = self.sam_client.image_segmentation(  # type: ignore[arg-type]
            image=img_bytes,
            model=_SAM_MODEL_NAME,
        )

        # 初始化空 mask
        w, h = image.size
        mask = np.zeros((h, w), dtype="uint8")

        for item in results:
            # 每个 item.mask 是 base64 PNG
            b64_mask = item.mask
            if not b64_mask:
                continue
            try:
                m_img = Image.open(io.BytesIO(b64_mask)).convert("L")
                m_arr = np.array(m_img)
                m_bin = (m_arr > 127).astype("uint8")
                mask = np.maximum(mask, m_bin)
            except Exception:
                continue

        return mask

    def _inpaint_background(self, image: Image.Image, mask: np.ndarray) -> Image.Image:
        """
        使用 Hugging Face inpainting 模型对背景进行修复。

        Args:
            image: 原始 RGB 图片
            mask: 0/1 mask（H, W），1 表示需要修复的区域
        """
        # 将原图和 mask 都转成 PNG bytes
        buf_img = io.BytesIO()
        image.save(buf_img, format="PNG")
        img_bytes = buf_img.getvalue()

        mask_img = Image.fromarray((mask * 255).astype("uint8"), mode="L")
        buf_mask = io.BytesIO()
        mask_img.save(buf_mask, format="PNG")
        mask_bytes = buf_mask.getvalue()

        # 使用 image_to_image 进行 inpaint
        # runwayml/stable-diffusion-inpainting 支持传入 mask 参数
        result_img = self.inpaint_client.image_to_image(  # type: ignore[call-arg]
            image=img_bytes,
            prompt=(
              "Fill the removed region with a natural, coherent background that matches the surrounding area."
            ),
            model=_INPAINT_MODEL_NAME,
            mask=mask_bytes,
        )
        # image_to_image 直接返回 PIL.Image.Image
        return result_img.convert("RGB")

    def cutout_and_inpaint(
        self, image: Image.Image, rect: Rect
    ) -> Tuple[Image.Image, Image.Image]:
        """
        根据矩形区域做智能抠图 + 背景 inpaint 修复。

        Returns:
            foreground_rgba: 被抠出的前景（RGBA，含透明通道，可拖拽使用）
            background_rgb: inpaint 后的背景图（RGB）
        """
        image_rgb = image.convert("RGB")
        np_img = np.array(image_rgb)  # H, W, 3, RGB

        h, w, _ = np_img.shape
        # 简单安全裁剪，避免坐标越界
        x1 = max(0, rect.x)
        y1 = max(0, rect.y)
        x2 = min(w, rect.x + rect.width)
        y2 = min(h, rect.y + rect.height)
        safe_rect = Rect(x1, y1, x2 - x1, y2 - y1)

        if safe_rect.width <= 0 or safe_rect.height <= 0:
            raise ValueError("选区无效：宽或高为 0")

        # 远程 SAM 分割得到全图 mask
        sam_mask_full = self._segment_with_sam(image_rgb, safe_rect)  # 0/1, H, W 全图

        # ---------- 前景抠图（带透明通道） ----------
        sub_mask = sam_mask_full[
            safe_rect.y : safe_rect.y + safe_rect.height,
            safe_rect.x : safe_rect.x + safe_rect.width,
        ]
        sub_region = np_img[
            safe_rect.y : safe_rect.y + safe_rect.height,
            safe_rect.x : safe_rect.x + safe_rect.width,
        ]

        alpha = (sub_mask * 255).astype("uint8")
        rgba = np.dstack([sub_region, alpha])
        foreground_rgba = Image.fromarray(rgba, mode="RGBA")

        # ---------- 背景 inpaint（调用 Hugging Face 模型） ----------
        background_rgb = self._inpaint_background(image_rgb, sam_mask_full)

        return foreground_rgba, background_rgb


# 全局单例，避免重复加载大模型
_global_sam_service: SamInpaintService | None = None


def get_sam_service() -> SamInpaintService:
    global _global_sam_service
    if _global_sam_service is None:
        _global_sam_service = SamInpaintService()
    return _global_sam_service


