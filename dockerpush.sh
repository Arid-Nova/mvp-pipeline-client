#! /bin/bash

DOCKER_HUB_USER="cloudhub"
TAG="latest"

SERVICES=(
  "cloudhub-toolkit-backend"
  "cloudhub-toolkit-frontend"
  "cloudhub-toolkit-components"
  "cloudhub-toolkit-verifier"
  "cloudhub-toolkit-testgenerator"
  "cloudhub-toolkit-scenariogenerator"
  "cloudhub-toolkit-vectorgenerator"
  "cloudhub-toolkit-aegis_api"
  "cloudhub-toolkit-aegis_dashboard" 
)

echo "Starting build and push process for user: $DOCKER_HUB_USER"

for entry in "${SERVICES[@]}"; do
    IMAGE_NAME="${entry#*:}"
    FULL_IMAGE_PATH="$DOCKER_HUB_USER/$IMAGE_NAME:$TAG"

    docker push "$FULL_IMAGE_PATH"

    echo "Pushed $IMAGE_NAME to Docker Hub as $FULL_IMAGE_PATH"

done

echo "All images have been pushed to Docker Hub!"