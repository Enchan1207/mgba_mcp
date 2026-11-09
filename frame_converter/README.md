# mGBA frame converter

Convert a single raw video frame written by `mgba_server/cli/main.c` to PNG.
The source format is 4 bytes per pixel in R, G, B, unused order. No third-party
Python packages are needed.

```sh
cd frame_converter
uv run frame-converter ../gameboy.raw
```

The command writes `../gameboy.png`. To specify an output file or dimensions:

```sh
uv run frame-converter input.bin image.png --width 256 --height 224
```

The defaults are 160 × 144, matching Game Boy mode. The existing `output.bin`
was captured in SGB mode; convert it with `--width 256 --height 224`. For GBA
frames, pass the dimensions printed by the mGBA CLI.
