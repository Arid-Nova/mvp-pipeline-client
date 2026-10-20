from contextlib import asynccontextmanager
import os
from typing import Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from src.analysis.javascript_security import javascript_security_response
from src.services.ir_reader import read_stored_ir
from src.analysis.javascript_llm import review_javascript

facade = None


def get_java_facade():
    """Load Java/model/database integrations only for a Java analysis request."""
    global facade
    if os.getenv('AEGIS_ANALYSIS_MODE') == 'javascript-only':
        raise HTTPException(status_code=422, detail={
            'status': 'unsupported', 'capability': 'java-security-analysis',
            'reason': 'This image serves saved JavaScript reports. Java analysis requires the original Aegis image and configured dependencies.',
        })
    if facade is None:
        from main import AnalysisFacade
        facade = AnalysisFacade()
    return facade


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Saved JS evidence needs only the configured IR service, not Neo4j or models.
    yield
    if facade is not None:
        facade.cleanup()


app = FastAPI(title='Aegis Security Analysis API', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/health')
def health_check():
    return {'status': 'healthy', 'description': 'Aegis Analysis API',
            'storedIrServiceConfigured': bool(os.getenv('IR_SERVICE_URL')),
            'javaEngineInitialized': facade is not None,
            'openaiConfigured': bool(os.getenv('OPENAI_API_KEY_FILE') or os.getenv('OPENAI_API_KEY'))}


@app.post('/analyze', responses={400: {'description': 'Missing saved IR identifier'},
                               500: {'description': 'Analysis or IR retrieval failed'}})
async def analyze_endpoint(payload: Dict[str, Any]):
    ir_id = payload.get('ir_id')
    if not isinstance(ir_id, str) or not ir_id.strip() or len(ir_id) > 256:
        raise HTTPException(status_code=400, detail='ir_id must identify a saved IR in at most 256 characters')
    try:
        # The caller supplies an identifier, never a source path or service URL.
        ir = read_stored_ir(ir_id)
        javascript = javascript_security_response(ir)
        if javascript is not None:
            result = {**javascript, 'ir_id': ir_id}
            if payload.get('llmReview') is True and javascript.get('status') in ('complete', 'partial'):
                history_id = payload.get('history_ir_id')
                history = read_stored_ir(history_id) if history_id else None
                result['llmReview'] = review_javascript(ir, history)
            return result

        engine = get_java_facade()
        results = engine.run_analysis(payload, ir_data=ir)
        if isinstance(results, dict) and results.get('status') in ('unsupported', 'partial'):
            return results
        if 'vulnerabilities' in results:
            return {'status': 'success'}
        engine.get_latent_vulnerabilities(ir_id, results)
        return {'status': 'success'}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('service:app', host='0.0.0.0', port=8900)
