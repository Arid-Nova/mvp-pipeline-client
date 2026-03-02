from contextlib import asynccontextmanager
import traceback

from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .analyzers.role_analyzer import RoleAnalyzer
from .generators.vector_generator import VectorGenerator
from .services.data_service import DataService

from .models.generateallrequest import GenerateAllRequest
from .models.generateoutputdata import GeneratedOutputData

df_service = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global df_service
    
    try:
        df_service = DataService()
    except Exception as e:
        print(f"CRITICAL ERROR during startup: {e}")

    yield 

app = FastAPI(title="Auth-Role Vector Generator API", lifespan=lifespan)

origins = [
    "http://localhost:3000",
    "http://localhost:8060"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,   
    allow_credentials=True,
    allow_methods=["*"],        
    allow_headers=["*"],        
)

router = APIRouter(prefix="/vectors")

@router.post("/generate-all", 
             responses={
                 500: {"description": "Generation failed"}
                 })
async def generate_all(request: GenerateAllRequest):
    global df_service

    try:
        # First check of the payload comprise of the Index ID and lean flag.
        if request.indexId:
            df_service.fetch_index_data(request)

        endpoints_map = request.endpoints.get("endpoints", {})

        # 1. Extract Roles
        role_analyzer = RoleAnalyzer(request.components)
        roles = role_analyzer.extract_roles()

        # 2. Generate Vectors
        generator = VectorGenerator(roles, endpoints_map, request.components)
        vectors = generator.generate_all_vectors()

        # 3. Prepare Metadata
        metadata = generator.generate_metadata(vectors, lean=request.lean)

        # 4. Return generated data directly
        response_data = {
            "metadata": metadata,
            "vectors": {
                endpoint_id: vector.to_dict(lean=request.lean)
                for endpoint_id, vector in vectors.items()
            }
        }

        response_data['_id'] = df_service.add_auth_vectors(collection="auth_vectors", data=response_data)
        
        return response_data

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@router.post("/generate/{endpoint_id}", 
             responses={
                 404: {"description": "Endpoint ID not found"}, 
                 500: {"description": "Error processing endpoint"}
                 })
async def generate_single(endpoint_id: str, request: GenerateAllRequest):
    """Generate auth-role vector for a specific endpoint."""
    global df_service

    try:
        if request.indexId:
            df_service.fetch_index_data(request)

        endpoints_map = request.endpoints.get("endpoints", {})

        role_analyzer = RoleAnalyzer(request.components)
        roles = role_analyzer.extract_roles()

        generator = VectorGenerator(roles, endpoints_map, request.components)
        vector = generator.generate_vector(endpoint_id)

        return vector.to_dict(lean=False)

    except KeyError:
        raise HTTPException(status_code=404, detail=f"Endpoint ID '{endpoint_id}' not found in provided data.")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error processing endpoint {endpoint_id}: {str(e)}")


@router.post("/chain/{endpoint_id}", 
             responses={
                 404: {"description": "Endpoint ID not found"},
                 500: {"description": "Error fetching chain"}
                 })
async def show_chain(endpoint_id: str, request: GenerateAllRequest):
    """Display remote call chain for a specific endpoint."""
    global df_service

    try:
        if request.indexId:
            df_service.fetch_index_data(request)

        endpoints_map = request.endpoints.get("endpoints", {})

        role_analyzer = RoleAnalyzer(request.components)
        roles = role_analyzer.extract_roles()

        generator = VectorGenerator(roles, endpoints_map, request.components)
        vector = generator.generate_vector(endpoint_id)

        # Map entries to standard dicts
        chain_data = [
            {
                "uri": entry.uri,
                "depth": entry.depth,
                "resolved": entry.resolved,
                "required_roles": entry.required_roles,
                "is_root": getattr(entry, 'is_root', False)
            }
            for entry in vector.call_chain
        ]

        return {
            "endpoint_id": endpoint_id,
            "root_uri": vector.endpoint_info['uri'],
            "total_endpoints_in_chain": len(vector.call_chain),
            "max_depth_reached": vector.statistics.max_depth_reached,
            "cycles_detected": vector.statistics.cycles_detected,
            "chain": chain_data
        }

    except KeyError:
        raise HTTPException(status_code=404, detail=f"Endpoint ID '{endpoint_id}' not found in provided data.")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error fetching chain: {str(e)}")


@router.post("/stats", 
             responses={
                 500: {"description": "Error calculating stats"}
                 })
async def get_stats(request: GeneratedOutputData):
    """Show statistics from a previously generated vector payload."""
    global df_service

    try:
        if request.id:
            df_service.fetch_vector_data(request)

        metadata = request.metadata
        vectors = request.vectors
        stats_data = metadata.get("statistics", {})

        response = {
            "generated_at": metadata.get('generated_at', 'UNKNOWN'),
            "total_endpoints": metadata.get('total_endpoints', 0),
            "total_roles": metadata.get('total_roles', 0),
            "roles": metadata.get('roles', []),
            "chain_statistics": {
                "total_remote_calls": stats_data.get('total_remote_calls', 0),
                "resolved_calls": stats_data.get('resolved_calls', 0),
                "unresolved_calls": stats_data.get('unresolved_calls', 0),
                "endpoints_with_cycles": stats_data.get('endpoints_with_cycles', 0)
            }
        }

        if vectors:
            chain_lengths = [len(v.get('call_chain', [])) for v in vectors.values()]
            if chain_lengths:
                response["chain_length_distribution"] = {
                    "average": round(sum(chain_lengths) / len(chain_lengths), 2),
                    "min": min(chain_lengths),
                    "max": max(chain_lengths)
                }

        return response

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error calculating stats: {str(e)}")


app.include_router(router)

# Only for local testing, not for production deployment
# if __name__ == '__main__':
#     import uvicorn
#     uvicorn.run("main:app", host="0.0.0.0", port=8050, reload=True)