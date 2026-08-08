import json
import random
import asyncio

from langchain_ollama import ChatOllama
from langchain_openai import AzureChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser

from ..core.config import settings
from ..models.schemas import PipelineSummaryResponse

def minify_graph_payload(obj, depth=0):
    KEYS_TO_DROP = {
        "x", "y", "position", "positionAbsolute", "selected", "dragging", 
        "width", "height", "style", "isExpanded", 
        "imports", "metadata", "annotations", "protection", 
        "isFinal", "isStatic", "isAbstract", 
        "fields", "implementedTypes", "extendedType", "thrownExceptions", "initializer"
    }

    if isinstance(obj, dict):
        cleaned = {}
        for k, v in obj.items():
            if k in KEYS_TO_DROP:
                continue
            
            if k == "id" and depth > 2:
                continue

            # Timeline IRs are typically too large.
            if k == "timelineIRs" and isinstance(v, list):
                cleaned[k] = f"[{len(v)} Timeline snapshots omitted for size]"
                continue
            
            if k in ["methods", "endpoints"] and isinstance(v, list):
                compressed_methods = []
                for m in v:
                    if isinstance(m, dict):
                        name = m.get("name", "unknown_method")
                        url = m.get("url", "")
                        http_method = m.get("httpMethod", "")
                        
                        if url or http_method:
                            compressed_methods.append(f"{name} [{http_method} {url}]".strip())
                        else:
                            compressed_methods.append(name)
                cleaned[k] = compressed_methods
                continue

            if k == "test_code" and isinstance(v, str):
                cleaned[k] = v[:150] + "... [CODE TRUNCATED]"
                continue
            if k == "prompt" and isinstance(v, str):
                cleaned[k] = v[:150] + "... [PROMPT TRUNCATED]"
                continue

            if k == "logs" and isinstance(v, list):
                cleaned[k] = v[-3:] if len(v) > 3 else v
                continue

            if depth > 8:
                cleaned[k] = "[Max Depth Reached]"
                continue

            cleaned[k] = minify_graph_payload(v, depth + 1)
            
        return cleaned
        
    elif isinstance(obj, list):
        return [minify_graph_payload(item, depth + 1) for item in obj]
        
    elif isinstance(obj, str):
        if len(obj) > 500:
            return obj[:500] + f"... [TRUNCATED - Original length: {len(obj)}]"
        return obj
        
    else:
        return obj
    
class CoTSummarizerService:
    def __init__(self):
        if settings.use_external_slm:
            azure_kwargs = {
                "azure_endpoint": settings.external_api_base,
                "api_key": settings.external_api_key,
                "azure_deployment": settings.external_model_name,
                "api_version": settings.external_model_api_version,
                "max_retries": 5, 
                "model_kwargs": {"response_format": {"type": "json_object"}}
            }
            
            model_name_lower = settings.external_model_name.lower()
            if "gpt-5" in model_name_lower or "o1" in model_name_lower:
                azure_kwargs["temperature"] = 1
            else:
                azure_kwargs["temperature"] = settings.temperature
                
            self.llm = AzureChatOpenAI(**azure_kwargs)
            self.semaphore = asyncio.Semaphore(settings.semaphores)
        else:
            self.llm = ChatOllama(
                base_url=settings.ollama_base_url,
                model=settings.model_name,
                temperature=settings.temperature,
                format="json"
            )
            self.semaphore = asyncio.Semaphore(5)
        
        self.pipeline_parser = JsonOutputParser(pydantic_object=PipelineSummaryResponse)
        
        # Phase 1: Node based summarizing
        self.node_prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert Software Architect analyzing extracted microservices system data. "
                       "Extract the key architectural, structural, or domain insights from this data payload. "
                       "DO NOT talk about 'nodes', 'pipelines', 'executions', or 'tools'. "
                       "Focus entirely on what this data tells us about the analyzed software system. "
                       "You MUST output valid JSON exactly like this: {{\"summary\": \"your architectural summary here\"}}"),
            ("human", "Extracted Data:\n{node_data}")
        ])
        
        self.node_chain = self.node_prompt | self.llm | JsonOutputParser()

        # Phase 2: Final Orchestration
        self.pipeline_prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert Software Architect presenting the results of a comprehensive microservice system analysis. "
                       "You will receive a series of architectural insights collected from different stages of analysis. "
                       "Synthesize these insights into a cohesive, step-by-step story about the microservice system's architecture, dependencies, and features. "
                       "DO NOT mention the analysis tools, 'nodes', 'pipelines', or 'execution'. "
                       "Speak directly about the software being analyzed.\n\n"
                       "You MUST output raw JSON matching exactly this schema instructions:\n{format_instructions}"),
            ("human", "Architectural Insights:\n{nodes}\n\nAnalysis Connections (for context):\n{connections}")
        ])
        
        self.pipeline_chain = self.pipeline_prompt | self.llm | self.pipeline_parser

    async def _summarize_single_node(self, node: dict) -> dict:
        minified_node = minify_graph_payload(node)
        
        max_attempts = 6
        base_wait_time = 5 

        async with self.semaphore:
            for attempt in range(max_attempts):
                try:
                    result = await self.node_chain.ainvoke({
                        "node_data": json.dumps(minified_node)
                    })
                    
                    summary_text = result.get("summary", "No insights extracted.")
                    
                    return {
                        "type": node.get("type"),
                        "summary": summary_text
                    }
                    
                except Exception as e:
                    error_msg = str(e).lower()
                    if "429" in error_msg or "rate_limit" in error_msg or "too_many_requests" in error_msg:
                        if attempt == max_attempts - 1:
                            print(f"Failed to summarize node {node.get('id')} after {max_attempts} attempts.")
                            raise e 
                        
                        # Exponential backoff with jitter to avoid thundering herd 
                        base_wait = base_wait_time * (2 ** attempt)
                        jitter = random.uniform(0.5, 3.5) 
                        wait_time = base_wait + jitter

                        print(f"[Rate Limit Hit] Waiting {wait_time} seconds before attempt {attempt + 2}...")
                        await asyncio.sleep(wait_time)
                    else:
                        raise e

async def summarize(self, nodes: list, connections: list, use_external_slm: bool = None, external_api_base: str = None, external_api_key: str = None) -> list:
    # Override LLM if provided from frontend
    if use_external_slm is not None:
        if use_external_slm and external_api_base and external_api_key:
            llm = ChatOpenAI(
                base_url=external_api_base,
                api_key=external_api_key,
                model=settings.external_model_name,
                temperature=settings.temperature,
                model_kwargs={"response_format": {"type": "json_object"}}
            )
        else:
            llm = ChatOllama(
                base_url=settings.ollama_base_url,
                model=settings.model_name,
                temperature=settings.temperature,
                format="json"
            )
        self.pipeline_chain = self.prompt | llm | self.pipeline_parser

    # Phase 1: Map with pacing
    tasks = [self._summarize_single_node(node) for node in nodes]
    summarized_nodes = await asyncio.gather(*tasks)

    # Phase 2: Reduce
    result = await self.pipeline_chain.ainvoke({
        "nodes": json.dumps(summarized_nodes),
        "connections": json.dumps(connections),
        "format_instructions": self.pipeline_parser.get_format_instructions()
    })
    return result.get("steps", [])

summarizer_service = CoTSummarizerService()