#!/usr/bin/env python3
"""AWS-free Smart Upload Google Drive -> HLS processor."""
from __future__ import annotations
import argparse, json, os, re, subprocess, tempfile
from pathlib import Path
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaFileUpload

SCOPE = ["https://www.googleapis.com/auth/drive"]
VIDEO_EXT = {".mkv", ".mp4", ".webm", ".mov", ".avi", ".m4v", ".ts", ".m2ts", ".wmv", ".flv", ".mpg", ".mpeg"}

def service(sa_path: str):
    creds = service_account.Credentials.from_service_account_file(sa_path, scopes=SCOPE)
    return build("drive", "v3", credentials=creds, cache_discovery=False)

def list_children(drive, parent: str):
    out=[]; token=None
    while True:
        r=drive.files().list(q=f"'{parent}' in parents and trashed=false", spaces="drive", pageSize=1000, pageToken=token, fields="nextPageToken,files(id,name,mimeType,size,parents)").execute()
        out.extend(r.get("files",[])); token=r.get("nextPageToken")
        if not token: return out

def download(drive, file_id: str, target: Path):
    req=drive.files().get_media(fileId=file_id)
    with target.open("wb") as fh:
        dl=MediaIoBaseDownload(fh, req, chunksize=16*1024*1024); done=False
        while not done: _,done=dl.next_chunk()

def upload_file(drive, parent: str, path: Path, mime: str):
    media=MediaFileUpload(str(path), mimetype=mime, resumable=True, chunksize=16*1024*1024)
    meta={"name":path.name,"parents":[parent]}
    existing=drive.files().list(q=f"'{parent}' in parents and name='{path.name}' and trashed=false", spaces="drive", fields="files(id)").execute().get("files",[])
    if existing: return drive.files().update(fileId=existing[0]["id"], media_body=media, fields="id,name").execute()
    return drive.files().create(body=meta, media_body=media, fields="id,name").execute()

def ensure_folder(drive, parent: str, name: str):
    q=f"'{parent}' in parents and name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    found=drive.files().list(q=q, spaces="drive", fields="files(id,name)").execute().get("files",[])
    if found: return found[0]["id"]
    return drive.files().create(body={"name":name,"mimeType":"application/vnd.google-apps.folder","parents":[parent]}, fields="id").execute()["id"]

def ffprobe_tracks(src: Path):
    p=subprocess.run(["ffprobe","-v","error","-show_entries","stream=index,codec_type:stream_tags=language,title","-of","json",str(src)],capture_output=True,text=True,check=True)
    return json.loads(p.stdout).get("streams",[])

def prepare_browser_audio_sidecars(src: Path, tracks, temp_root: Path):
    """Create browser-safe M4A copies for every source audio track.

    These sidecars are used by the web player even when HLS is active, making
    audio independent from browser/HLS alternate-audio selection.
    """
    sidecars=[]
    audio_tracks=[x for x in tracks if x.get("codec_type")=="audio"]
    for i,a in enumerate(audio_tracks):
        tags=a.get("tags") or {}
        language=str(tags.get("language") or "und").lower().replace(".", "") or "und"
        ext=src.suffix
        base=src.name[:-len(ext)] if ext else src.name
        dst=temp_root/f"{base}.browser.audio.{i}.{language}.m4a"
        cmd=["ffmpeg","-y","-i",str(src),"-map",f"0:{a['index']}","-vn","-c:a","aac",
             "-profile:a","aac_low","-b:a","160k","-ac","2","-ar","48000",
             "-movflags","+faststart",str(dst)]
        r=subprocess.run(cmd,capture_output=True,text=True)
        if r.returncode==0:
            sidecars.append(dst)
        else:
            print(f"Warning: audio sidecar {i} could not be converted to AAC:")
            print(r.stderr[-1200:])
    return sidecars

def prepare_browser_copy(src: Path, tracks, temp_root: Path):
    """Create a browser-safe progressive MP4 used as the audio-reliable baseline."""
    ext = src.suffix
    base = src.name[:-len(ext)] if ext else src.name
    dst = temp_root / f"{base}.browser.mp4"
    audio_tracks = [x for x in tracks if x.get("codec_type") == "audio"]

    cmd = ["ffmpeg", "-y", "-i", str(src), "-map", "0:v:0"]
    if audio_tracks:
        cmd += ["-map", f"0:{audio_tracks[0]['index']}?"]
    cmd += [
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-profile:v", "high", "-pix_fmt", "yuv420p",
    ]
    if audio_tracks:
        cmd += [
            "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "160k",
            "-ac", "2", "-ar", "48000",
        ]
    else:
        cmd += ["-an"]
    cmd += ["-movflags", "+faststart", str(dst)]

    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"browser MP4 conversion failed:\\n{r.stderr[-1600:]}")
    return dst

def process(src: Path, out: Path):
    out.mkdir(parents=True,exist_ok=True); tracks=ffprobe_tracks(src)
    variants=[(1920,1080,5500000),(1280,720,3200000),(854,480,1500000)]; maps=[]
    audio_tracks=[x for x in tracks if x.get("codec_type")=="audio"]

    # Video renditions are video-only. Audio is generated once per source
    # language as browser-safe AAC HLS renditions and attached to every video
    # variant through the master playlist's AUDIO group.
    for i,(w,h,br) in enumerate(variants):
        vdir=out/f"v{i}"; vdir.mkdir(exist_ok=True)
        cmd=["ffmpeg","-y","-i",str(src),"-map","0:v:0",
             "-vf",f"scale=w={w}:h={h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2",
             "-c:v","libx264","-preset","veryfast","-crf","21","-profile:v","high","-level:v","4.2","-pix_fmt","yuv420p",
             "-b:v",str(br),"-maxrate",str(int(br*1.12)),"-bufsize",str(br*2),"-g","48",
             "-keyint_min","48","-sc_threshold","0","-an","-f","hls",
             "-hls_time","6","-hls_playlist_type","vod","-hls_flags","independent_segments",
             "-hls_segment_filename",str(vdir/"seg_%05d.ts"),str(vdir/"index.m3u8")]
        subprocess.run(cmd,check=True); maps.append((i,w,h,br))

    audio_maps=[]
    label_map={"eng":"English","en":"English","hin":"Hindi","hi":"Hindi","tam":"Tamil","ta":"Tamil",
               "tel":"Telugu","te":"Telugu","mal":"Malayalam","ml":"Malayalam","kan":"Kannada","kn":"Kannada",
               "ben":"Bengali","bn":"Bengali","mar":"Marathi","mr":"Marathi","pan":"Punjabi","pa":"Punjabi",
               "guj":"Gujarati","gu":"Gujarati","und":"Unknown"}
    for ai,a in enumerate(audio_tracks):
        adir=out/f"a{ai}"; adir.mkdir(exist_ok=True)
        tags=a.get("tags") or {}; lang=str(tags.get("language") or "und").lower()
        title=str(tags.get("title") or label_map.get(lang) or lang.upper())
        cmd=["ffmpeg","-y","-i",str(src),"-map",f"0:{a['index']}","-vn","-c:a","aac",
             "-profile:a","aac_low","-b:a","192k","-ac","2","-ar","48000","-f","hls","-hls_time","6",
             "-hls_playlist_type","vod","-hls_flags","independent_segments",
             "-hls_segment_filename",str(adir/"seg_%05d.ts"),str(adir/"index.m3u8")]
        r=subprocess.run(cmd,capture_output=True,text=True)
        if r.returncode==0:
            audio_maps.append((ai,lang,title))
        else:
            print(f"Warning: audio track {ai} could not be converted to AAC:")
            print(r.stderr[-1200:])

    subs=[]
    for si,s in enumerate([x for x in tracks if x.get("codec_type")=="subtitle"]):
        tags=s.get("tags") or {}; lang=tags.get("language") or "und"; title=tags.get("title") or lang
        dst=out/f"sub_{si}_{re.sub(r'[^A-Za-z0-9_-]','_',lang)}.vtt"
        r=subprocess.run(["ffmpeg","-y","-i",str(src),"-map",f"0:{s['index']}","-c:s","webvtt",str(dst)],capture_output=True,text=True)
        if r.returncode==0: subs.append((dst.name,lang,title))

    master=["#EXTM3U","#EXT-X-VERSION:3"]
    if audio_maps:
        for n,(ai,lang,title) in enumerate(audio_maps):
            default="YES" if n==0 else "NO"
            auto="YES" if n==0 else "YES"
            master.append(
                f'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="{title}",LANGUAGE="{lang}",'
                f'DEFAULT={default},AUTOSELECT={auto},URI="a{ai}/index.m3u8"'
            )
    for name,lang,title in subs:
        master.append(f'#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="{title}",LANGUAGE="{lang}",DEFAULT=NO,AUTOSELECT=YES,URI="{name}"')
    for i,w,h,br in maps:
        attrs=[f"BANDWIDTH={br + (192000 if audio_maps else 0)}",f"RESOLUTION={w}x{h}"]
        if audio_maps: attrs.append('CODECS="avc1.64002A,mp4a.40.2"')
        if audio_maps: attrs.append('AUDIO="audio"')
        if subs: attrs.append('SUBTITLES="subs"')
        master += [f'#EXT-X-STREAM-INF:{",".join(attrs)}',f'v{i}/index.m3u8']
    (out/"master.m3u8").write_text("\n".join(master)+"\n",encoding="utf-8")
    return tracks

def upload_tree(drive, parent: str, root: Path):
    folder_ids={"":parent}
    dirs=sorted([p for p in root.rglob("*") if p.is_dir()], key=lambda x: len(x.parts))
    for d in dirs:
        rel=str(d.relative_to(root)).replace(os.sep,"/"); par=str(Path(rel).parent).replace(os.sep,"/")
        if par==".": par=""
        folder_ids[rel]=ensure_folder(drive,folder_ids[par],d.name)
    for f in root.rglob("*"):
        if not f.is_file(): continue
        rel=str(f.parent.relative_to(root)).replace(os.sep,"/"); rel="" if rel=="." else rel
        mime=("application/vnd.apple.mpegurl" if f.suffix==".m3u8" else
              "text/vtt" if f.suffix==".vtt" else
              "audio/mp4" if f.suffix==".m4a" else
              "video/mp2t")
        upload_file(drive,folder_ids[rel],f,mime)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--service-account",required=True); ap.add_argument("--media-folder",required=True); ap.add_argument("--file-id"); ap.add_argument("--output-root",default="SMART-HLS"); args=ap.parse_args()
    drive=service(args.service_account); files=list_children(drive,args.media_folder)
    targets=[f for f in files if Path(f["name"]).suffix.lower() in VIDEO_EXT] if not args.file_id else [f for f in files if f["id"]==args.file_id]
    if args.file_id and not targets: targets=[drive.files().get(fileId=args.file_id,fields="id,name").execute()]
    root=ensure_folder(drive,args.media_folder,args.output_root)
    for item in targets:
        hls_folder=ensure_folder(drive,root,item["id"])
        with tempfile.TemporaryDirectory(prefix="smart-hls-") as td:
            td=Path(td); src=td/item["name"]; out=td/"hls"; print(f"Processing {item['name']} ({item['id']})")
            download(drive,item["id"],src)
            tracks=process(src,out)
            upload_tree(drive,hls_folder,out)
            browser_copy = prepare_browser_copy(src,tracks,td)
            upload_file(drive,args.media_folder,browser_copy,"video/mp4")
            for sidecar in prepare_browser_audio_sidecars(src,tracks,td):
                upload_file(drive,args.media_folder,sidecar,"audio/mp4")
            print(f"Finished {item['id']}")

if __name__=="__main__": main()
