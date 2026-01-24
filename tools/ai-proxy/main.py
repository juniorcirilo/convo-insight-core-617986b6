"""
AI Proxy - API Gateway com Autenticação e Categorização de Modelos
Protege o acesso ao Ollama e organiza modelos por capacidade/categoria.
"""
import os
import uuid
import hmac
import hashlib
import secrets
import logging
import asyncio
from typing import Optional, List, Dict, Any
from enum import Enum

import httpx
from fastapi import FastAPI, Request, HTTPException, Query
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURAÇÃO E CREDENCIAIS
# =============================================================================
CLIENT_ID = os.environ.get("CLIENT_ID") or str(uuid.uuid1()).upper()
HMAC_SECRET = os.environ.get("HMAC_SECRET") or secrets.token_hex(32)

# Usa CLIENT_TOKEN/CLIENT_SECRET do ambiente se fornecidos, senão calcula
_env_token = os.environ.get("CLIENT_TOKEN")
_env_secret = os.environ.get("CLIENT_SECRET")

if _env_token and _env_secret:
    CLIENT_TOKEN = _env_token
    CLIENT_SECRET = _env_secret
    logger.info("Usando CLIENT_TOKEN e CLIENT_SECRET das variáveis de ambiente")
else:
    CLIENT_TOKEN = hmac.new(HMAC_SECRET.encode(), CLIENT_ID.encode(), hashlib.sha256).hexdigest()
    CLIENT_SECRET = hmac.new(HMAC_SECRET.encode(), CLIENT_TOKEN.encode(), hashlib.sha512).hexdigest()
    logger.info("CLIENT_TOKEN e CLIENT_SECRET calculados a partir do HMAC_SECRET")

OLLAMA_URL = os.environ.get("OLLAMA_URL") or "http://ollama:11434"

logger.info(f"AI Proxy iniciando com CLIENT_ID={CLIENT_ID}")

# =============================================================================
# CATÁLOGO DE MODELOS POR CATEGORIA
# =============================================================================

class ModelCategory(str, Enum):
    TEXT = "text"
    CODE = "code"
    VISION = "vision"
    EMBEDDING = "embedding"
    MULTIMODAL = "multimodal"
    CHAT = "chat"
    INSTRUCTION = "instruction"

# Catálogo completo de modelos gratuitos compatíveis com Ollama
MODEL_CATALOG: Dict[str, Dict[str, Any]] = {
    # =========================================================================
    # MODELOS DE TEXTO / CHAT
    # =========================================================================
    "qwen2.5:0.5b": {
        "name": "Qwen 2.5 0.5B",
        "categories": [ModelCategory.TEXT, ModelCategory.CHAT],
        "description": "Modelo leve da Alibaba, excelente para tarefas simples de texto",
        "size": "0.5B",
        "memory_gb": 0.5,
        "languages": ["en", "zh", "pt"],
        "capabilities": ["chat", "completion", "summarization"],
        "recommended_for": ["chatbots", "quick_responses", "low_resource"],
        "free": True,
        "auto_install": True,
    },
    "qwen2.5:1.5b": {
        "name": "Qwen 2.5 1.5B",
        "categories": [ModelCategory.TEXT, ModelCategory.CHAT],
        "description": "Versão maior do Qwen 2.5 com melhor qualidade",
        "size": "1.5B",
        "memory_gb": 1.2,
        "languages": ["en", "zh", "pt"],
        "capabilities": ["chat", "completion", "summarization", "translation"],
        "recommended_for": ["chatbots", "content_generation"],
        "free": True,
        "auto_install": True,
    },
    "qwen2.5:3b": {
        "name": "Qwen 2.5 3B",
        "categories": [ModelCategory.TEXT, ModelCategory.CHAT, ModelCategory.INSTRUCTION],
        "description": "Modelo balanceado para uso geral",
        "size": "3B",
        "memory_gb": 2.5,
        "languages": ["en", "zh", "pt", "es", "fr"],
        "capabilities": ["chat", "completion", "reasoning", "analysis"],
        "recommended_for": ["assistants", "analysis", "content"],
        "free": True,
        "auto_install": True,
    },
    "llama3.2:1b": {
        "name": "Llama 3.2 1B",
        "categories": [ModelCategory.TEXT, ModelCategory.CHAT],
        "description": "Modelo compacto da Meta, rápido e eficiente",
        "size": "1B",
        "memory_gb": 0.8,
        "languages": ["en", "pt", "es"],
        "capabilities": ["chat", "completion"],
        "recommended_for": ["mobile", "edge", "quick_tasks"],
        "free": True,
        "auto_install": True,
    },
    "llama3.2:3b": {
        "name": "Llama 3.2 3B",
        "categories": [ModelCategory.TEXT, ModelCategory.CHAT, ModelCategory.INSTRUCTION],
        "description": "Llama 3.2 com melhor capacidade de raciocínio",
        "size": "3B",
        "memory_gb": 2.5,
        "languages": ["en", "pt", "es", "de", "fr"],
        "capabilities": ["chat", "completion", "reasoning", "instruction_following"],
        "recommended_for": ["assistants", "customer_service"],
        "free": True,
        "auto_install": True,
    },
    "phi3:mini": {
        "name": "Phi-3 Mini",
        "categories": [ModelCategory.TEXT, ModelCategory.CHAT, ModelCategory.INSTRUCTION],
        "description": "Modelo da Microsoft, excelente custo-benefício",
        "size": "3.8B",
        "memory_gb": 3,
        "languages": ["en"],
        "capabilities": ["chat", "reasoning", "instruction_following", "math"],
        "recommended_for": ["reasoning", "math", "logic"],
        "free": True,
        "auto_install": True,
    },
    "gemma2:2b": {
        "name": "Gemma 2 2B",
        "categories": [ModelCategory.TEXT, ModelCategory.CHAT],
        "description": "Modelo do Google DeepMind, eficiente e seguro",
        "size": "2B",
        "memory_gb": 1.8,
        "languages": ["en"],
        "capabilities": ["chat", "completion", "safety"],
        "recommended_for": ["safe_chat", "general_purpose"],
        "free": True,
        "auto_install": True,
    },
    "mistral:7b": {
        "name": "Mistral 7B",
        "categories": [ModelCategory.TEXT, ModelCategory.CHAT, ModelCategory.INSTRUCTION],
        "description": "Modelo poderoso da Mistral AI",
        "size": "7B",
        "memory_gb": 5,
        "languages": ["en", "fr", "es", "de", "it", "pt"],
        "capabilities": ["chat", "completion", "reasoning", "multilingual"],
        "recommended_for": ["complex_tasks", "multilingual", "enterprise"],
        "free": True,
        "auto_install": False,
    },
    "tinyllama:1.1b": {
        "name": "TinyLlama 1.1B",
        "categories": [ModelCategory.TEXT, ModelCategory.CHAT],
        "description": "Modelo ultra-leve para dispositivos com recursos limitados",
        "size": "1.1B",
        "memory_gb": 0.8,
        "languages": ["en"],
        "capabilities": ["chat", "completion"],
        "recommended_for": ["edge", "iot", "embedded"],
        "free": True,
        "auto_install": True,
    },
    
    # =========================================================================
    # MODELOS DE CÓDIGO
    # =========================================================================
    "qwen2.5-coder:1.5b": {
        "name": "Qwen 2.5 Coder 1.5B",
        "categories": [ModelCategory.CODE],
        "description": "Especializado em código, leve e eficiente",
        "size": "1.5B",
        "memory_gb": 1.2,
        "languages": ["en"],
        "capabilities": ["code_generation", "code_completion", "code_explanation"],
        "programming_languages": ["python", "javascript", "typescript", "java", "c++", "go", "rust"],
        "recommended_for": ["ide_integration", "code_assist"],
        "free": True,
        "auto_install": True,
    },
    "qwen2.5-coder:3b": {
        "name": "Qwen 2.5 Coder 3B",
        "categories": [ModelCategory.CODE],
        "description": "Melhor qualidade de código com mais parâmetros",
        "size": "3B",
        "memory_gb": 2.5,
        "languages": ["en"],
        "capabilities": ["code_generation", "code_review", "debugging", "refactoring"],
        "programming_languages": ["python", "javascript", "typescript", "java", "c++", "go", "rust", "sql"],
        "recommended_for": ["development", "code_review"],
        "free": True,
        "auto_install": True,
    },
    "codellama:7b": {
        "name": "Code Llama 7B",
        "categories": [ModelCategory.CODE],
        "description": "Modelo da Meta especializado em código",
        "size": "7B",
        "memory_gb": 5,
        "languages": ["en"],
        "capabilities": ["code_generation", "code_completion", "infilling"],
        "programming_languages": ["python", "javascript", "c++", "java", "php", "typescript", "c#", "bash"],
        "recommended_for": ["complex_code", "large_projects"],
        "free": True,
        "auto_install": False,
    },
    "deepseek-coder:1.3b": {
        "name": "DeepSeek Coder 1.3B",
        "categories": [ModelCategory.CODE],
        "description": "Modelo chinês especializado em código, muito eficiente",
        "size": "1.3B",
        "memory_gb": 1,
        "languages": ["en", "zh"],
        "capabilities": ["code_generation", "code_completion"],
        "programming_languages": ["python", "javascript", "java", "c++"],
        "recommended_for": ["lightweight_coding"],
        "free": True,
        "auto_install": True,
    },
    "starcoder2:3b": {
        "name": "StarCoder2 3B",
        "categories": [ModelCategory.CODE],
        "description": "Modelo de código aberto da BigCode",
        "size": "3B",
        "memory_gb": 2.5,
        "languages": ["en"],
        "capabilities": ["code_generation", "code_completion", "fill_in_middle"],
        "programming_languages": ["python", "javascript", "java", "c", "c++", "go", "rust", "ruby"],
        "recommended_for": ["code_completion", "ide"],
        "free": True,
        "auto_install": True,
    },
    
    # =========================================================================
    # MODELOS DE VISÃO / MULTIMODAL
    # =========================================================================
    "llava:7b": {
        "name": "LLaVA 7B",
        "categories": [ModelCategory.VISION, ModelCategory.MULTIMODAL],
        "description": "Large Language and Vision Assistant",
        "size": "7B",
        "memory_gb": 5,
        "languages": ["en"],
        "capabilities": ["image_understanding", "visual_qa", "image_description"],
        "recommended_for": ["image_analysis", "visual_chat"],
        "free": True,
        "auto_install": False,
    },
    "moondream:1.8b": {
        "name": "Moondream 1.8B",
        "categories": [ModelCategory.VISION, ModelCategory.MULTIMODAL],
        "description": "Modelo de visão ultra-leve e eficiente",
        "size": "1.8B",
        "memory_gb": 1.5,
        "languages": ["en"],
        "capabilities": ["image_understanding", "visual_qa"],
        "recommended_for": ["edge_vision", "quick_image_analysis"],
        "free": True,
        "auto_install": True,
    },
    "llava-phi3:3.8b": {
        "name": "LLaVA Phi-3 3.8B",
        "categories": [ModelCategory.VISION, ModelCategory.MULTIMODAL],
        "description": "Combinação de LLaVA com Phi-3",
        "size": "3.8B",
        "memory_gb": 3,
        "languages": ["en"],
        "capabilities": ["image_understanding", "visual_qa", "reasoning"],
        "recommended_for": ["vision_reasoning"],
        "free": True,
        "auto_install": True,
    },
    
    # =========================================================================
    # MODELOS DE EMBEDDING
    # =========================================================================
    "nomic-embed-text:latest": {
        "name": "Nomic Embed Text",
        "categories": [ModelCategory.EMBEDDING],
        "description": "Modelo de embeddings de alta qualidade",
        "size": "137M",
        "memory_gb": 0.3,
        "languages": ["en"],
        "capabilities": ["text_embedding", "semantic_search", "clustering"],
        "embedding_dimensions": 768,
        "recommended_for": ["rag", "semantic_search", "similarity"],
        "free": True,
        "auto_install": True,
    },
    "mxbai-embed-large:latest": {
        "name": "MixedBread Embed Large",
        "categories": [ModelCategory.EMBEDDING],
        "description": "Embeddings de alta dimensionalidade",
        "size": "335M",
        "memory_gb": 0.5,
        "languages": ["en"],
        "capabilities": ["text_embedding", "semantic_search"],
        "embedding_dimensions": 1024,
        "recommended_for": ["high_precision_search", "rag"],
        "free": True,
        "auto_install": True,
    },
    "all-minilm:latest": {
        "name": "All-MiniLM",
        "categories": [ModelCategory.EMBEDDING],
        "description": "Modelo de embeddings rápido e leve",
        "size": "23M",
        "memory_gb": 0.1,
        "languages": ["en"],
        "capabilities": ["text_embedding", "semantic_search"],
        "embedding_dimensions": 384,
        "recommended_for": ["fast_embedding", "realtime"],
        "free": True,
        "auto_install": True,
    },
    
    # =========================================================================
    # MODELOS DE INSTRUÇÃO / ASSISTENTE
    # =========================================================================
    "orca-mini:3b": {
        "name": "Orca Mini 3B",
        "categories": [ModelCategory.INSTRUCTION, ModelCategory.TEXT],
        "description": "Treinado em dados de raciocínio explicativo",
        "size": "3B",
        "memory_gb": 2.5,
        "languages": ["en"],
        "capabilities": ["instruction_following", "reasoning", "explanation"],
        "recommended_for": ["educational", "step_by_step"],
        "free": True,
        "auto_install": True,
    },
    "neural-chat:7b": {
        "name": "Neural Chat 7B",
        "categories": [ModelCategory.CHAT, ModelCategory.INSTRUCTION],
        "description": "Modelo da Intel otimizado para conversação",
        "size": "7B",
        "memory_gb": 5,
        "languages": ["en"],
        "capabilities": ["chat", "conversation", "assistant"],
        "recommended_for": ["customer_service", "chatbots"],
        "free": True,
        "auto_install": False,
    },
    "stablelm2:1.6b": {
        "name": "StableLM 2 1.6B",
        "categories": [ModelCategory.TEXT, ModelCategory.CHAT],
        "description": "Modelo da Stability AI, balanceado",
        "size": "1.6B",
        "memory_gb": 1.2,
        "languages": ["en", "es", "de", "it", "fr", "pt", "nl"],
        "capabilities": ["chat", "multilingual"],
        "recommended_for": ["multilingual_chat"],
        "free": True,
        "auto_install": True,
    },
}

# Modelos para instalar automaticamente
AUTO_INSTALL_MODELS = [k for k, v in MODEL_CATALOG.items() if v.get("auto_install", False)]

# =============================================================================
# SCHEMAS PYDANTIC
# =============================================================================

class GenerateRequest(BaseModel):
    model: Optional[str] = Field(None, description="Nome do modelo ou deixe vazio para usar o padrão da categoria")
    category: Optional[ModelCategory] = Field(None, description="Categoria do modelo (text, code, vision, embedding)")
    prompt: str = Field(..., description="Prompt para geração")
    system: Optional[str] = Field(None, description="System prompt opcional")
    stream: bool = Field(False, description="Streaming de resposta")
    images: Optional[List[str]] = Field(None, description="Imagens em base64 para modelos de visão")
    options: Optional[Dict[str, Any]] = Field(None, description="Opções adicionais (temperature, top_p, etc)")

class EmbeddingRequest(BaseModel):
    model: Optional[str] = Field(None, description="Modelo de embedding")
    text: str = Field(..., description="Texto para gerar embedding")

class ChatMessage(BaseModel):
    role: str = Field(..., description="Role: system, user, assistant")
    content: str = Field(..., description="Conteúdo da mensagem")
    images: Optional[List[str]] = Field(None, description="Imagens em base64")

class ChatRequest(BaseModel):
    model: Optional[str] = Field(None, description="Nome do modelo")
    category: Optional[ModelCategory] = Field(ModelCategory.CHAT, description="Categoria")
    messages: List[ChatMessage] = Field(..., description="Histórico de mensagens")
    stream: bool = Field(False, description="Streaming")
    options: Optional[Dict[str, Any]] = Field(None, description="Opções")

class ModelInfo(BaseModel):
    id: str
    name: str
    categories: List[str]
    description: str
    size: str
    memory_gb: float
    languages: List[str]
    capabilities: List[str]
    installed: bool = False
    recommended_for: List[str] = []

class CategoryInfo(BaseModel):
    category: str
    description: str
    models: List[ModelInfo]
    default_model: Optional[str] = None

# =============================================================================
# APP FASTAPI
# =============================================================================

app = FastAPI(
    title="AI Proxy Gateway",
    description="API Gateway autenticada para modelos de IA com categorização",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Estado global
_installed_models: set = set()
_default_models: Dict[str, str] = {}
_http_client: Optional[httpx.AsyncClient] = None

# =============================================================================
# FUNÇÕES AUXILIARES
# =============================================================================

async def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=10.0))
    return _http_client

def validate_auth(request: Request) -> None:
    """Valida autenticação via headers"""
    hdr_id = request.headers.get("X-Client-Id")
    hdr_token = request.headers.get("X-Client-Token")
    hdr_secret = request.headers.get("X-Client-Secret")
    
    if not hdr_id or not hdr_token or not hdr_secret:
        raise HTTPException(status_code=401, detail="Missing authentication headers (X-Client-Id, X-Client-Token, X-Client-Secret)")
    if hdr_id != CLIENT_ID:
        raise HTTPException(status_code=403, detail="Invalid client id")
    if not hmac.compare_digest(hdr_token, CLIENT_TOKEN):
        raise HTTPException(status_code=403, detail="Invalid client token")
    if not hmac.compare_digest(hdr_secret, CLIENT_SECRET):
        raise HTTPException(status_code=403, detail="Invalid client secret")

async def fetch_installed_models() -> List[str]:
    """Busca modelos instalados no Ollama"""
    global _installed_models
    try:
        client = await get_http_client()
        resp = await client.get(f"{OLLAMA_URL}/api/tags")
        if resp.status_code == 200:
            data = resp.json()
            models = [m.get("name", "") for m in data.get("models", [])]
            _installed_models = set(models)
            return models
    except Exception as e:
        logger.error(f"Erro ao buscar modelos: {e}")
    return []

async def pull_model(model_name: str) -> bool:
    """Baixa um modelo do Ollama"""
    try:
        client = await get_http_client()
        logger.info(f"Iniciando download do modelo: {model_name}")
        resp = await client.post(
            f"{OLLAMA_URL}/api/pull",
            json={"name": model_name, "stream": False},
            timeout=httpx.Timeout(1800.0)
        )
        if resp.status_code == 200:
            logger.info(f"Modelo {model_name} instalado com sucesso")
            _installed_models.add(model_name)
            return True
        else:
            logger.error(f"Erro ao baixar {model_name}: {resp.status_code}")
    except Exception as e:
        logger.error(f"Exceção ao baixar {model_name}: {e}")
    return False

def get_default_model_for_category(category: ModelCategory) -> Optional[str]:
    """Retorna o modelo padrão instalado para uma categoria"""
    if category.value in _default_models:
        return _default_models[category.value]
    
    for model_id, info in MODEL_CATALOG.items():
        if category in info.get("categories", []):
            base_name = model_id.split(":")[0]
            for installed in _installed_models:
                if installed.startswith(base_name) or model_id in installed or installed in model_id:
                    _default_models[category.value] = installed
                    return installed
    return None

def get_category_description(category: ModelCategory) -> str:
    """Descrição de cada categoria"""
    descriptions = {
        ModelCategory.TEXT: "Modelos de geração e processamento de texto",
        ModelCategory.CODE: "Modelos especializados em programação e código",
        ModelCategory.VISION: "Modelos que processam e entendem imagens",
        ModelCategory.EMBEDDING: "Modelos para gerar vetores de representação semântica",
        ModelCategory.MULTIMODAL: "Modelos que combinam texto, imagem e outros",
        ModelCategory.CHAT: "Modelos otimizados para conversação",
        ModelCategory.INSTRUCTION: "Modelos para seguir instruções complexas",
    }
    return descriptions.get(category, "")

# =============================================================================
# ENDPOINTS PÚBLICOS (SEM AUTH)
# =============================================================================

@app.get("/health")
async def health():
    """Health check"""
    return {"status": "ok", "service": "ai-proxy"}

@app.get("/")
async def root():
    """Informações básicas da API"""
    return {
        "service": "AI Proxy Gateway",
        "version": "2.0.0",
        "endpoints": {
            "categories": "/categories - Lista categorias de modelos",
            "models": "/models - Lista todos os modelos",
            "generate": "/generate - Gera texto (POST, auth required)",
            "chat": "/chat - Chat com modelo (POST, auth required)",
            "embed": "/embed - Gera embeddings (POST, auth required)",
        },
        "auth_headers": ["X-Client-Id", "X-Client-Token", "X-Client-Secret"],
    }

# =============================================================================
# ENDPOINTS DE LISTAGEM (SEM AUTH para consulta)
# =============================================================================

@app.get("/categories", response_model=List[CategoryInfo])
async def list_categories():
    """Lista todas as categorias de modelos disponíveis"""
    await fetch_installed_models()
    
    categories_data = {}
    
    for model_id, info in MODEL_CATALOG.items():
        for cat in info.get("categories", []):
            if cat.value not in categories_data:
                categories_data[cat.value] = {
                    "category": cat.value,
                    "description": get_category_description(cat),
                    "models": [],
                    "default_model": None,
                }
            
            is_installed = any(
                model_id in inst or inst.startswith(model_id.split(":")[0])
                for inst in _installed_models
            )
            
            model_info = ModelInfo(
                id=model_id,
                name=info["name"],
                categories=[c.value for c in info["categories"]],
                description=info["description"],
                size=info["size"],
                memory_gb=info["memory_gb"],
                languages=info["languages"],
                capabilities=info["capabilities"],
                installed=is_installed,
                recommended_for=info.get("recommended_for", []),
            )
            categories_data[cat.value]["models"].append(model_info)
    
    for cat_name, cat_data in categories_data.items():
        installed_models = [m for m in cat_data["models"] if m.installed]
        if installed_models:
            cat_data["default_model"] = installed_models[0].id
    
    return list(categories_data.values())

@app.get("/models")
async def list_models(
    category: Optional[ModelCategory] = Query(None, description="Filtrar por categoria"),
    installed_only: bool = Query(False, description="Mostrar apenas instalados"),
):
    """Lista todos os modelos disponíveis"""
    await fetch_installed_models()
    
    result = []
    for model_id, info in MODEL_CATALOG.items():
        if category and category not in info.get("categories", []):
            continue
        
        is_installed = any(
            model_id in inst or inst.startswith(model_id.split(":")[0])
            for inst in _installed_models
        )
        
        if installed_only and not is_installed:
            continue
        
        result.append({
            "id": model_id,
            "name": info["name"],
            "categories": [c.value for c in info["categories"]],
            "description": info["description"],
            "size": info["size"],
            "memory_gb": info["memory_gb"],
            "languages": info["languages"],
            "capabilities": info["capabilities"],
            "installed": is_installed,
            "recommended_for": info.get("recommended_for", []),
            "auto_install": info.get("auto_install", False),
        })
    
    return {
        "total": len(result),
        "installed_count": sum(1 for m in result if m["installed"]),
        "models": result,
    }

@app.get("/models/installed")
async def list_installed_models():
    """Lista modelos atualmente instalados no Ollama"""
    models = await fetch_installed_models()
    return {"models": models, "count": len(models)}

# =============================================================================
# ENDPOINTS DE GERENCIAMENTO (COM AUTH)
# =============================================================================

@app.post("/models/install/{model_name:path}")
async def install_model(model_name: str, request: Request):
    """Instala um modelo específico"""
    validate_auth(request)
    
    success = await pull_model(model_name)
    if success:
        return {"status": "success", "model": model_name, "message": f"Modelo {model_name} instalado"}
    raise HTTPException(status_code=500, detail=f"Falha ao instalar modelo {model_name}")

@app.post("/models/install-auto")
async def install_auto_models(request: Request):
    """Instala todos os modelos marcados para auto-instalação"""
    validate_auth(request)
    
    results = {"success": [], "failed": [], "skipped": []}
    await fetch_installed_models()
    
    for model_name in AUTO_INSTALL_MODELS:
        base = model_name.split(":")[0]
        if any(base in m for m in _installed_models):
            results["skipped"].append(model_name)
            continue
        
        success = await pull_model(model_name)
        if success:
            results["success"].append(model_name)
        else:
            results["failed"].append(model_name)
    
    return results

@app.delete("/models/{model_name:path}")
async def delete_model(model_name: str, request: Request):
    """Remove um modelo instalado"""
    validate_auth(request)
    
    try:
        client = await get_http_client()
        resp = await client.delete(f"{OLLAMA_URL}/api/delete", json={"name": model_name})
        if resp.status_code == 200:
            _installed_models.discard(model_name)
            return {"status": "success", "message": f"Modelo {model_name} removido"}
    except Exception as e:
        logger.error(f"Erro ao remover modelo: {e}")
    
    raise HTTPException(status_code=500, detail=f"Falha ao remover modelo {model_name}")

# =============================================================================
# ENDPOINTS DE INFERÊNCIA (COM AUTH)
# =============================================================================

@app.post("/generate")
async def generate(req: GenerateRequest, request: Request):
    """Gera texto usando um modelo"""
    validate_auth(request)
    await fetch_installed_models()
    
    model = req.model
    if not model and req.category:
        model = get_default_model_for_category(req.category)
    if not model:
        model = get_default_model_for_category(ModelCategory.TEXT)
    if not model:
        raise HTTPException(status_code=400, detail="Nenhum modelo disponível. Instale um modelo primeiro.")
    
    payload = {
        "model": model,
        "prompt": req.prompt,
        "stream": req.stream,
    }
    if req.system:
        payload["system"] = req.system
    if req.images:
        payload["images"] = req.images
    if req.options:
        payload["options"] = req.options
    
    client = await get_http_client()
    
    if req.stream:
        async def stream_response():
            async with client.stream("POST", f"{OLLAMA_URL}/api/generate", json=payload) as resp:
                async for chunk in resp.aiter_bytes():
                    yield chunk
        return StreamingResponse(stream_response(), media_type="application/x-ndjson")
    else:
        resp = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
        return resp.json()

@app.post("/chat")
async def chat(req: ChatRequest, request: Request):
    """Chat com um modelo"""
    validate_auth(request)
    await fetch_installed_models()
    
    model = req.model
    if not model and req.category:
        model = get_default_model_for_category(req.category)
    if not model:
        model = get_default_model_for_category(ModelCategory.CHAT)
    if not model:
        raise HTTPException(status_code=400, detail="Nenhum modelo de chat disponível")
    
    payload = {
        "model": model,
        "messages": [m.dict() for m in req.messages],
        "stream": req.stream,
    }
    if req.options:
        payload["options"] = req.options
    
    client = await get_http_client()
    
    if req.stream:
        async def stream_response():
            async with client.stream("POST", f"{OLLAMA_URL}/api/chat", json=payload) as resp:
                async for chunk in resp.aiter_bytes():
                    yield chunk
        return StreamingResponse(stream_response(), media_type="application/x-ndjson")
    else:
        resp = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
        return resp.json()

@app.post("/embed")
async def embed(req: EmbeddingRequest, request: Request):
    """Gera embeddings para um texto"""
    validate_auth(request)
    await fetch_installed_models()
    
    model = req.model
    if not model:
        model = get_default_model_for_category(ModelCategory.EMBEDDING)
    if not model:
        raise HTTPException(status_code=400, detail="Nenhum modelo de embedding disponível")
    
    payload = {
        "model": model,
        "prompt": req.text,
    }
    
    client = await get_http_client()
    resp = await client.post(f"{OLLAMA_URL}/api/embeddings", json=payload)
    return resp.json()

# =============================================================================
# PROXY GENÉRICO PARA OLLAMA (COM AUTH)
# =============================================================================

@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy_to_ollama(path: str, request: Request):
    """Proxy autenticado para qualquer endpoint do Ollama"""
    validate_auth(request)
    
    url = f"{OLLAMA_URL}/api/{path}"
    client = await get_http_client()
    
    headers = {k: v for k, v in request.headers.items() 
               if k.lower() not in ("host", "x-client-id", "x-client-token", "x-client-secret")}
    
    body = await request.body()
    
    resp = await client.request(
        request.method,
        url,
        headers=headers,
        content=body,
        params=request.query_params,
    )
    
    return JSONResponse(content=resp.json() if resp.content else {}, status_code=resp.status_code)

# =============================================================================
# CREDENTIALS (ADMIN)
# =============================================================================

@app.get("/credentials")
async def credentials(admin_key: Optional[str] = None):
    """Retorna credenciais (requer ADMIN_KEY se configurado)"""
    ADMIN_KEY = os.environ.get("AI_PROXY_ADMIN_KEY")
    if ADMIN_KEY and admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")
    return {
        "CLIENT_ID": CLIENT_ID,
        "CLIENT_TOKEN": CLIENT_TOKEN,
        "CLIENT_SECRET": CLIENT_SECRET,
    }

# =============================================================================
# STARTUP
# =============================================================================

@app.on_event("startup")
async def startup():
    """Inicialização da aplicação"""
    logger.info("AI Proxy iniciando...")
    await fetch_installed_models()
    logger.info(f"Modelos instalados: {_installed_models}")
