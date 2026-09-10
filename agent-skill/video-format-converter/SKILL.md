---
name: video-format-converter
description: Use Video Format Converter's local offline CLI to inspect supported video targets and convert ordinary video files to MP4, MKV, WEBM, or GIF.
---

# Video Format Converter Skill

Use the bundled wrapper at `scripts/video-format-converter.js`. It locates the Video Format Converter application and invokes its local CLI.

## Workflow

1. Check available targets for a video:

   `node scripts/video-format-converter.js targets <file> --json`

2. Convert one or more video files:

   `node scripts/video-format-converter.js convert <files...> --to <format> --output-dir <directory> --json`

3. Use `capabilities --json` when FFmpeg availability matters.

## Options

- Video: `--video-codec h264|h265|av1`
- Prefer `--json` and read `outputs[].path` from stdout.
- Preserve the user's requested output directory and do not overwrite existing files without permission.

If the wrapper reports that Video Format Converter is missing, ask the user to open the application and use “Connect to Agent” again.
