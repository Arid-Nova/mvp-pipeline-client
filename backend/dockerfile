# Build from the pipeline repository root: docker build -f backend/dockerfile .
FROM node:22-bookworm-slim AS node
FROM maven:3.9.9-eclipse-temurin-21 AS build
COPY --from=node /usr/local /usr/local

# Installing Git for IR generation
RUN apt-get update && apt-get install -y --no-install-recommends python3 git && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace

COPY cimet-dependency.lock.json ./
COPY scripts/prepare_cimet_runtime.py scripts/verify_cimet_dependency.py scripts/vendor_javascript_security.py ./scripts/
COPY javascript-security ./javascript-security
RUN python3 scripts/prepare_cimet_runtime.py

# Copy the source code and build the application
COPY backend/pom.xml ./backend/pom.xml
COPY backend/src ./backend/src

RUN mvn -B -f backend/pom.xml -DskipTests package
RUN python3 scripts/verify_cimet_dependency.py --service backend

# Stage 2: Create a lightweight image to run the application
FROM eclipse-temurin:21-jre
COPY --from=node /usr/local /usr/local

# Installing Git for IR generation
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
RUN groupadd --gid 10001 aridnova && useradd --uid 10001 --gid aridnova --home-dir /app --create-home aridnova

WORKDIR /app

RUN chown 10001:10001 /app

# Copy the Spring Boot application JAR from the build stage
COPY --from=build --chown=10001:10001 /workspace/backend/target/MVPBackend-0.0.1-SNAPSHOT.war /app/application.war
COPY --from=build --chown=10001:10001 /workspace/backend/vendor /app/vendor

ENV CIMET_JAVASCRIPT_ADAPTER=/app/vendor/javascript

USER 10001:10001

# Expose the port your Spring Boot application is running on
EXPOSE 8080

# Command to run the application
ENTRYPOINT ["java", "-jar", "/app/application.war", "--server.port=8080"]
