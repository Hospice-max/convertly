import hashlib
import hmac
import os
import re
from pathlib import PurePath
from urllib.parse import quote

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Convertly Conversion API", version="1.0.0")
MAX_FILE_BYTES = 20 * 1024 * 1024
ALLOWED_PAIRS = {
    ("docx", "pdf"), ("pdf", "docx"),
    ("xlsx", "pdf"), ("pdf", "xlsx"),
    ("pptx", "pdf"), ("pdf", "pptx"),
    ("jpg", "pdf"), ("jpeg", "pdf"), ("png", "pdf"), ("webp", "pdf"),
    ("webp", "jpg"), ("webp", "jpeg"), ("jpg", "png"), ("jpeg", "png"),
    ("png", "webp"), ("jpg", "webp"), ("jpeg", "webp"),
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CONVERTLY_ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class CreateJobRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=240)
    source: str = Field(min_length=2, max_length=8)
    target: str = Field(min_length=2, max_length=8)
    size: int = Field(gt=0, le=MAX_FILE_BYTES)


def _credentials() -> tuple[str, str, str]:
    api_key = os.getenv("CLOUDCONVERT_API_KEY", "").strip()
    signing_secret = os.getenv("CONVERTLY_JOB_SIGNING_SECRET", "").strip()
    base_url = os.getenv("CLOUDCONVERT_BASE_URL", "https://api.cloudconvert.com/v2").rstrip("/")
    if not api_key or not signing_secret:
        raise HTTPException(status_code=503, detail="L’API de conversion n’est pas encore configurée.")
    return api_key, signing_secret, base_url


def _signature(secret: str, job_id: str) -> str:
    return hmac.new(secret.encode(), job_id.encode(), hashlib.sha256).hexdigest()


async def _cloudconvert_request(method: str, url: str, **kwargs):
    api_key, _, _ = _credentials()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=8.0)) as client:
            response = await client.request(
                method,
                url,
                headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
                **kwargs,
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="CloudConvert est temporairement inaccessible.") from exc
    if response.status_code >= 400:
        try:
            detail = response.json().get("message", "La conversion n’a pas pu être démarrée.")
        except ValueError:
            detail = "La conversion n’a pas pu être démarrée."
        raise HTTPException(status_code=502, detail=detail)
    return response.json()


@app.get("/api/health")
def health():
    return {"status": "ok", "provider": "cloudconvert"}


@app.post("/api/jobs")
async def create_job(payload: CreateJobRequest):
    source, target = payload.source.lower().lstrip("."), payload.target.lower().lstrip(".")
    if (source, target) not in ALLOWED_PAIRS:
        raise HTTPException(status_code=400, detail="Cette combinaison de formats n’est pas prise en charge.")
    filename = PurePath(payload.filename.replace("\\", "/")).name
    if not filename or filename in {".", ".."}:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide.")

    stem = re.sub(r"\.[^.]+$", "", filename) or "converti"
    output_name = f"{stem}.{target}"
    _, signing_secret, base_url = _credentials()
    result = await _cloudconvert_request(
        "POST",
        f"{base_url}/jobs",
        json={
            "tasks": {
                "upload-file": {"operation": "import/upload"},
                "convert-file": {
                    "operation": "convert",
                    "input": "upload-file",
                    "input_format": source,
                    "output_format": target,
                    "filename": output_name,
                },
                "export-file": {"operation": "export/url", "input": "convert-file"},
            }
        },
    )
    job = result.get("data", {})
    tasks = job.get("tasks", [])
    upload_task = next((task for task in tasks if task.get("name") == "upload-file"), None)
    form = (upload_task or {}).get("result", {}).get("form")
    if not job.get("id") or not form or not form.get("url") or not isinstance(form.get("parameters"), dict):
        raise HTTPException(status_code=502, detail="CloudConvert n’a pas fourni le formulaire d’envoi.")
    return {
        "job_id": job["id"],
        "job_token": _signature(signing_secret, job["id"]),
        "upload": form,
        "max_file_bytes": MAX_FILE_BYTES,
        "filename": output_name,
    }


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str, token: str = Query(min_length=64, max_length=64)):
    if not re.fullmatch(r"[A-Za-z0-9-]{16,80}", job_id):
        raise HTTPException(status_code=404, detail="Tâche introuvable.")
    _, signing_secret, base_url = _credentials()
    expected = _signature(signing_secret, job_id)
    if not hmac.compare_digest(expected, token):
        raise HTTPException(status_code=404, detail="Tâche introuvable.")

    result = await _cloudconvert_request("GET", f"{base_url}/jobs/{quote(job_id, safe='')}")
    job = result.get("data", {})
    tasks = job.get("tasks", [])
    export = next((task for task in tasks if task.get("name") == "export-file"), None)
    exported_files = (export or {}).get("result", {}).get("files", [])
    files = [
        {"filename": item.get("filename", "converted-file"), "url": item.get("url")}
        for item in exported_files if item.get("url")
    ]
    failed_task = next((task for task in tasks if task.get("status") == "error"), None)
    return {
        "status": job.get("status", "processing"),
        "files": files,
        "error": (failed_task or {}).get("message") or job.get("message"),
    }
