FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY requirements-javascript.txt .
RUN pip install --no-cache-dir -r requirements-javascript.txt
COPY service.py .
COPY src ./src
ENV PYTHONUNBUFFERED=1
ENV AEGIS_ANALYSIS_MODE=javascript-only
EXPOSE 8900
CMD ["uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8900"]
