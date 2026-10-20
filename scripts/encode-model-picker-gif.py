"""Encode finite real-browser screenshots; never draws or interpolates frames."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


def encode(manifest_path: Path, output: Path, preview: Path | None = None) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["format"] == "real-browser-png-sequence-v1"
    assert manifest["complete"] is True, "Never encode an incomplete recording"
    frames = manifest["frames"]
    assert 40 <= len(frames) <= 300, "Require a finite screenshot sequence"
    timestamps = [frame["capturedAtMs"] for frame in frames]
    assert all(b > a for a, b in zip(timestamps, timestamps[1:]))
    images = []
    for frame in frames:
        path = manifest_path.parent / frame["file"]
        assert path.resolve().parent == manifest_path.parent.resolve()
        assert hashlib.sha256(path.read_bytes()).hexdigest() == frame["sha256"]
        with Image.open(path) as image:
            images.append(image.convert("RGB"))
    assert len({image.size for image in images}) == 1
    assert len({frame["sha256"] for frame in frames}) > 20

    # Build one palette from real screenshots and their actual slider crops.
    # Weighting the small slider crop in palette training preserves its violet
    # pixels. This training sheet is never used as an output frame.
    sampled = list(range(0, len(images), max(1, len(images) // 24)))
    tile_width, tile_height = 256, 256
    training = Image.new("RGB", (tile_width * 2, tile_height * len(sampled)))
    rect = manifest["effortRect"]
    left, top = max(0, int(rect["x"])), max(0, int(rect["y"]))
    right = min(images[0].width, int(rect["x"] + rect["width"] + 1))
    bottom = min(images[0].height, int(rect["y"] + rect["height"] + 1))
    for row, index in enumerate(sampled):
        full = images[index].copy()
        full.thumbnail((tile_width, tile_height), Image.Resampling.LANCZOS)
        training.paste(full, (0, row * tile_height))
        crop = images[index].crop((left, top, right, bottom))
        crop = crop.resize((tile_width, tile_height), Image.Resampling.NEAREST)
        training.paste(crop, (tile_width, row * tile_height))
    palette = training.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    encoded = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in images]

    # GIF has 10ms ticks. Quantize cumulative capture boundaries, rather than
    # assigning a made-up fixed frame rate or adding interpolated frames.
    start = timestamps[0]
    boundaries = [round((time - start) / 10) for time in timestamps]
    boundaries.append(round((manifest["endAtMs"] - start) / 10))
    durations = [max(1, b - a) * 10 for a, b in zip(boundaries, boundaries[1:])]
    output.parent.mkdir(parents=True, exist_ok=True)
    encoded[0].save(
        output,
        save_all=True,
        append_images=encoded[1:],
        duration=durations,
        loop=0,
        optimize=False,
        disposal=1,
    )
    if preview is not None:
        apex = [i for i, frame in enumerate(frames) if frame["phase"] == "apex shimmer"]
        assert apex, "Require a real apex screenshot for the preview"
        preview.parent.mkdir(parents=True, exist_ok=True)
        images[apex[len(apex) // 2]].save(preview)

    with Image.open(output) as gif:
        count = gif.n_frames
        total_ms = 0
        decoded_hashes = set()
        purple_pixels = 0
        for index in range(count):
            gif.seek(index)
            total_ms += gif.info.get("duration", 0)
            rgb = gif.convert("RGB")
            decoded_hashes.add(hashlib.sha256(rgb.tobytes()).hexdigest())
            if index % 10 == 0:
                purple_pixels += sum(b > r + 10 and b > g + 10 for r, g, b in rgb.getdata())
        assert gif.is_animated and count >= 30
        assert len(decoded_hashes) >= 30, "The GIF must contain actual changing frames"
        assert total_ms == sum(durations), "The GIF must retain measured screenshot timing"
        assert purple_pixels > 0, "The encoded palette must retain violet matrix pixels"
    assert output.stat().st_size < 5 * 1024 * 1024, "Keep the playable attachment below 5MiB"
    report = {
        "capturedFrames": len(frames),
        "encodedFrames": count,
        "distinctDecodedFrames": len(decoded_hashes),
        "measuredCaptureSpanMs": round(manifest["endAtMs"] - start, 3),
        "gifDurationMs": total_ms,
        "frameDurationRangeMs": [min(durations), max(durations)],
        "bytes": output.stat().st_size,
        "size": list(images[0].size),
        "purplePixelsVerified": purple_pixels,
        "frameSource": "Only SHA256-verified browser PNGs; palette quantization, no drawing or interpolation.",
    }
    (output.parent / "model-picker-motion-encoding.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()
    print(json.dumps(encode(args.manifest, args.output, args.preview), indent=2))


if __name__ == "__main__":
    main()
