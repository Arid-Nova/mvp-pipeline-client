import json

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import ChatOllama
from langchain_core.output_parsers import JsonOutputParser

from app.core.config import settings
from app.models.schemas import PipelineSummaryResponse

class CoTSummarizerService:
    def __init__(self):
        if settings.use_external_slm:
            self.llm = ChatOpenAI(
                base_url=settings.external_api_base,
                api_key=settings.external_api_key,
                model=settings.external_model_name,
                temperature=settings.temperature,
                model_kwargs={"response_format": {"type": "json_object"}} 
            )
        else:
            self.llm = ChatOllama(
                base_url=settings.ollama_base_url,
                model=settings.model_name,
                temperature=settings.temperature,
                format="json"
            )
        
        self.parser = JsonOutputParser(pydantic_object=PipelineSummaryResponse)
        
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert system orchestrator analyzing a non-linear pipeline execution. "
                       "You will receive a graph of Nodes (tasks/results) and Connections (execution paths). "
                       "First, trace the connections to understand parallel branches and dependencies. "
                       "Then, generate a sequential, stepped summary of what occurred, aggregating parallel branches where appropriate.\n\n"
                       "You MUST output raw JSON matching exactly this schema instructions:\n{format_instructions}"),
            ("human", "Pipeline Nodes:\n{nodes}\n\nPipeline Connections:\n{connections}")
        ])
        
        self.chain = self.prompt | self.llm | self.parser

    # async def summarize(self, nodes: list, connections: list) -> list:
    #     result = await self.chain.ainvoke({
    #         "nodes": json.dumps(nodes),
    #         "connections": json.dumps(connections),
    #         "format_instructions": self.parser.get_format_instructions()
    #     })
        
    #     return result.get("steps", [])
    async def summarize(self, nodes: list, connections: list, use_external_slm: bool = None, external_api_base: str = None, external_api_key: str = None) -> list:
        # Override settings if provided from frontend
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
            chain = self.prompt | llm | self.parser
        else:
            chain = self.chain

        result = await chain.ainvoke({
            "nodes": json.dumps(nodes),
            "connections": json.dumps(connections),
            "format_instructions": self.parser.get_format_instructions()
        })
        return result.get("steps", [])

summarizer_service = CoTSummarizerService()