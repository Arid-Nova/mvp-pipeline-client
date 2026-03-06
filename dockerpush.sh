#! /bin/bash

DOCKER_HUB_USER="cloudhub"
TAG="latest"

SERVICES=(
  "pipeline-client-backend"
  "pipeline-client-frontend"
  "pipeline-client-components"
  "pipeline-client-verifier"
  "pipeline-client-testgenerator"
  "pipeline-client-scenariogenerator"
  "pipeline-client-vectorgenerator"
  "pipeline-client-aegis_api"
  "pipeline-client-aegis_dashboard" 
)

echo "Starting build and push process for user: $DOCKER_HUB_USER"

for entry in "${SERVICES[@]}"; do
    IMAGE_NAME="${entry#*:}"
    FULL_IMAGE_PATH="$DOCKER_HUB_USER/$IMAGE_NAME:$TAG"

    docker push "$FULL_IMAGE_PATH"

    echo "Pushed $IMAGE_NAME to Docker Hub as $FULL_IMAGE_PATH"

done

echo "All images have been pushed to Docker Hub!"