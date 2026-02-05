# Use a Python 3.9 slim image
FROM python:3.9-slim

RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1

EXPOSE 8900
EXPOSE 5600

CMD ["uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8900"]