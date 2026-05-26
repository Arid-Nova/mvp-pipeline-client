#! /bin/bash

DOCKER_HUB_USER="aridnovaaz"
REPO_NAME="aridnova-toolkit"
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
  "aridnova-toolkit-repohandler" 
)

echo "Starting tag and push process for Docker Hub repo: $DOCKER_HUB_USER/$REPO_NAME"

for LOCAL_IMAGE in "${SERVICES[@]}"; do

    SERVICE_TAG="${LOCAL_IMAGE#aridnova-toolkit-}"
    
    TARGET_IMAGE="$DOCKER_HUB_USER/$REPO_NAME:$SERVICE_TAG"

    echo "Tagging local image $LOCAL_IMAGE:latest -> $TARGET_IMAGE"
    docker tag "$LOCAL_IMAGE:latest" "$TARGET_IMAGE"

    echo "Pushing $TARGET_IMAGE to Docker Hub..."
    docker push "$TARGET_IMAGE"

done

echo "All images have been successfully pushed to $DOCKER_HUB_USER/$REPO_NAME!"