FROM gradle:8.10-jdk17 AS build
WORKDIR /src
COPY . .
RUN gradle shadowJar --no-daemon

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /src/build/libs/app.jar app.jar
ENV PORT=8080
EXPOSE 8080
CMD ["java", "-Xmx384m", "-jar", "app.jar"]
