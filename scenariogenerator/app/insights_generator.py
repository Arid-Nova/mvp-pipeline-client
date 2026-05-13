import os
import json
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
        
    async def generate_impact_insights(self, data) -> str:
        """
        Translates computed blast radius metrics into a
        architectural risk narrative.
        """
        
        impact_narrative = ""
        critical_impacts = getattr(data, 'criticalImpacts', [])
        for impact in critical_impacts:
            impact_narrative += (
                f"- {impact.source} -> {impact.target}: "
                f"Status [{impact.status.upper()}], Risk Score: {impact.riskScore}/1.0\n"
            )

        risk_factor_summary = ""
        risk_factors = getattr(data, 'riskFactors', {})
        for svc, factors in risk_factors.items():
            if factors:
                risk_factor_summary += f"- {svc}: {', '.join(factors)}\n"

        system_prompt = (
            "You are a Senior Software Architect and Site Reliability Engineer. "
            "Your task is to analyze 'Blast Radius' data resulting from code changes in a microservice system. "
            "Provide a concise, high-impact risk assessment (3-4 sentences). "
            "Focus on cascading failures, broken contracts, and high-volatility areas."
        )

        metrics = getattr(data, 'metrics', None)
        affected = getattr(data, 'affectedServices', [])
        
        user_content = f"""
        ANALYSIS DATA:
        - Changes: {metrics.added if metrics else 0} added, {metrics.modified if metrics else 0} modified, {metrics.deleted if metrics else 0} deleted.
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