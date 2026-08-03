FROM maven:3.9-eclipse-temurin-21 AS build
ENV JAVA_TOOL_OPTIONS="-XX:UseSVE=0"
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21.0.6_7-jre
ENV JAVA_TOOL_OPTIONS="-XX:UseSVE=0"
WORKDIR /app
COPY --from=build /app/target/chatbot-backend-*.jar app.jar
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
