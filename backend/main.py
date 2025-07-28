from fastapi import FastAPI, UploadFile, Form, HTTPException, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from b2sdk.v2 import InMemoryAccountInfo, B2Api
from supabase import create_client, Client
from postgrest.exceptions import APIError

from typing import List
from pathlib import Path
import shutil
import unicodedata
import io
import os

from models import *


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://ankietalogopedyczna.pl",
        "https://www.ankietalogopedyczna.pl"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Backblaze B2 CONFIGURATION ===
B2_APPLICATION_KEY_ID = os.getenv("B2_APPLICATION_KEY_ID")
B2_APPLICATION_KEY = os.getenv("B2_APPLICATION_KEY")
B2_SAMPLES_BUCKET_NAME = "GaguAudioSamples"
B2_EXAMPLES_BUCKET_NAME = "GaguAudioExamples"

info = InMemoryAccountInfo()
b2_api = B2Api(info)
b2_api.authorize_account("production", B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY)
audio_samples_bucket = b2_api.get_bucket_by_name(B2_SAMPLES_BUCKET_NAME)
audio_examples_bucket = b2_api.get_bucket_by_name(B2_EXAMPLES_BUCKET_NAME)

SUPABASE_URL: str = os.getenv("SUPABASE_URL")
SUPABASE_KEY_PRIVATE: str = os.getenv("SUPABASE_KEY_PRIVATE")
SUPABASE_KEY_PUBLIC: str = os.getenv("SUPABASE_KEY_PUBLIC")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY_PRIVATE)
supabase_public: Client = create_client(SUPABASE_URL, SUPABASE_KEY_PUBLIC)


@app.get("/")
async def ping():
    return "Pong! Pong!"


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


@app.post("/upload_bulk")
async def upload_audios(audios: List[UploadFile] = UploadFile(...), phonemes: List[str] = Form(...)):
    if len(audios) != len(phonemes):
        raise HTTPException(
            status_code=400,
            detail=f"Number of audio files ({len(audios)}) does not match number of phonemes ({len(phonemes)})."
        )

    # Ensure temp directory exists
    temp_path = Path("temp")
    temp_path.mkdir(exist_ok=True)

    uploaded = 0
    errors = []

    # Pair each file with its phoneme
    for audio, phoneme in zip(audios, phonemes):
        try:
            # Build destination filename: phoneme/<original-filename>
            dest_name = f"{phoneme}/{audio.filename}"
            temp_file = temp_path / audio.filename

            # Save locally
            with temp_file.open("wb") as buffer:
                shutil.copyfileobj(audio.file, buffer)

            # Upload to B2 (or your cloud bucket)
            audio_samples_bucket.upload_local_file(
                local_file=temp_file,
                file_name=dest_name,
                file_infos={"phoneme": phoneme}
            )

            # Clean up temp file
            temp_file.unlink()
            uploaded += 1

        except Exception as exc:
            errors.append(f"{audio.filename} (phoneme={phoneme}): {exc}")

    # Build the response
    if errors:
        return PlainTextResponse(
            f"Uploaded {uploaded}/{len(audios)}, with errors:\n" + "\n".join(errors),
            status_code=207
        )

    return PlainTextResponse(
        f"Successfully uploaded all {uploaded} audio samples.",
        status_code=200
    )


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
            supabase_public
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
        insert_resp = supabase_public.rpc("insert_user", {"p_email": user.email}).execute()
    except APIError as err:
        error_info = err.args[0]
        # handle unique-violation race‐condition (Postgres code 23505)
        if error_info.get("code") == "23505":
            refetch = (
                supabase_public
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


@app.get("/phonemes", response_model=List[str])
async def get_phonemes() -> List[str]:
    """
    Fetch survey data via Supabase RPC, sort by order_id, and return the 'item'
    field from each record.
    """
    try:
        # Call the get_survey_data stored procedure
        resp = supabase.rpc("get_survey_data").execute()
        data = resp.data or []  # resp is an APIResponse with .data on success :contentReference[oaicite:0]{index=0}

        # Sort by order_id, then extract the 'item' field
        sorted_data = sorted(data, key=lambda rec: rec.get("order_id", 0))
        phonemes = [rec.get("item") for rec in sorted_data]

        return phonemes

    except APIError as e:
        # supabase-py raises APIError for non-2xx status codes :contentReference[oaicite:1]{index=1}
        raise HTTPException(
            status_code=e.status_code if hasattr(e, "status_code") else 500,
            detail="Nie udało się załadować głosek. Spróbuj odświeżyć stronę."
        )
    except Exception as err:
        raise HTTPException(
            status_code=500,
            detail="Nie udało się załadować głosek. Spróbuj odświeżyć stronę."
        )
