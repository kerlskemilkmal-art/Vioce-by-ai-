import os
import io
import asyncio
import tempfile
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import edge_tts
import soundfile as sf
import noisereduce as nr
import numpy as np
from pydantic import BaseModel

app = FastAPI(
    title="Studio.AI - High-Performance AI Audio Platform",
    description="Backend API for real-time Text-to-Speech, Audio Enhancement, and Transcription.",
    version="1.0.0"
)

# Enable CORS for local development and premium cross-origin resource sharing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define static directories
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "temp"), exist_ok=True)

# Edge-TTS voice mappings (Free, high-quality, multilingual voices)
VOICES = {
    # English Voices
    "en_male_1": "en-US-GuyNeural",
    "en_female_1": "en-US-AriaNeural",
    "en_uk_male": "en-GB-RyanNeural",
    "en_uk_female": "en-GB-SoniaNeural",
    # Arabic Voices
    "ar_eg_female": "ar-EG-SalmaNeural",
    "ar_eg_male": "ar-EG-ShakirNeural",
    "ar_sa_female": "ar-SA-ZariyahNeural",
    "ar_sa_male": "ar-SA-HamedNeural",
    "ar_ae_female": "ar-AE-FatimaNeural",
    "ar_ae_male": "ar-AE-HamdanNeural"
}

class TTSRequest(BaseModel):
    text: str
    voice_key: str = "en_female_1"
    rate: str = "+0%"  # e.g., "+0%", "-10%", "+20%"
    pitch: str = "+0Hz"

@app.post("/api/tts")
async def text_to_speech(request: TTSRequest):
    """
    Accepts text input, sends it to the Microsoft Edge-TTS engine,
    and streams the synthesized high-quality MP3 audio back to the user.
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    voice = VOICES.get(request.voice_key, "en-US-AriaNeural")
    
    try:
        # edge-tts communicates asynchronously with Azure's backend
        communicate = edge_tts.Communicate(
            text=request.text,
            voice=voice,
            rate=request.rate,
            pitch=request.pitch
        )
        
        audio_data = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data.write(chunk["data"])
        
        audio_data.seek(0)
        return StreamingResponse(
            audio_data, 
            media_type="audio/mpeg",
            headers={"Content-Disposition": "attachment; filename=synthesized.mp3"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS Synthesis failed: {str(e)}")

@app.post("/api/enhance")
async def enhance_audio(
    file: UploadFile = File(...),
    noise_reduction_strength: float = Form(1.0) # Strength factor between 0.0 and 1.0
):
    """
    Advanced Background Noise Cancellation.
    Uploads a raw audio file, reads it via soundfile, performs spectral gating
    noise suppression using noisereduce, and streams back the pristine WAV file.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded.")

    # Read uploaded file bytes into memory
    file_bytes = await file.read()
    
    try:
        # Wrap bytes in a file-like object and read with soundfile
        with io.BytesIO(file_bytes) as audio_file:
            data, samplerate = sf.read(audio_file)
            
        # Ensure we have mono or stereo float data
        # noisereduce works perfectly on numpy arrays
        if len(data.shape) > 1:
            # Stereo processing
            reduced_noise = np.zeros_like(data)
            for channel in range(data.shape[1]):
                reduced_noise[:, channel] = nr.reduce_noise(
                    y=data[:, channel],
                    sr=samplerate,
                    prop_decrease=noise_reduction_strength
                )
        else:
            # Mono processing
            reduced_noise = nr.reduce_noise(
                y=data,
                sr=samplerate,
                prop_decrease=noise_reduction_strength
            )
            
        # Save processed audio to bytes as WAV
        output_buffer = io.BytesIO()
        sf.write(output_buffer, reduced_noise, samplerate, format='WAV', subtype='PCM_16')
        output_buffer.seek(0)
        
        return StreamingResponse(
            output_buffer,
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=enhanced_audio.wav"}
        )
    except Exception as e:
        # Fallback in case of soundfile library issues or unsupported audio formats (e.g., highly compressed files)
        # In a real environment, we would convert formats using ffmpeg
        raise HTTPException(
            status_code=500, 
            detail=f"Audio Enhancement failed: {str(e)}. Ensure file is a standard WAV, MP3, or FLAC file."
        )

@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...), language: str = Form("en")):
    """
    Audio Transcription endpoint (Speech-to-Text).
    In this MVP, we provide a structured mock result representing high-quality
    timestamped word-by-word outputs from OpenAI Whisper, illustrating
    how the frontend timeline editor handles bilingual English and Arabic synchronization.
    """
    # In a full production implementation, you would write:
    # import whisper
    # model = whisper.load_model("base")
    # result = model.transcribe(temp_file_path)
    
    # Mocking high-quality speech-to-text with timestamping:
    if "ar" in language.lower():
        # Arabic sample transcript
        transcript = "أهلاً بكم في منصة الصوت الذكي. هذا النظام يقوم بتحسين ومعالجة وتلخيص الملفات الصوتية بجودة عالية."
        segments = [
            {"id": 0, "start": 0.0, "end": 2.5, "text": "أهلاً بكم في منصة الصوت الذكي"},
            {"id": 1, "start": 2.5, "end": 5.2, "text": "هذا النظام يقوم بتحسين ومعالجة"},
            {"id": 2, "start": 5.2, "end": 8.5, "text": "وتلخيص الملفات الصوتية بجودة عالية"}
        ]
    else:
        # English sample transcript
        transcript = "Welcome to the AI Audio Studio dashboard. This platform is designed to master, enhance, and transcribe your audio in real-time."
        segments = [
            {"id": 0, "start": 0.0, "end": 3.0, "text": "Welcome to the AI Audio Studio dashboard."},
            {"id": 1, "start": 3.0, "end": 6.8, "text": "This platform is designed to master, enhance,"},
            {"id": 2, "start": 6.8, "end": 10.0, "text": "and transcribe your audio in real-time."}
        ]

    await asyncio.sleep(1.5)  # Simulate processing delay
    return JSONResponse(content={
        "status": "success",
        "language": language,
        "duration": 10.0,
        "text": transcript,
        "segments": segments
    })

# Mount static files for our interactive HTML5/CSS/JS frontend dashboard
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # Start the dev server on port 8000
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
