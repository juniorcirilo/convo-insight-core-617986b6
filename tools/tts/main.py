"""
TTS Service - Text-to-Speech API
Supports Brazilian Portuguese (pt-BR) voices with real male/female voices
Uses edge-tts (Microsoft Edge TTS) - Free, high quality neural voices
"""

import asyncio
import base64
import hashlib
import hmac
import io
import os
import uuid
import tempfile
from typing import Optional
from pathlib import Path
from functools import wraps

import edge_tts
from pydub import AudioSegment
from fastapi import FastAPI, HTTPException, Query, Header, Depends, Security
from fastapi import UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field

# Optional import for Vosk STT (if available)
try:
    from vosk import Model, KaldiRecognizer
    import wave
    _VOSK_AVAILABLE = True
except Exception:
    _VOSK_AVAILABLE = False
# Optional import for faster-whisper (higher accuracy)
try:
    from faster_whisper import WhisperModel
    _WHISPER_AVAILABLE = True
except Exception:
    _WHISPER_AVAILABLE = False
# ============================================================================
# API CREDENTIALS - Geradas com segurança criptográfica
# ============================================================================
API_KEY = os.environ.get("TTS_API_KEY", "2C9393A4-F944-11F0-BAE8-00155DBB8257")
CLIENT_SECRET = os.environ.get("TTS_CLIENT_SECRET", "907b832f256d763d0406405f7d89c0f5d1fb6ee66475c6777fc7c8c0462959eb6e0a3dd245bf949d70d8263669706c30b9327f17e4c6b7c9ee763732a811757e")

# ============================================================================
# APP CONFIG
# ============================================================================
app = FastAPI(
    title="TTS Service",
    description="Text-to-Speech API com suporte a Português Brasileiro - Vozes neurais Microsoft Edge",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security headers
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
client_secret_header = APIKeyHeader(name="X-Client-Secret", auto_error=False)

# ============================================================================
# AUTHENTICATION
# ============================================================================
async def verify_credentials(
    api_key: Optional[str] = Security(api_key_header),
    client_secret: Optional[str] = Security(client_secret_header),
):
    """Verifica as credenciais da API"""
    if not api_key or not client_secret:
        raise HTTPException(
            status_code=401,
            detail="Credenciais ausentes. Forneça X-API-Key e X-Client-Secret nos headers.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    
    if api_key != API_KEY:
        raise HTTPException(
            status_code=401,
            detail="API Key inválida.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    
    if client_secret != CLIENT_SECRET:
        raise HTTPException(
            status_code=401,
            detail="Client Secret inválido.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    
    return True

# ============================================================================
# VOICES CONFIG - Microsoft Edge Neural Voices
# ============================================================================
VOICES = {
    "francisca": {
        "id": "pt-BR-FranciscaNeural",
        "name": "Francisca",
        "gender": "Female",
        "locale": "pt-BR",
        "description": "Voz feminina brasileira (neural)",
    },
    "antonio": {
        "id": "pt-BR-AntonioNeural", 
        "name": "Antônio",
        "gender": "Male",
        "locale": "pt-BR",
        "description": "Voz masculina brasileira (neural)",
    },
}

DEFAULT_VOICE = "francisca"

# Cache directory
AUDIO_CACHE_DIR = Path("/tmp/tts_cache")
AUDIO_CACHE_DIR.mkdir(exist_ok=True)

# Vosk model path (container expects model under /models/vosk-model-small-pt-0.3)
VOSK_MODEL_PATH = Path("/models/vosk-model-small-pt-0.3")
_vosk_model = None
if _VOSK_AVAILABLE and VOSK_MODEL_PATH.exists():
    try:
        _vosk_model = Model(str(VOSK_MODEL_PATH))
    except Exception:
        _vosk_model = None

# Whisper model config (lazy loaded)
WHISPER_MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")
_whisper_model = None

def get_whisper_model():
    global _whisper_model
    if not _WHISPER_AVAILABLE:
        return None
    if _whisper_model is None:
        try:
            device = os.environ.get("WHISPER_DEVICE", "cpu")
            # compute_type choices: float32, float16, int8
            compute_type = os.environ.get("WHISPER_COMPUTE", "int8") if device == "cpu" else os.environ.get("WHISPER_COMPUTE", "float16")
            # Try configured model name first; fall back to common local names
            try:
                _whisper_model = WhisperModel(WHISPER_MODEL_NAME, device=device, compute_type=compute_type)
            except Exception:
                try:
                    _whisper_model = WhisperModel("small", device=device, compute_type=compute_type)
                except Exception:
                    _whisper_model = None
        except Exception:
            _whisper_model = None
    return _whisper_model
# ============================================================================
# MODELS
# ============================================================================
class TTSRequest(BaseModel):
    """Requisição para síntese de voz"""
    text: str = Field(..., min_length=1, max_length=5000, description="Texto para converter em áudio")
    voice: str = Field(default=DEFAULT_VOICE, description="Nome da voz (francisca ou antonio)")
    rate: str = Field(default="+0%", description="Velocidade da fala (-50% a +100%)")
    volume: str = Field(default="+0%", description="Volume (-50% a +50%)")
    pitch: str = Field(default="+0Hz", description="Tom da voz (-50Hz a +50Hz)")


class TTSResponse(BaseModel):
    """Resposta da síntese de voz"""
    success: bool
    message: str
    audio_url: Optional[str] = None
    file_id: Optional[str] = None


class TTSJsonResponse(BaseModel):
    """Resposta JSON com áudio em base64"""
    success: bool
    message: str
    audio_base64: str
    format: str = "mp3"
    mime_type: str = "audio/mpeg"
    text: str
    voice: str
    voice_gender: str
    duration_estimate: Optional[float] = None
    size_bytes: int


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================
def enhance_audio_quality(audio_buffer: io.BytesIO, bitrate: str = "192k", sample_rate: int = 44100) -> io.BytesIO:
    """Melhora a qualidade do áudio usando pydub/ffmpeg"""
    try:
        audio_buffer.seek(0)
        audio = AudioSegment.from_mp3(audio_buffer)
        
        # Configurações de alta qualidade
        audio = audio.set_frame_rate(sample_rate)
        audio = audio.set_channels(1)  # Mono para voz
        
        # Normalizar volume
        audio = audio.normalize()
        
        # Exportar com melhor qualidade
        output_buffer = io.BytesIO()
        audio.export(
            output_buffer, 
            format="mp3",
            bitrate=bitrate,
            parameters=["-q:a", "0"]  # Melhor qualidade VBR
        )
        output_buffer.seek(0)
        return output_buffer
    except Exception as e:
        # Se falhar, retorna o original
        audio_buffer.seek(0)
        return audio_buffer


def dedupe_transcript(text: str) -> str:
    """Remove repetições consecutivas óbvias de palavras e n-grams curtos.

    Strategy:
    - remove repetições de tokens consecutivos
    - detectar repetições consecutivas de n-grams (n=4..2) e colapsar
    This is a lightweight post-process to reduce the "echo" effect from chunked STT.
    """
    if not text:
        return text

    tokens = text.split()
    if not tokens:
        return text

    # 1) Remove immediate repeated tokens
    deduped = [tokens[0]]
    for t in tokens[1:]:
        if t != deduped[-1]:
            deduped.append(t)

    # 2) Collapse repeated n-grams (prefer larger n to catch longer phrase repeats)
    def collapse_ngrams(tok_list, n):
        i = 0
        out = []
        L = len(tok_list)
        while i < L:
            # if there's room to compare
            if i + 2 * n <= L and tok_list[i:i+n] == tok_list[i+n:i+2*n]:
                out.extend(tok_list[i:i+n])
                # skip the repeated block
                i += 2 * n
            else:
                out.append(tok_list[i])
                i += 1
        return out

    for n in (4, 3, 2):
        deduped = collapse_ngrams(deduped, n)

    return " ".join(deduped)


async def synthesize_with_edge_tts(
    text: str,
    voice_id: str,
    rate: str = "+0%",
    volume: str = "+0%",
    pitch: str = "+0Hz",
    max_retries: int = 3,
    enhance_quality: bool = True,
) -> io.BytesIO:
    """Sintetiza texto usando edge-tts com retry"""
    last_error = None
    
    for attempt in range(max_retries):
        try:
            communicate = edge_tts.Communicate(
                text=text,
                voice=voice_id,
                rate=rate,
                volume=volume,
                pitch=pitch,
            )
            
            audio_buffer = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_buffer.write(chunk["data"])
            
            audio_buffer.seek(0)
            
            if audio_buffer.getbuffer().nbytes == 0:
                raise ValueError("Áudio vazio gerado")
            
            # Melhorar qualidade do áudio
            if enhance_quality:
                audio_buffer = enhance_audio_quality(audio_buffer)
            
            return audio_buffer
            
        except Exception as e:
            last_error = e
            if attempt < max_retries - 1:
                await asyncio.sleep(1 * (attempt + 1))  # Backoff exponencial
    
    raise HTTPException(
        status_code=503,
        detail=f"Serviço de TTS temporariamente indisponível após {max_retries} tentativas: {str(last_error)}"
    )


def get_voice_config(voice_name: str) -> dict:
    """Obtém configuração da voz"""
    voice = VOICES.get(voice_name.lower())
    if not voice:
        raise HTTPException(
            status_code=400,
            detail=f"Voz '{voice_name}' não encontrada. Vozes disponíveis: {list(VOICES.keys())}"
        )
    return voice


# ============================================================================
# PUBLIC ENDPOINTS (No auth required)
# ============================================================================
@app.get("/", tags=["Health"])
async def root():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "TTS Service",
        "version": "2.0.0",
        "engine": "Microsoft Edge Neural TTS",
        "voices": list(VOICES.keys()),
        "auth_required": True,
        "headers_required": ["X-API-Key", "X-Client-Secret"],
    }


@app.get("/health", tags=["Health"])
async def health():
    """Health check"""
    return {"status": "healthy"}


@app.get("/voices", tags=["Voices"])
async def list_voices():
    """Lista todas as vozes disponíveis"""
    return {
        "voices": [
            {
                "id": v["id"],
                "name": v["name"],
                "gender": v["gender"],
                "locale": v["locale"],
                "description": v["description"],
            }
            for v in VOICES.values()
        ],
        "default": DEFAULT_VOICE,
    }


# ============================================================================
# PROTECTED ENDPOINTS (Auth required)
# ============================================================================
@app.post("/synthesize", tags=["TTS"])
async def synthesize(
    request: TTSRequest,
    authenticated: bool = Depends(verify_credentials),
):
    """
    Sintetiza texto em áudio MP3
    
    Requer autenticação via headers:
    - X-API-Key: API key
    - X-Client-Secret: Client secret
    
    Retorna o áudio diretamente como stream
    """
    voice_config = get_voice_config(request.voice)
    
    audio_data = await synthesize_with_edge_tts(
        text=request.text,
        voice_id=voice_config["id"],
        rate=request.rate,
        volume=request.volume,
        pitch=request.pitch,
    )
    
    return StreamingResponse(
        audio_data,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f"attachment; filename=speech_{request.voice}.mp3",
            "Cache-Control": "no-cache",
            "X-Voice-Used": voice_config["name"],
            "X-Voice-Gender": voice_config["gender"],
        }
    )


@app.post("/synthesize/json", tags=["TTS"], response_model=TTSJsonResponse)
async def synthesize_json(
    request: TTSRequest,
    authenticated: bool = Depends(verify_credentials),
):
    """
    Sintetiza texto em áudio e retorna JSON com base64
    
    Requer autenticação via headers:
    - X-API-Key: API key
    - X-Client-Secret: Client secret
    """
    voice_config = get_voice_config(request.voice)
    
    audio_data = await synthesize_with_edge_tts(
        text=request.text,
        voice_id=voice_config["id"],
        rate=request.rate,
        volume=request.volume,
        pitch=request.pitch,
    )
    
    audio_bytes = audio_data.read()
    audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
    
    # Estimar duração (aproximadamente 150 palavras/minuto)
    word_count = len(request.text.split())
    duration_estimate = (word_count / 150) * 60
    
    return TTSJsonResponse(
        success=True,
        message="Áudio gerado com sucesso",
        audio_base64=audio_base64,
        format="mp3",
        mime_type="audio/mpeg",
        text=request.text,
        voice=request.voice,
        voice_gender=voice_config["gender"],
        duration_estimate=round(duration_estimate, 2),
        size_bytes=len(audio_bytes),
    )


@app.post("/synthesize/save", tags=["TTS"], response_model=TTSResponse)
async def synthesize_and_save(
    request: TTSRequest,
    authenticated: bool = Depends(verify_credentials),
):
    """
    Sintetiza texto em áudio e salva em arquivo
    
    Retorna URL para download do arquivo
    """
    voice_config = get_voice_config(request.voice)
    
    file_id = str(uuid.uuid4())
    file_path = AUDIO_CACHE_DIR / f"{file_id}.mp3"
    
    audio_data = await synthesize_with_edge_tts(
        text=request.text,
        voice_id=voice_config["id"],
        rate=request.rate,
        volume=request.volume,
        pitch=request.pitch,
    )
    
    with open(file_path, "wb") as f:
        f.write(audio_data.read())
    
    return TTSResponse(
        success=True,
        message="Áudio gerado com sucesso",
        audio_url=f"/audio/{file_id}",
        file_id=file_id,
    )


@app.get("/audio/{file_id}", tags=["TTS"])
async def get_audio(
    file_id: str,
    authenticated: bool = Depends(verify_credentials),
):
    """Retorna um arquivo de áudio previamente gerado"""
    file_path = AUDIO_CACHE_DIR / f"{file_id}.mp3"
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    
    return FileResponse(
        file_path,
        media_type="audio/mpeg",
        filename=f"{file_id}.mp3",
    )


@app.get("/speak", tags=["TTS"])
async def speak_get(
    text: str = Query(..., min_length=1, max_length=5000, description="Texto para converter"),
    voice: str = Query(default=DEFAULT_VOICE, description="Voz a utilizar (francisca ou antonio)"),
    rate: str = Query(default="+0%", description="Velocidade"),
    volume: str = Query(default="+0%", description="Volume"),
    pitch: str = Query(default="+0Hz", description="Tom"),
    authenticated: bool = Depends(verify_credentials),
):
    """
    Endpoint GET simples para síntese de voz
    
    Útil para integração direta em tags <audio> HTML
    """
    request = TTSRequest(
        text=text,
        voice=voice,
        rate=rate,
        volume=volume,
        pitch=pitch,
    )
    return await synthesize(request, authenticated)


# ============================================================================
# STT Endpoints (Speech-to-Text) - uses Vosk if model is available
# ============================================================================
@app.post("/transcribe", tags=["STT"]) 
async def transcribe(
    file: UploadFile = File(...),
    authenticated: bool = Depends(verify_credentials),
):
    """
    Transcreve um arquivo de áudio para texto (pt-BR) usando Vosk.

    Aceita uploads multipart/form-data com campo `file`.
    Retorna JSON: {"transcript": "...", "language": "pt-BR"}
    """
    # Require at least one STT backend
    if not (_VOSK_AVAILABLE or _WHISPER_AVAILABLE):
        raise HTTPException(status_code=500, detail="STT não disponível: instale 'vosk' ou 'faster-whisper' no serviço TTS")

    # Read uploaded file and convert to WAV PCM16 16k mono using pydub
    contents = await file.read()
    try:
        audio = AudioSegment.from_file(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Formato de áudio inválido ou não suportado: {e}")

    audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)

    # Prefer faster-whisper if available
    if _WHISPER_AVAILABLE:
        # Try to instantiate a local 'small' faster-whisper model directly (use cached files if present)
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
                audio.export(tf.name, format="wav")
                wav_path = tf.name

            try:
                device = os.environ.get("WHISPER_DEVICE", "cpu")
                compute_type = os.environ.get("WHISPER_COMPUTE", "int8") if device == "cpu" else os.environ.get("WHISPER_COMPUTE", "float16")
                try:
                    local_whisper = WhisperModel("small", device=device, compute_type=compute_type)
                except Exception:
                    # fallback to configured model name
                    local_whisper = get_whisper_model()

                if local_whisper is not None:
                    segments, info = local_whisper.transcribe(wav_path, language="pt", beam_size=5)
                    parts = [s.text.strip() for s in segments if getattr(s, 'text', None)]
                    full_whisper = " ".join(parts).strip()
                    cleaned = dedupe_transcript(full_whisper)
                    return {"transcript": cleaned, "language": "pt-BR"}
            finally:
                try:
                    os.unlink(wav_path)
                except Exception:
                    pass
        except Exception:
            # if whisper fails here, fall back to Vosk below
            pass

    # Fall back to Vosk if available
    if not _VOSK_AVAILABLE or _vosk_model is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Modelo Vosk não encontrado em /models/vosk-model-small-pt-0.3. "
                "Baixe e extraia o modelo dentro do container (veja /tools/tts/download_vosk_model.sh)"
            )
        )

    # Chunk the audio into smaller segments to improve recognition coverage
    duration_ms = len(audio)
    chunk_ms = 8000  # 8s chunks
    overlap_ms = 500
    step = max(1000, chunk_ms - overlap_ms)

    transcripts = []
    import json

    for start in range(0, duration_ms, step):
        seg = audio[start:start + chunk_ms]
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmpf:
            seg.export(tmpf.name, format="wav")
            seg_path = tmpf.name

        try:
            wf = wave.open(seg_path, "rb")
            if wf.getnchannels() != 1 or wf.getsampwidth() != 2 or wf.getframerate() != 16000:
                wf.close()
                continue

            # Create a fresh recognizer per segment
            rec = KaldiRecognizer(_vosk_model, wf.getframerate())
            seg_texts = []
            last_partial = ""
            seen = set()

            while True:
                data = wf.readframes(4000)
                if len(data) == 0:
                    break
                accepted = rec.AcceptWaveform(data)
                if accepted:
                    try:
                        res = rec.Result()
                        j = json.loads(res)
                        t = j.get("text", "").strip()
                        if t and t not in seen:
                            seg_texts.append(t)
                            seen.add(t)
                    except Exception:
                        pass
                    last_partial = ""
                else:
                    try:
                        pr = rec.PartialResult()
                        pj = json.loads(pr)
                        partial = pj.get("partial", "").strip()
                        if partial and partial != last_partial and partial not in seen:
                            seg_texts.append(partial)
                            seen.add(partial)
                            last_partial = partial
                    except Exception:
                        pass

            try:
                final = rec.FinalResult()
                j = json.loads(final)
                final_text = j.get("text", "").strip()
                if final_text and final_text not in seen:
                    seg_texts.append(final_text)
            except Exception:
                pass

            wf.close()

            # Join segment texts and add to overall transcripts
            combined_seg = " ".join([p for p in seg_texts if p]).strip()
            if combined_seg:
                transcripts.append(combined_seg)
        finally:
            try:
                os.unlink(seg_path)
            except Exception:
                pass

    # Combine all segment transcripts (preserve order, simple join)
    full = " ".join(transcripts).strip()
    cleaned = dedupe_transcript(full)
    return {"transcript": cleaned, "language": "pt-BR"}


@app.delete("/cache/clear", tags=["Admin"])
async def clear_cache(
    authenticated: bool = Depends(verify_credentials),
):
    """Limpa o cache de arquivos de áudio"""
    count = 0
    for file in AUDIO_CACHE_DIR.glob("*.mp3"):
        file.unlink()
        count += 1
    
    return {"success": True, "files_deleted": count}


# ============================================================================
# MAIN
# ============================================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
