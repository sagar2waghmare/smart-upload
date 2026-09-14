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

def process(src: Path, out: Path):
    out.mkdir(parents=True,exist_ok=True); tracks=ffprobe_tracks(src)
    variants=[(1920,1080,5500000),(1280,720,3200000),(854,480,1500000)]; maps=[]
    for i,(w,h,br) in enumerate(variants):
        vdir=out/f"v{i}"; vdir.mkdir(exist_ok=True)
        cmd=["ffmpeg","-y","-i",str(src),"-map","0:v:0","-map","0:a:0?","-vf",f"scale=w={w}:h={h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2","-c:v","libx264","-preset","veryfast","-crf","21","-b:v",str(br),"-maxrate",str(int(br*1.12)),"-bufsize",str(br*2),"-g","48","-keyint_min","48","-sc_threshold","0","-c:a","aac","-b:a","192k","-ac","2","-f","hls","-hls_time","6","-hls_playlist_type","vod","-hls_flags","independent_segments","-hls_segment_filename",str(vdir/"seg_%05d.ts"),str(vdir/"index.m3u8")]
        subprocess.run(cmd,check=True); maps.append((i,w,h,br))
    subs=[]
    for si,s in enumerate([x for x in tracks if x.get("codec_type")=="subtitle"]):
        tags=s.get("tags") or {}; lang=tags.get("language") or "und"; title=tags.get("title") or lang
        dst=out/f"sub_{si}_{re.sub(r'[^A-Za-z0-9_-]','_',lang)}.vtt"
        r=subprocess.run(["ffmpeg","-y","-i",str(src),"-map",f"0:{s['index']}","-c:s","webvtt",str(dst)],capture_output=True,text=True)
        if r.returncode==0: subs.append((dst.name,lang,title))
    master=["#EXTM3U","#EXT-X-VERSION:3"]
    for name,lang,title in subs: master.append(f'#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="{title}",LANGUAGE="{lang}",DEFAULT=NO,AUTOSELECT=YES,URI="{name}"')
    for i,w,h,br in maps:
        extra=',SUBTITLES="subs"' if subs else ''; master += [f'#EXT-X-STREAM-INF:BANDWIDTH={br+192000},RESOLUTION={w}x{h}{extra}',f'v{i}/index.m3u8']
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
        mime="application/vnd.apple.mpegurl" if f.suffix==".m3u8" else ("text/vtt" if f.suffix==".vtt" else "video/mp2t")
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
            download(drive,item["id"],src); process(src,out); upload_tree(drive,hls_folder,out); print(f"Finished {item['id']}")

if __name__=="__main__": main()
