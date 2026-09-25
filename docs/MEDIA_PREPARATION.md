# Smart Upload browser-compatible media preparation

Smart Upload keeps the original media file for VLC/direct playback and can use a browser-compatible copy for Chrome, Android browsers, and other HTML5 players.

## Why this exists

Video.js is a player framework; it still depends on the browser's media decoder. An MKV containing AC-3 audio can therefore fail in a browser even though VLC plays it.

The preparation pipeline creates:

- **Original:** unchanged MKV/other source for VLC.
- **Browser copy:** `OriginalName.browser.mp4`
  - H.264 video
  - AAC audio
  - stereo output
  - `faststart` MP4 layout

FFmpeg is intentionally run outside Vercel/Cloudflare because transcoding is CPU-intensive.

## Install FFmpeg

Install FFmpeg so both `ffmpeg` and `ffprobe` are available in PATH.

Check:

```text
ffmpeg -version
ffprobe -version
```

## Prepare a movie

From the Smart Upload repository:

```text
npm run media:prepare -- --input "D:\Media\The Movie.mkv"
```

This creates:

```text
The Movie.browser.mp4
The Movie.browser.mp4.smart-upload.json
```

To replace an existing browser copy:

```text
npm run media:prepare -- --input "D:\Media\The Movie.mkv" --overwrite
```

Choose another audio stream with:

```text
npm run media:prepare -- --input "D:\Media\The Movie.mkv" --audio-index 1
```

The default is audio stream 0.

## Google Drive workflow

The prepared MP4 should be uploaded into the **same Google Drive folder as the original** and must keep the exact naming pattern:

```text
Original.mkv
Original.browser.mp4
```

Smart Upload hides `.browser.mp4` files from the normal library and automatically looks for the matching browser copy when a user starts playback.

The original file remains the VLC/direct-play source.

For large Drive files, rclone can serve a Drive remote over localhost HTTP, which can also be used as an input source for local tooling. Keep that server bound to localhost unless you deliberately configure authentication and network access.

## Current playback design

Smart Upload uses a browser-first playback architecture.

Primary playback:
- `h265web.js PRO` is loaded lazily in the browser.
- It handles VOD MP4/MOV/MKV/H.264/HEVC/HLS through native/MSE/WebCodec/WASM routes where supported.
- The Smart Upload Drive range API remains the media source; the player does not download the entire movie before playback.

Fallbacks:
- If the h265web engine cannot load or decode a source, the player falls back to the browser's native media element.
- Existing `.browser.mp4` and prepared HLS assets remain supported.
- The original media remains untouched.

The movie logo is preserved in the premium player overlay together with resume position, seeking, playback-rate, fullscreen, subtitle rendering, episode navigation and progress reporting.

This player-side strategy is intentionally separate from the upload/preparation pipeline. It reduces unnecessary pre-conversion for sources the browser engine can handle directly.
