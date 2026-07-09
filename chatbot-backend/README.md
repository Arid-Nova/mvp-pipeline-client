# Chatbot Backend

Standalone Spring Boot service for chatbot APIs. This module is intentionally separate from the main `backend` service and does not depend on that module. Shared contracts can be added later through a dedicated shared module if needed.

## Run Locally

```sh
mvn -f chatbot-backend/pom.xml spring-boot:run
```

The service starts on port `8081` by default.

## Health Check

```sh
curl http://localhost:8081/chatbot/health
```

## Test

```sh
mvn -f chatbot-backend/pom.xml test
```

## Docker

```sh
docker build -t chatbot-backend ./chatbot-backend
docker run --rm -p 8081:8081 chatbot-backend
```
