#! /bin/bash

DOCKER_HUB_USER="aridnova"
TAG="latest"

SERVICES=(
  "aridnova-toolkit-backend"
  "aridnova-toolkit-frontend"
  "aridnova-toolkit-verifier"
  "aridnova-toolkit-components"
  "aridnova-toolkit-vectorgenerator"
  "aridnova-toolkit-scenariogenerator"
  "aridnova-toolkit-testgenerator"
  "aridnova-toolkit-testexecutor"
  "aridnova-toolkit-aegis_api"
  "aridnova-toolkit-aegis_dashboard" 
)

echo "Starting build and push process for user: $DOCKER_HUB_USER"

for entry in "${SERVICES[@]}"; do
    IMAGE_NAME="${entry#*:}"
    FULL_IMAGE_PATH="$DOCKER_HUB_USER/$IMAGE_NAME:$TAG"

    docker push "$FULL_IMAGE_PATH"

    echo "Pushed $IMAGE_NAME to Docker Hub as $FULL_IMAGE_PATH"

done

echo "All images have been pushed to Docker Hub!"