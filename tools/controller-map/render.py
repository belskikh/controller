#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit(
        "controller-map: Pillow is required; install it with "
        "`python3 -m pip install Pillow`"
    )


TOOL_DIR = Path(__file__).resolve().parent
REPOSITORY_ROOT = TOOL_DIR.parent.parent
BASE_PATH = TOOL_DIR / "dualsense-layout-base.png"
DEFAULT_LABELS_PATH = TOOL_DIR / "labels.json"
DEFAULT_OUTPUT_PATH = REPOSITORY_ROOT / "docs/assets/dualsense-codex-map.png"
FONT_CANDIDATES = (
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
    Path("/System/Library/Fonts/Helvetica.ttc"),
)

SLOTS = {
    "left-1": (50, 40, 290, 79),
    "left-2": (50, 136, 290, 78),
    "left-3": (50, 228, 290, 78),
    "left-4": (50, 320, 290, 78),
    "left-5": (50, 411, 290, 78),
    "left-6": (50, 503, 290, 77),
    "left-7": (50, 594, 290, 77),
    "top": (711, 77, 247, 75),
    "right-1": (1329, 40, 289, 79),
    "right-2": (1329, 136, 289, 78),
    "right-3": (1329, 228, 289, 78),
    "right-4": (1329, 320, 289, 78),
    "right-5": (1329, 411, 289, 78),
    "right-6": (1329, 503, 289, 77),
    "right-7": (1329, 594, 289, 77),
    "bottom-left": (399, 791, 264, 77),
    "bottom-center": (701, 791, 265, 77),
    "bottom-right": (1007, 791, 263, 77),
}


def repository_path(argument: str | None, default: Path) -> Path:
    if argument is None:
        return default
    path = Path(argument)
    return path if path.is_absolute() else REPOSITORY_ROOT / path


def load_font(size: int) -> ImageFont.FreeTypeFont:
    font_path = next((path for path in FONT_CANDIDATES if path.exists()), None)
    if font_path is None:
        sys.exit("controller-map: compatible macOS system font not found")
    return ImageFont.truetype(str(font_path), size=size)


def main() -> None:
    labels_path = repository_path(
        sys.argv[1] if len(sys.argv) > 1 else None,
        DEFAULT_LABELS_PATH,
    )
    output_path = repository_path(
        sys.argv[2] if len(sys.argv) > 2 else None,
        DEFAULT_OUTPUT_PATH,
    )

    try:
        labels = json.loads(labels_path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        sys.exit(f"controller-map: could not read {labels_path}: {error}")

    callouts = labels.get("callouts", [])
    slot_names = [callout.get("slot") for callout in callouts]
    unknown = sorted(set(slot_names) - set(SLOTS))
    duplicates = sorted(
        slot for slot in set(slot_names) if slot_names.count(slot) > 1
    )
    if unknown:
        sys.exit(f"controller-map: unknown slot(s): {', '.join(unknown)}")
    if duplicates:
        sys.exit(f"controller-map: duplicate slot(s): {', '.join(duplicates)}")

    try:
        image = Image.open(BASE_PATH).convert("RGB")
    except OSError as error:
        sys.exit(f"controller-map: could not read {BASE_PATH}: {error}")

    if image.size != (1672, 941):
        sys.exit(
            "controller-map: base image must be 1672x941, "
            f"found {image.width}x{image.height}"
        )

    draw = ImageDraw.Draw(image)

    # The generated base occasionally terminates this last leader at the shell.
    # Redraw it deterministically so the bottom-right callout reaches Square.
    draw.line(
        [(1329, 634), (1258, 634), (1041, 409)],
        fill=(238, 240, 241),
        width=2,
    )
    draw.ellipse(
        (1035, 403, 1047, 415),
        fill=(73, 213, 238),
        outline=(222, 251, 255),
        width=1,
    )

    title_font = load_font(34)
    callout_title_font = load_font(18)
    description_font = load_font(20)
    footer_font = load_font(14)

    draw.text(
        (image.width / 2, 10),
        labels.get("title", ""),
        fill=(245, 245, 245),
        font=title_font,
        anchor="ma",
    )

    for callout in callouts:
        x, y, width, _ = SLOTS[callout["slot"]]
        padding = 22 if callout["slot"] == "top" else 17
        max_width = width - padding * 2
        for value, font, text_y, color in (
            (callout.get("title", ""), callout_title_font, y + 14, (245, 245, 245)),
            (
                callout.get("description", ""),
                description_font,
                y + 43,
                (194, 194, 204),
            ),
        ):
            if draw.textlength(value, font=font) > max_width:
                sys.exit(
                    f"controller-map: text is too wide for {callout['slot']}: "
                    f"{value!r}"
                )
            draw.text((x + padding, text_y), value, fill=color, font=font)

    draw.text(
        (image.width / 2, 897),
        labels.get("footer", ""),
        fill=(179, 179, 187),
        font=footer_font,
        anchor="ma",
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, format="PNG", optimize=True)
    print(f"Rendered {output_path}")


if __name__ == "__main__":
    main()
