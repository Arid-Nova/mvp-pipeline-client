import json
import re
import openai as oai
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from ..domain.models import ExecutionPath, NeuroEvidence, MethodFlowItem
from ..services.code_fetcher import CodeFetcher
from ..services.graph_traversal_service import GraphTraversalService

# LLM Service Interface (Abstract Product)
class BaseLLMService(ABC):
    @abstractmethod
    def analyze_code(self, code_snippet: str, method_name: str, context: str) -> Optional[Dict[str, Any]]:
        # Analyzes a code snippet and returns its business context.
        # This handles prompt engineering and API calls.
        pass

    @abstractmethod
    def analyse_latent_vulnerabilities(self, analyzed_paths: List[ExecutionPath], batch_size: int = 5) -> List[Dict[str, Any]]:
        # Analyzes the execution paths to infer latent vulnerabilities.
        pass

# Concrete LLM Implementations (Concrete Products)
class OpenAILLMService(BaseLLMService):
    def __init__(self, api_key: str, endpoint: str, model: str = 'gpt-4o-mini'):
        self.client = oai.OpenAI(base_url=f"{endpoint}", api_key=api_key)
        self.model = model
        # print("Using OpenAI LLM Service")

    def _get_system_prompt(self, method_name: str, context: str) -> str:
        return f"""
        You are an expert Security and Logic Analyst. Your task is to perform a comprehensive anaysis of the Java method "{method_name}" within the {context} of a microservice system.
        
        You must extract ALL relevant semantic information, categorizing aspects of the method into three distinct dimensions:
        1. Business Utility (What feature does it serve?)
        2. Security Risks (Does it expand the attack surface or security liabilities?)
        3. Security Controls (Does it mitigate or prevent possible attacks?)

        Respond ONLY in a JSON array format with each finding object using the following keys:
        - "finding": (string) A concise description of evident security liability or attack surface expansion.
        - "confidence": (float) Your confidence in this finding (0.0 to 1.0).
        - "polarity": (string) "risk-increasing" or "risk-decreasing" or "unsure" or "business-critical"
        - "context": "{context}"

        DEFINITIONS:
        - "risk-increasing": Logic that introduces side-effects, unnecessary exposure, or specific vulnerabilities. 
            Examples: Logging sensitive data (PII), raw SQL execution, reflection, bypassing validation, unauthenticated endpoints, debug backdoors, external system calls without timeouts, or exposing internal stack traces.
        - "business-critical": High-value business logic that performs necessary state changes or data processing. 
            Examples: Booking a ticket, updating a profile, processing a payment. 
            **NOTE:** Do not label these as "risk-increasing" unless they imply a specific security weakness (e.g. "updateProfileWithoutAuth").
        - "risk-decreasing": Logic explicitly designed to reduce risk.
            Examples: Input validation/sanitization, JWT token verification, permissions checks (RBAC), data encryption, rate limiting, encryption of sensitive data.
        - "unsure": Insufficient context to classify.

        INSTRUCTIONS:
        - A single method often requires MULTIPLE findings. (e.g., A method might be "business-critical" for updating a profile AND "risk-decreasing" for validating the input).
        - Do not classify standard CRUD operations (Create, Read, Update, Delete) as "risk-increasing" solely because they modify a database. Classify them as "business-critical".
        - Focus on *semantic* security issues (data leaks, lack of controls) rather than functional importance.
        - Actively look for positive security evidence as much as negative security evidence where possible and vice versa.

        JSON FORMAT:
        [
        {{
            "finding": "(string) A concise description of the logic or risk.",
            "confidence": (float) 0.0 to 1.0,
            "polarity": "(string) One of: ['risk-increasing', 'business-critical', 'risk-decreasing', 'unsure']",
            "context": "{context}"
        }}
        ]

        Example for required business logic:
        [
        {{
            "finding": "Standard logic to allocate a seat based on travel details.",
            "confidence": 0.95,
            "polarity": "business-critical",
            "context": "Endpoint"
        }}
        ]

        Example for a logging sensitive data:
        [
        {{
            "finding": "Logs sensitive travel information which may lead to PII leakage in logs.",
            "confidence": 0.9,
            "polarity": "risk-increasing",
            "context": "Endpoint"
        }}
        ]

        Example for encrypting sensitive data:
        [
        {{
            "finding": "Likely involves cryptographic hashing before storage (implied by context).",
            "confidence": 0.70,
            "polarity": "risk-decreasing",
            "context": "Service"
        }}
        ]
        """

        # return f"""
        # You are an expert security and domain logic analyzer. Your task is to analyze
        # a Java method name "{method_name}". Determine its business context and security sensitivity. 
        
        # This is a {context} method in the micro service system.  
        
        # Respond ONLY in a JSON array format with each finding object using the following keys:
        # - "finding": (string) A concise description of the business logic.
        # - "confidence": (float) Your confidence in this finding (0.0 to 1.0).
        # - "polarity": (string) "risk-increasing" or "risk-decreasing" or "unsure".
        # - "context": "{context}"
        
        # "risk-increasing" = Logic that handles sensitive assets (PII, financial, credentials), 
        #                     performs state-changing operations (create, update, delete), 
        #                     accesses external systems, or involves critical business rules. 
        #                     Essentially, if this logic were compromised or bypassed, would it harm the business or users.
        # "risk-decreasing" = Logic that is explicitly designed to reduce risk or provides low-value utility.
        #                     Examples: Security controls (authentication, validation, sanitization), 
        #                     read-only access to public non-sensitive data, simple data transformation, 
        #                     or purely internal utility functions (logging, metrics).
        # "unsure" = Not sure if risk-increasing or risk-decreasing. 

        # There can be multiple findings that could have any polarity. Include them all in the JSON array.

        # Example for a profile update method:
        # [{{
        #   "finding": "Updates a user's profile, including address and phone number.",
        #   "confidence": 0.95,
        #   "polarity": "risk-increasing",
        #   "context": "Business Service"
        # }}]
        # """

    def analyze_code(self, code_snippet: str, method_name: str, context: str) -> Optional[Dict[str, Any]]:
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": self._get_system_prompt(method_name, context)},
                    {"role": "user", "content": f"Analyze this Java method:\n\n{code_snippet}"}
                ]
            )
            json_response = json.loads(response.choices[0].message.content)
            return json_response
        except Exception as e:
            print(f"Error calling OpenAI API: {e}")
            return None
    
    def analyse_latent_vulnerabilities(self, analyzed_paths: List[ExecutionPath], batch_size: int = 5) -> List[Dict[str, Any]]:
        all_parsed_outcomes = []
        system_prompt = """
            You are an expert Microservice Security Analyzer. 

            Data Context:
            You will receive a JSON payload containing system metadata and security findings for distributed microservice paths.
            For each path (identified by `id`, `http_method`, and `path_template`), the JSON provides:
            * `raw_ir_data`: An intermaediate representation of the distributed path in concern, detailing including remote `methodCalls`, `parameters`, and `annotations`.
            * `symbolic_evidence`: Deterministic binary security findings (e.g., UNPROTECTED_ENDPOINT, HARDCODED_SECRET, LDA). There are other variable finidings such as path_length.
            * `neuro_evidence`: Semantic security findings generated by LLMs, containing a `finding` text and `polarity` (e.g., risk-increasing).
            * `fused_opinion`: Contains a `disbelief` score representing the probability mass of the endpoint *not* being secure.

            Your Task:
            Analyze each path in the provided JSON and generate a new JSON array. For each path, infer the latent vulnerabilities (probable future exposures), their root causes, suspected locations (pinpointing exactly using `raw_ir_data`), and possible solutions.

            Output Format:
            You MUST output a valid JSON object containing a single key "results" which holds an array of your analysis. No markdown, no conversational text.
            {
            "results": [
                {
                "id": "<path_id>",
                "http_method": "<method>",
                "path_template": "<path_template>",
                "risk_score_disbelief": <float_value_from_fused_opinion>,
                "latent_vulnerabilities": ["<Vulnerability Name>"],
                "root_causes": ["<Explanation of why this vulnerability exists based on the evidence>"],
                "suspected_locations": ["<Exact pinpointed location using raw_ir_data>"],
                "possible_solutions": ["<Actionable remediation step>"]
                }
            ]
            }
            """
        
        for i in range(0, len(analyzed_paths), batch_size):
            batch = analyzed_paths[i:i + batch_size]
            batch_data = []
            
            for path in batch:
                p_dict = path.model_dump() if hasattr(path, 'model_dump') else (path.__dict__ if not isinstance(path, dict) else path)  
                batch_data.append(p_dict)

            input_json_str = json.dumps(batch_data)
            print(f"Processing batch {i//batch_size + 1} of {(len(analyzed_paths) + batch_size - 1)//batch_size}...")

            # 3. Call the LLM for this batch
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Here is the DATA JSON to analyze:\n{input_json_str}"}
                    ],
                    temperature=0.0
                )
                
                raw_output = response.choices[0].message.content.strip()
                
                # 4. Parse JSON
                try:
                    parsed_json = json.loads(raw_output)
                    # Extract the array from the "results" key we forced the LLM to use
                    if "results" in parsed_json:
                        all_parsed_outcomes.extend(parsed_json["results"])
                    else:
                        print("Warning: LLM response missing 'results' key. Appending raw object.")
                        all_parsed_outcomes.append(parsed_json)
                        
                except json.JSONDecodeError:
                    # Fallback regex cleanup if LLM still hallucinated markdown ticks despite json_object mode
                    if raw_output.startswith("```json"):
                        raw_output = re.sub(r"^```json", "", raw_output)
                        raw_output = re.sub(r"```$", "", raw_output).strip()
                    parsed_json = json.loads(raw_output)
                    all_parsed_outcomes.extend(parsed_json.get("results", []))

            except Exception as e:
                print(f"Error during LLM call on batch {i//batch_size + 1}: {e}")
                continue 

        return all_parsed_outcomes

class HuggingFaceLLMService(BaseLLMService):
    def __init__(self, model_name: str = "meta-llama/Llama-2-7b-chat-hf"):
        from transformers import pipeline, AutoTokenizer, AutoModelForCausalLM
        print(f"Loading Hugging Face model: {model_name}. This may take a while...")
        
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.model = AutoModelForCausalLM.from_pretrained(model_name)
        except Exception as e:
            print(f"CRITICAL ERROR: Could not load Hugging Face model '{model_name}'.")
            print("Ensure you have network access or the model is cached.")
            print(f"Error: {e}")
            raise

        self.pipe = pipeline(
            "text-generation",
            model=self.model,
            tokenizer=self.tokenizer,
            max_new_tokens=150
        )
        print("Using Hugging Face LLM Service")

    def _get_prompt(self, code_snippet: str, method_name: str, context: str) -> str:
        return f"""
        <s>[INST] <<SYS>>
        You are an expert security and domain logic analyzer. Your task is to analyze
        a Java method named "{method_name}" and determine its business context and security sensitivity.

        This is a {context} method in the microservice system. 
        
        Respond ONLY in a JSON array format with each finding object using the following keys:
        - "finding": (string) A concise description of the business logic.
        - "confidence": (float) Your confidence in this finding (0.0 to 1.0).
        - "polarity": (string) "risk-increasing" or "risk-decreasing" or "unsure".
        - "context": "{context}"
        
        "risk-increasing" = Handles PII, financial data, or critical state changes.
        "risk-decreasing" = Handles non-sensitive, read-only data.
        "unsure" = Not sure if risk-increasing or risk-decreasing. 

        There can be multiple findings. Include them all in the JSON array.

        Example for a profile update method:
        [{
          "finding": "Updates a user's profile, including address and phone number.",
          "confidence": 0.95,
          "polarity": "risk-increasing",
          "context": "Business Service"
        }]
        <<SYS>>
        
        Analyze this Java method:
        
        {code_snippet}
        [/INST]
        """

    def analyze_code(self, code_snippet: str, method_name: str, context: str) -> Optional[Dict[str, Any]]:
        try:
            prompt = self._get_prompt(code_snippet, method_name, context)
            response = self.pipe(prompt)[0]['generated_text']
            
            json_str = response.split("[/INST]")[-1].strip()
            json_str = json_str[json_str.find('{'):json_str.rfind('}')+1]
            
            json_response = json.loads(json_str)
            return json_response
        except Exception as e:
            print(f"Error running local Hugging Face model: {e}")
            return None

class LLMFactory:
    # The Factory class for creating LLM service instances.
    def create_llm_service(self, config: Dict[str, Any]) -> BaseLLMService:
        provider = config.get("provider", "").lower()
        
        if provider == "openai":
            api_key = config.get("api_key")
            endpoint = config.get("endpoint")
            if not api_key:
                raise ValueError("OpenAI provider requires 'api_key' in config")
            return OpenAILLMService(api_key, endpoint=endpoint, model=config.get("model", "gpt-4o-mini"))
        
        elif provider == "meta":
            model_name = config.get("model", "meta-llama/Llama-2-7b-chat-hf")
            return HuggingFaceLLMService(model_name)
        
        else:
            raise ValueError(f"Unknown LLM provider: {provider}. Supported: 'openai', 'meta'")

# The Neuro-Centric Analyzer Class.
class NeuroAnalyzer:
    # Orchestrates the neuro-centric analysis for an execution path.
    def __init__(self, code_fetcher: CodeFetcher, traverser: GraphTraversalService, llm_config: Dict[str, Any]):
        self.traverser = traverser
        self.code_fetcher = code_fetcher
        # Use the factory to create the LLM service
        self.llm_service = LLMFactory().create_llm_service(llm_config)
    
    def analyse_latent_vulnerabilities(self, analyzed_paths: List[ExecutionPath]) -> List[Dict[str, Any]]:
       return self.llm_service.analyse_latent_vulnerabilities(analyzed_paths)

    def analyze(self, execution_path: ExecutionPath) -> ExecutionPath:
        execution_path.method_flow = self.traverser.get_method_flow(execution_path.id)
        execution_path.neuro_evidence = []
        
        # Starting analysis from the endpoint and proceed down the call chain.
        for flow_item in execution_path.method_flow:
            self._analyze_single_method(execution_path, flow_item)

        return execution_path

    def _analyze_single_method(self, execution_path: ExecutionPath, flow_item: MethodFlowItem)-> ExecutionPath:
        source_file_path = flow_item.source_file_path
        method_name = flow_item.method_name
        
        if not source_file_path or not method_name:
            print(f"Skipping analysis for method {flow_item.id}: missing file/method name.")
            return execution_path

        # Fetching the code using the robust CodeFetcher
        code_snippet = self.code_fetcher.get_method_body(
            source_file_path,
            method_name
        )
        
        if not code_snippet:
            # print(f"Could not fetch code for {method_name}. Skipping LLM analysis.")
            return execution_path
            
        # Analyzing the code with the LLM
        # Providing some context to imporve the response.
        analysis_result = self.llm_service.analyze_code(
            code_snippet, 
            method_name, 
            flow_item.node_type
        )
        
        if not analysis_result:
            print(f"LLM analysis failed for {method_name}.")
            return execution_path
            
        # Creating and appending the evidence
        try:
            for finding in analysis_result['findings']:
                evidence = NeuroEvidence(
                    finding=finding["finding"],
                    confidence=float(finding["confidence"]),
                    polarity=finding["polarity"],
                    context=finding["context"]
                )
                execution_path.neuro_evidence.append(evidence)
            
        except (KeyError, ValueError, TypeError) as e:
            print(f"Error parsing LLM response for {execution_path.id}: {e}")
            print(f"Raw response: {analysis_result}")

        return execution_path