"""Convert an mGBA raw RGBX frame to a PNG image."""

import argparse
import struct
import zlib
from pathlib import Path


def png_chunk(kind: bytes, data: bytes) -> bytes:
    payload = kind + data
    return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload))


def convert(input_path: Path, output_path: Path, width: int, height: int) -> None:
    if width <= 0 or height <= 0:
        raise ValueError("width and height must be positive")

    raw = input_path.read_bytes()
    expected = width * height * 4
    if len(raw) != expected:
        raise ValueError(
            f"expected {expected} bytes for {width}x{height} RGBX, got {len(raw)}"
        )

    rows = bytearray()
    stride = width * 4
    for offset in range(0, len(raw), stride):
        rows.append(0)  # PNG filter: none
        row = raw[offset : offset + stride]
        for pixel in range(0, stride, 4):
            rows.extend(row[pixel : pixel + 3])  # Discard the unused fourth byte.

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", header)
        + png_chunk(b"IDAT", zlib.compress(rows))
        + png_chunk(b"IEND", b"")
    )
    output_path.write_bytes(png)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="mGBA raw RGBX frame")
    parser.add_argument("output", nargs="?", type=Path, help="PNG path (default: input.png)")
    parser.add_argument("--width", type=int, default=160, help="frame width (default: 160)")
    parser.add_argument("--height", type=int, default=144, help="frame height (default: 144)")
    args = parser.parse_args()

    output = args.output or args.input.with_suffix(".png")
    try:
        convert(args.input, output, args.width, args.height)
    except (OSError, ValueError) as error:
        parser.exit(1, f"error: {error}\n")
    print(f"Saved {output}")
