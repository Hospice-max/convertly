# Convertly

Responsive file-conversion app built with Next.js and TypeScript, a FastAPI/Python orchestration service, and CloudConvert for file processing.

## Supported conversions

- Word DOCX ↔ PDF
- Excel XLSX ↔ PDF
- PowerPoint PPTX ↔ PDF
- JPG, PNG, and WEBP to PDF
- WEBP → JPG, JPG → PNG, PNG → WEBP, and JPG → WEBP
- Multiple files per batch, with one CloudConvert job per file
- 20 MB per-file limit in the interface; the API also validates the declared file size

Files are posted directly from the browser to CloudConvert’s temporary upload form. Convertly does not receive the file contents. The browser checks the actual selected file size; the backend checks the declared size before creating a job. Before public launch, add protection against automated job creation (Vercel Firewall rate limits or CAPTCHA), since each API call can create a billable CloudConvert job.

## CloudConvert setup

1. Create a CloudConvert API key with job creation and read permissions.
2. Never expose the key in a `NEXT_PUBLIC_*` variable.
3. Set the server-side environment variables `CLOUDCONVERT_API_KEY` and `CONVERTLY_JOB_SIGNING_SECRET` in Vercel. Use a random signing secret of at least 32 bytes. `CLOUDCONVERT_BASE_URL` is optional and defaults to `https://api.cloudconvert.com/v2`.
4. For local development, use CloudConvert’s sandbox API with `CLOUDCONVERT_BASE_URL=https://sandbox.api.cloudconvert.com/v2`.

## Local development

Install the Next.js dependencies and start the frontend:

```powershell
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

In a second PowerShell terminal, start the Python API:

```powershell
cd python-api
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:CLOUDCONVERT_API_KEY = "your-sandbox-key"
$env:CONVERTLY_JOB_SIGNING_SECRET = "your-long-random-secret"
$env:CLOUDCONVERT_BASE_URL = "https://sandbox.api.cloudconvert.com/v2"
$env:CONVERTLY_ALLOWED_ORIGINS = "http://localhost:3000"
uvicorn main:app --reload --port 8000
```

## Deploy to Vercel

`vercel.json` defines two services, Next.js and FastAPI, and routes `/api/*` to Python. In Vercel, select the **Services** framework for the project and configure the server-side variables above. Services is currently in beta and must be enabled for the project.

Files upload directly from the browser to CloudConvert, avoiding Vercel Functions’ 4.5 MB request-body limit for file uploads. CloudConvert says files are kept for processing and automatically deleted no later than 24 hours. Disclose this third-party processing to users before launch.
