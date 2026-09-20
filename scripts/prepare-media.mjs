#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

function die(message) {
  console.error(`\n[media-prep] ${message}\n`);
  process.exit(1);
}

function getArg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function run(command, args, { json = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: json ? ["ignore", "pipe", "pipe"] : "inherit", windowsHide: true });
    let stdout = "";
    let stderr = "";
    if (json) {
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
    }
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with code ${code}\n${stderr}`));
    });
  });
}

async function probe(input) {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,format_name:stream=index,codec_type,codec_name,width,height,channels:stream_tags=language,title",
    "-of", "json",
    input,
  ], { json: true });
  return JSON.parse(stdout);
}

const input = getArg("--input");
if (!input) die("Usage: npm run media:prepare -- --input \"path/to/movie.mkv\" [--output \"path/to/movie.browser.mp4\"]");

if (!existsSync(input)) die(`Input file not found: ${input}`);
const resolvedInput = path.resolve(input);
const ext = path.extname(resolvedInput);
const base = resolvedInput.slice(0, -ext.length);
const output = path.resolve(getArg("--output", `${base}.browser.mp4`));
const audioIndexArg = getArg("--audio-index", null);
const audioIndex = audioIndexArg === null ? null : Number(audioIndexArg);
const crf = getArg("--crf", "20");
const preset = getArg("--preset", "medium");
const overwrite = hasFlag("--overwrite");

if (audioIndex !== null && (!Number.isInteger(audioIndex) || audioIndex < 0)) die("--audio-index must be a non-negative integer");

let info;
try {
  info = await probe(resolvedInput);
} catch (error) {
  die(`ffprobe failed. Make sure FFmpeg is installed and available in PATH.\n${error.message}`);
}

const streams = Array.isArray(info.streams) ? info.streams : [];
const video = streams.find((s) => s.codec_type === "video");
const audioStreams = streams.filter((s) => s.codec_type === "audio");
const selectedAudioStreams = audioIndex === null ? audioStreams : [audioStreams[audioIndex]].filter(Boolean);

if (!video) die("No video stream was found.");
if (audioIndex !== null && selectedAudioStreams.length === 0) {
  die(`Audio stream ${audioIndex} was not found.`);
}

console.log("[media-prep] Input :", resolvedInput);
console.log("[media-prep] Video :", `${video.codec_name ?? "unknown"} ${video.width ?? "?"}x${video.height ?? "?"}`);
console.log(
  "[media-prep] Audio :",
  selectedAudioStreams.length
    ? selectedAudioStreams.map((a, i) => {
        const lang = a.tags?.language ? ` (${a.tags.language})` : "";
        return `#${i + 1} ${a.codec_name ?? "unknown"} ${a.channels ?? "?"}ch${lang}`;
      }).join(" | ")
    : "none",
);
console.log("[media-prep] Output:", output);

const ffmpegArgs = [
  "-hide_banner",
  "-i", resolvedInput,
  "-map", "0:v:0",
  ...(audioIndex === null ? ["-map", "0:a?"] : ["-map", `0:a:${audioIndex}?`]),
  "-c:v", "libx264",
  "-preset", preset,
  "-crf", crf,
  "-pix_fmt", "yuv420p",
  "-profile:v", "high",
  ...(selectedAudioStreams.length ? [
    "-c:a", "aac",
    "-b:a", "160k",
    "-ac", "2",
    "-ar", "48000",
  ] : []),
  "-movflags", "+faststart",
  ...(overwrite ? ["-y"] : ["-n"]),
  output,
];

try {
  await run("ffmpeg", ffmpegArgs);
} catch (error) {
  die(error.message);
}

const manifest = {
  version: 1,
  preparedAt: new Date().toISOString(),
  input: path.basename(resolvedInput),
  output: path.basename(output),
  playback: {
    container: "mp4",
    video: "h264",
    audio: selectedAudioStreams.length ? "aac" : null,
    channels: selectedAudioStreams.length ? 2 : null,
    fastStart: true,
    audioTracks: selectedAudioStreams.map((audio, index) => ({
      index,
      sourceCodec: audio.codec_name ?? null,
      language: audio.tags?.language ?? null,
      title: audio.tags?.title ?? null,
    })),
  },
  source: {
    videoCodec: video.codec_name ?? null,
    audioCodecs: audioStreams.map((audio) => audio.codec_name ?? null),
  },
};

const manifestPath = `${output}.smart-upload.json`;
await import("node:fs/promises").then(({ writeFile }) =>
  writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8")
);

console.log(`\n[media-prep] Done. Browser copy: ${output}`);
console.log(`[media-prep] Manifest: ${manifestPath}`);
console.log("[media-prep] Upload the .browser.mp4 beside the original file in the same Drive folder.");
