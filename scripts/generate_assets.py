"""Generate the deterministic CommandDock raster icon."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "media" / "commanddock-icon.png"
SCALE = 4
SIZE = 256


def scaled(value: float) -> int:
    return round(value * SCALE)


def rounded_rectangle(
    draw: ImageDraw.ImageDraw,
    bounds: tuple[float, float, float, float],
    radius: float,
    *,
    fill: str | None = None,
    outline: str | None = None,
    width: float = 1,
) -> None:
    draw.rounded_rectangle(
        tuple(scaled(value) for value in bounds),
        radius=scaled(radius),
        fill=fill,
        outline=outline,
        width=scaled(width),
    )


def main() -> None:
    canvas = Image.new("RGB", (SIZE * SCALE, SIZE * SCALE), "#171913")
    draw = ImageDraw.Draw(canvas)

    rounded_rectangle(draw, (18, 18, 238, 238), 47, fill="#d8ff43")

    line_width = scaled(12)
    ink = "#111309"
    rounded_rectangle(draw, (47, 42, 209, 165), 23, outline=ink, width=12)

    for start, end in (((79, 81), (99, 99)), ((99, 99), (79, 117)), ((119, 117), (166, 117))):
        draw.line(
            (scaled(start[0]), scaled(start[1]), scaled(end[0]), scaled(end[1])),
            fill=ink,
            width=line_width,
            joint="curve",
        )

    draw.line(
        (scaled(64), scaled(165), scaled(64), scaled(190), scaled(192), scaled(190), scaled(192), scaled(165)),
        fill=ink,
        width=line_width,
        joint="curve",
    )

    canvas = canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUTPUT, format="PNG", optimize=True)
    print(f"generated {OUTPUT} ({canvas.width}x{canvas.height})")


if __name__ == "__main__":
    main()
