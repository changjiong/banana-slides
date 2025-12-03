"""
SAM Demo Controller

提供一个示例接口：

POST /api/tools/object-cutout
  - form-data:
      - image: 原始图片文件
      - rect: JSON 字符串，如 {"x": 100, "y": 80, "width": 300, "height": 200}

返回：
  {
    "success": true,
    "data": {
      "foreground_url": "/files/sam-demo/pages/fg_xxx.png",
      "background_url": "/files/sam-demo/pages/bg_xxx.png"
    }
  }
"""
from __future__ import annotations

import json
import traceback
import time
from pathlib import Path

from flask import Blueprint, current_app, request
from PIL import Image

from services.sam_service import Rect, get_sam_service
from utils import success_response, error_response


sam_bp = Blueprint("sam_tools", __name__, url_prefix="/api/tools")


@sam_bp.route("/object-cutout", methods=["POST"])
def object_cutout():
    try:
        if "image" not in request.files:
            return error_response("INVALID_REQUEST", "缺少 image 文件", 400)
        if "rect" not in request.form:
            return error_response("INVALID_REQUEST", "缺少 rect 参数", 400)

        try:
            rect_data = json.loads(request.form["rect"])
            rect = Rect(
                x=int(rect_data.get("x", 0)),
                y=int(rect_data.get("y", 0)),
                width=int(rect_data.get("width", 0)),
                height=int(rect_data.get("height", 0)),
            )
        except Exception:
            return error_response("INVALID_REQUEST", "rect 参数格式错误，应为 JSON", 400)

        file = request.files["image"]
        image = Image.open(file.stream)

        sam_service = get_sam_service()
        foreground, background = sam_service.cutout_and_inpaint(image, rect)

        # 将结果保存到 uploads/sam-demo/pages 下，使用已有的 /files 路由访问
        upload_root = Path(current_app.config["UPLOAD_FOLDER"])
        project_id = "sam-demo"
        pages_dir = upload_root / project_id / "pages"
        pages_dir.mkdir(parents=True, exist_ok=True)

        ts = int(time.time() * 1000)
        fg_name = f"fg_{ts}.png"
        bg_name = f"bg_{ts}.png"

        fg_path = pages_dir / fg_name
        bg_path = pages_dir / bg_name

        foreground.save(str(fg_path))
        background.save(str(bg_path))

        data = {
            "foreground_url": f"/files/{project_id}/pages/{fg_name}",
            "background_url": f"/files/{project_id}/pages/{bg_name}",
        }
        return success_response(data=data)
    except Exception as e:  # pragma: no cover - demo endpoint
        print(f"Error in object_cutout: {str(e)}")
        print(traceback.format_exc())
        return error_response("SERVER_ERROR", str(e), 500)


