FROM python:3.11-slim

WORKDIR /app

# Installing curl and Java support
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    default-jdk-headless \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose the port
EXPOSE 8010

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]