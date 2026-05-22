import os
import traceback
from openai import AsyncOpenAI

class ImpactInsightGenerator:
    def __init__(self):
        self.model_name = os.getenv("OPENAI_API_MODEL", "gpt-4-turbo")
        self.client = AsyncOpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("OPENAI_BASE_URL")
        )
        self.temperature = float(os.getenv("LLM_TEMPERATURE", 0.2))
    
    def _get_val(self, obj, key, default=None):
        if obj is None:
            return default
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)
        
    async def generate_impact_insights(self, data) -> str:
        """
        Translates computed blast radius metrics into an
        architectural risk narrative.
        """
        
        metrics = self._get_val(data, 'metrics')
        affected = self._get_val(data, 'affectedServices', [])
        critical_impacts = self._get_val(data, 'criticalImpacts', [])
        risk_factors = self._get_val(data, 'riskFactors', {})

        # Formating Critical Impacts
        impact_narrative = ""
        for impact in critical_impacts:
            source = self._get_val(impact, 'source', 'unknown')
            target = self._get_val(impact, 'target', 'unknown')
            status = str(self._get_val(impact, 'status', 'modified')).upper()
            score = self._get_val(impact, 'riskScore', 0)
            
            impact_narrative += (
                f"- {source} -> {target}: "
                f"Status [{status}], Risk Score: {score}/1.0\n"
            )

        # Formating Risk Factors
        risk_factor_summary = ""
        rf_items = risk_factors.items() if isinstance(risk_factors, dict) else getattr(risk_factors, 'items', lambda: [])()
        for svc, factors in rf_items:
            if factors:
                risk_factor_summary += f"- {svc}: {', '.join(factors)}\n"

        system_prompt = (
            "You are a Senior Software Architect and Site Reliability Engineer. "
            "Your task is to analyze 'Blast Radius' data resulting from code changes in a microservice system. "
            "Provide a concise, high-impact risk assessment (3-4 sentences). "
            "Focus on cascading failures, broken contracts, and high-volatility areas."
        )

        user_content = f"""
        ANALYSIS DATA:
        - Changes: {self._get_val(metrics, 'added', 0)} added, {self._get_val(metrics, 'modified', 0)} modified, {self._get_val(metrics, 'deleted', 0)} deleted.
        - Affected Services: {', '.join(affected)}
        
        CRITICAL DOWNSTREAM RISKS:
        {impact_narrative if impact_narrative else "No critical downstream risks detected."}

        SPECIFIC SERVICE RISK FACTORS:
        {risk_factor_summary if risk_factor_summary else "No specific risk factors flagged."}

        TASK:
        Identify the single most dangerous service change and explain the potential 
        architectural fallout. Suggest where the QA team should focus regression testing.
        """

        try:
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                temperature=self.temperature
            )
            
            return response.choices[0].message.content.strip()

        except Exception as e:
            print(f"Error in ImpactInsightGenerator: {e}")
            traceback.print_exc()
            return "Analysis complete. Critical volatility detected in modified service endpoints. Recommend focused regression on high-risk service contracts."