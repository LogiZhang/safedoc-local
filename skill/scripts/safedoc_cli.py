#!/usr/bin/env python3
"""
SafeDoc Privacy Stamper CLI — 100% Local Watermark & Invoice Folder Inventory.
Zero network requests. Safe for local agent & CLI execution.
"""

from __future__ import annotations

import argparse
import datetime as dt
from pathlib import Path


def cmd_inventory(target_dir: Path) -> None:
    if not target_dir.exists() or not target_dir.is_dir():
        raise SystemExit(f"目录不存在: {target_dir}")

    exts = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
    files = sorted(
        p for p in target_dir.iterdir() if p.is_file() and p.suffix.lower() in exts
    )
    today = dt.date.today().isoformat()
    print(f"# 报销票据本地核对清单（生成日期：{today}）\n")
    print(f"- 扫描目录：`{target_dir.resolve()}`")
    print(f"- 识别票据总数：**{len(files)}** 份\n")
    print("| 序号 | 文件名 | 类型 | 大小 (KB) | 预计 A4 拼版页码 (2张/页) |")
    print("| --- | --- | --- | --- | --- |")
    for idx, f in enumerate(files, start=1):
        kb = f.stat().st_size / 1024.0
        a4_page = (idx + 1) // 2
        print(f"| {idx:02d} | {f.name} | {f.suffix.upper().lstrip('.')} | {kb:.1f} | 第 {a4_page} 页 |")


def cmd_watermark(src: Path, dst: Path, text: str, opacity: int) -> None:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as exc:
        raise SystemExit("请先安装 Pillow 库以启用本地图片水印：pip install Pillow") from exc

    if not src.exists():
        raise SystemExit(f"找不到输入图片: {src}")

    if src.resolve() == dst.resolve():
        raise SystemExit("为保护证件原件，输出路径不能与输入原图路径相同。")

    base = Image.open(src).convert("RGBA")
    w, h = base.size
    stamp_text = f"{text} · {dt.date.today().isoformat()}"

    overlay = Image.new("RGBA", (w * 2, h * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font_size = max(18, min(w, h) // 28)
    font = ImageFont.load_default(size=font_size)

    alpha = max(25, min(200, int(255 * (opacity / 100.0))))
    color = (196, 48, 43, alpha)

    step_x = max(len(stamp_text) * font_size + 80, 260)
    step_y = max(font_size * 4, 90)

    row = 0
    for y in range(0, h * 2, step_y):
        shift = 0 if row % 2 == 0 else step_x // 2
        for x in range(0, w * 2, step_x):
            draw.text((x + shift, y), stamp_text, fill=color, font=font)
        row += 1

    rotated = overlay.rotate(28, expand=False)
    cx, cy = rotated.size[0] // 2, rotated.size[1] // 2
    cropped = rotated.crop((cx - w // 2, cy - h // 2, cx - w // 2 + w, cy - h // 2 + h))

    merged = Image.alpha_composite(base, cropped).convert("RGB")
    dst.parent.mkdir(parents=True, exist_ok=True)
    merged.save(dst)
    print(f"已完成防盗用水印添加 -> {dst}")


def main() -> None:
    parser = argparse.ArgumentParser(description="票证私盒本地隐私命令行工具")
    sub = parser.add_subparsers(dest="command", required=True)

    p_wm = sub.add_parser("watermark", help="为证件照叠加斜向防盗用水印")
    p_wm.add_argument("--input", required=True, type=Path, help="输入证件图片路径")
    p_wm.add_argument("--output", required=True, type=Path, help="输出水印图片路径")
    p_wm.add_argument(
        "--text",
        default="仅供本次业务核验使用，他用无效",
        help="水印警示文案",
    )
    p_wm.add_argument("--opacity", type=int, default=28, help="水印不透明度百分比 (10-75)")

    p_inv = sub.add_parser("inventory", help="扫描本地目录生成报销发票核对表")
    p_inv.add_argument("--dir", required=True, type=Path, help="发票所在目录")

    args = parser.parse_args()
    if args.command == "watermark":
        cmd_watermark(args.input, args.output, args.text, args.opacity)
    elif args.command == "inventory":
        cmd_inventory(args.dir)


if __name__ == "__main__":
    main()
