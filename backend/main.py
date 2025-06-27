from fastapi import FastAPI, UploadFile, Form, HTTPException, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from b2sdk.v2 import InMemoryAccountInfo, B2Api
from supabase import create_client, Client
from postgrest.exceptions import APIError

from pathlib import Path
import shutil
import unicodedata
import io

from models import *


app = FastAPI()

# CORS for local frontend testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Backblaze B2 CONFIGURATION ===
B2_APPLICATION_KEY_ID = "0034cef410761b40000000004"
B2_APPLICATION_KEY = "K003VGIElWb8XnzfaUz2QFvl7cwo/3I"
B2_SAMPLES_BUCKET_NAME = "GaguAudioSamples"
B2_EXAMPLES_BUCKET_NAME = "GaguAudioExamples"

info = InMemoryAccountInfo()
b2_api = B2Api(info)
b2_api.authorize_account("production", B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY)
audio_samples_bucket = b2_api.get_bucket_by_name(B2_SAMPLES_BUCKET_NAME)
audio_examples_bucket = b2_api.get_bucket_by_name(B2_EXAMPLES_BUCKET_NAME)

SUPABASE_URL: str = "https://nmpfvodpuzerozsjtrch.supabase.co"
SUPABASE_KEY: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcGZ2b2RwdXplcm96c2p0cmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0NDIyMjgsImV4cCI6MjA2NDAxODIyOH0.4nZtUA7iOijcRuBUOkMrzi38bBljvjTknauDcEOfxzY"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


@app.get("/")
async def ping():
    return "Pong!"


@app.post("/upload")
async def upload_audio(audio: UploadFile, phoneme: str = Form(...)):
    filename = f"{phoneme}/{audio.filename}"
    temp_path = Path("temp")
    temp_path.mkdir(exist_ok=True)
    temp_file = temp_path / audio.filename

    with temp_file.open("wb") as buffer:
        shutil.copyfileobj(audio.file, buffer)

    # Upload to B2
    audio_samples_bucket.upload_local_file(
        local_file=temp_file,
        file_name=filename,
        file_infos={"phoneme": phoneme}
    )

    temp_file.unlink()

    return PlainTextResponse("Próbka zapisana w chmurze.", status_code=200)


@app.get("/audioExamples")
async def get_audio_file(file_name: str = Query(...)):
    try:
        nfd_name = unicodedata.normalize("NFD", file_name)
        # download init (doesn't buffer yet)
        downloaded = audio_examples_bucket.download_file_by_name(f"PerfectPronunciation/{nfd_name}")

        # use a BytesIO and save() to write into it
        buffer = io.BytesIO()
        downloaded.save(buffer)                  # ← write into your BytesIO :contentReference[oaicite:0]{index=0}
        buffer.seek(0)
        file_content = buffer.read()

        return Response(content=file_content, media_type="audio/mpeg")

    except Exception as e:
        print(f"Error fetching file '{file_name}': {e}")
        raise HTTPException(status_code=404, detail=f"File '{file_name}' not found.")


@app.post("/users", response_model=User)
async def create_user(user: UserCreate):
    # 1) Try to fetch an existing user
    try:
        existing_resp = (
            supabase
            .from_("users")
            .select("*")
            .eq("email", user.email)
            .limit(1)
            .execute()
        )
    except APIError as err:
        error_info = err.args[0]
        raise HTTPException(status_code=500, detail=error_info.get("message"))
    if existing_resp.data:
        return existing_resp.data[0]

    # 2) Not found → call your insert_user RPC
    try:
        insert_resp = supabase.rpc("insert_user", {"p_email": user.email}).execute()
    except APIError as err:
        error_info = err.args[0]
        # handle unique-violation race‐condition (Postgres code 23505)
        if error_info.get("code") == "23505":
            refetch = (
                supabase
                .from_("users")
                .select("*")
                .eq("email", user.email)
                .limit(1)
                .execute()
            )
            return refetch.data[0]
        raise HTTPException(status_code=400, detail=error_info.get("message"))

    # 3) Success: insert_resp.data is a list containing the new row
    return insert_resp.data[0]