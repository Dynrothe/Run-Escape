#!/usr/bin/env python3
"""
Video Map Importer for RuneSurvivors.

Converts any video file into:
1. A compressed 1-bit RLE binary map file (public/<name>.bin)
2. An audio track (src/media/music/<name>.ogg and .mp3)
3. A TypeScript map recipe definition ready for the dev menu

Usage:
    python3 scripts/import_video_map.py path/to/my_video.mp4 --name my_video
    python3 scripts/import_video_map.py path/to/my_video.mp4 --name my_video --title "My Cool Video" --threshold 130
"""

import argparse
import json
import os
import re
import subprocess
import sys
import zlib


def probe_video(path):
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,duration",
        "-of", "json", path,
    ]
    out = subprocess.check_output(cmd)
    info = json.loads(out)["streams"][0]
    return int(info["width"]), int(info["height"])


def varint(n):
    """7-bit little-endian varint."""
    out = bytearray()
    while n >= 0x80:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    out.append(n)
    return bytes(out)


def encode_frame(gray, w, h, threshold, invert=False):
    """
    RLE of alternating runs, always starting with bit 0 (Playable Floor).
    Standard convention:
      - Bit 0 = Bright pixel (>= threshold) = Playable Floor
      - Bit 1 = Dark pixel (< threshold) = Blocked Void
    If invert is True:
      - Bit 0 = Dark pixel (< threshold) = Playable Floor
      - Bit 1 = Bright pixel (>= threshold) = Blocked Void
    """
    total = w * h
    out = bytearray()
    pos = 0
    current_bit = 0  # Starts with bit 0 (floor)

    while pos < total:
        run = 0
        while pos < total:
            is_bright = gray[pos] >= threshold
            if invert:
                bit = 0 if not is_bright else 1
            else:
                bit = 0 if is_bright else 1

            if bit != current_bit:
                break
            run += 1
            pos += 1

        out += varint(run)
        current_bit ^= 1

    return bytes(out)


def main():
    parser = argparse.ArgumentParser(description="Import video as dynamic RuneSurvivors arena map")
    parser.add_argument("video", help="Input video file path (mp4, mkv, webm, etc.)")
    parser.add_argument("--name", help="Identifier name for the map (e.g. bad_apple, rickroll)")
    parser.add_argument("--title", help="Human-readable title (e.g. 'Bad Apple', 'Rick Roll')")
    parser.add_argument("--width", type=int, default=96, help="Arena video width in tiles (default: 96)")
    parser.add_argument("--height", type=int, default=None, help="Arena video height in tiles (default: auto from aspect ratio)")
    parser.add_argument("--fps", type=float, default=30.0, help="Framerate (default: 30)")
    parser.add_argument("--threshold", type=int, default=128, help="Grayscale threshold 0-255 (default: 128)")
    parser.add_argument("--invert", action="store_true", help="Invert black/white mapping")
    parser.add_argument("--no-audio", action="store_true", help="Skip audio extraction")

    args = parser.parse_args()

    if not os.path.isfile(args.video):
        sys.exit(f"Error: Video file not found: {args.video}")

    # Determine default name
    base_name = os.path.splitext(os.path.basename(args.video))[0]
    map_name = args.name or re.sub(r"[^a-zA-Z0-9_]+", "_", base_name).strip("_").lower()
    map_title = args.title or map_name.replace("_", " ").title()

    src_w, src_h = probe_video(args.video)
    w = args.width
    h = args.height or round(w * src_h / src_w)
    # Ensure height is even for clean tiling
    if h % 2 != 0:
        h += 1

    print(f"🎬 Importing '{args.video}' -> Map '{map_name}'")
    print(f"   Source: {src_w}x{src_h}  ->  Target: {w}x{h} @ {args.fps} FPS (Threshold: {args.threshold})")

    # 1. Process Video Frames
    proc = subprocess.Popen(
        [
            "ffmpeg", "-v", "error", "-i", args.video,
            "-vf", f"fps={args.fps},scale={w}:{h}",
            "-pix_fmt", "gray", "-f", "rawvideo", "-",
        ],
        stdout=subprocess.PIPE,
    )

    frame_size = w * h
    raw_payload = bytearray()
    frames = 0

    print("   Decoding and compressing frames...")
    while True:
        buf = proc.stdout.read(frame_size)
        if not buf or len(buf) < frame_size:
            break
        raw_payload += encode_frame(buf, w, h, args.threshold, args.invert)
        frames += 1
        if frames % 300 == 0:
            print(f"     ... {frames} frames ({frames / args.fps:.1f}s)", file=sys.stderr)
    proc.wait()

    if frames == 0:
        sys.exit("Error: No frames could be decoded from video.")

    # Compress with raw deflate (wbits=-15 matches pako.inflateRaw in browser)
    compressor = zlib.compressobj(level=9, wbits=-15)
    compressed = compressor.compress(bytes(raw_payload)) + compressor.flush()

    os.makedirs("public", exist_ok=True)
    bin_path = os.path.join("public", f"{map_name}.bin")
    with open(bin_path, "wb") as f:
        f.write(compressed)

    duration = frames / args.fps
    print(f"   ✅ Saved video data: {bin_path} ({len(compressed) / 1024:.1f} KB, {frames} frames, {duration:.1f}s)")

    # 2. Extract Audio
    if not args.no_audio:
        os.makedirs("src/media/music", exist_ok=True)
        ogg_path = os.path.join("src/media/music", f"{map_name}.ogg")
        mp3_path = os.path.join("src/media/music", f"{map_name}.mp3")

        # Try opus in ogg
        ret = subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", args.video, "-vn", "-c:a", "libopus", "-b:a", "128k", ogg_path]
        )
        # Also create mp3 as fallback
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", args.video, "-vn", "-c:a", "libmp3lame", "-q:a", "2", mp3_path]
        )
        if os.path.exists(ogg_path) or os.path.exists(mp3_path):
            print(f"   🎵 Extracted audio track to src/media/music/{map_name}.(ogg/mp3)")
        else:
            print("   ⚠️  No audio stream found or extraction failed; arena will play silently.")

    print("\n" + "=" * 60)
    print("✨ Map successfully generated!")
    print(f"Map ID: scaperune_{map_name}")
    print(f"Bin file: public/{map_name}.bin")
    print(f"Music ID: {map_name}")
    print(f"Dimensions: {w}x{h}, {frames} frames ({duration:.1f}s)")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
