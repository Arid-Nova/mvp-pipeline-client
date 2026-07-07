# Stage 1: Build the application using Maven
FROM --platform=linux/amd64 maven:3.9.6-eclipse-temurin-21 AS build

WORKDIR /app

# Copy the pom.xml and install dependencies
COPY pom.xml .

COPY cimet-extract-lib-1.2.1.jar /tmp/
RUN mvn install:install-file \
    -Dfile=/tmp/cimet-extract-lib-1.2.1.jar \
    -DgroupId=edu.university.ecs.lab \
    -DartifactId=cimet-extract-lib \
    -Dversion=1.2.1 \
    -Dpackaging=jar

RUN mvn dependency:go-offline

# Copy the source code and build the application
COPY src ./src
RUN mvn clean package -DskipTests

# Stage 2: Create a lightweight image to run the application
FROM eclipse-temurin:21
WORKDIR /app

# Installing Git for IR generation
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Copy the Spring Boot application JAR from the build stage
COPY --from=build /app/target/MVPBackend-0.0.1-SNAPSHOT.war /app/MVPBackend.war

# Expose the port your Spring Boot application is running on
EXPOSE 8080

# Command to run the application
ENTRYPOINT ["java", "-jar", "MVPBackend.war"]
