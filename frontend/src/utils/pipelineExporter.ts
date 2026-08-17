export type ExportTarget = 'github-actions' | 'jenkins' | 'aws-codebuild' | 'gitlab-ci';
export type ExportMode = 'session-runner' | 'expanded-steps';
import { env } from '../config';

export const exportSessionPipelineConfig = (
    sessionId: string,
    sessionName: string,
    target: ExportTarget
): string => {
    const pipelineTitle = sessionName || 'AridNova-Pipeline';
    const baseUrl = env.ARIDNOVA_API_URL || 'https://api.aridnova.net';

    switch (target) {
        case 'github-actions':
            return `# GitHub Actions Workflow for Saved Session: ${sessionName}
                name: ${pipelineTitle}

                on:
                push:
                    branches: [ "main", "master" ]
                pull_request:
                    branches: [ "main", "master" ]

                jobs:
                run-aridnova-session:
                    runs-on: ubuntu-latest
                    steps:
                    - name: Trigger AridNova Pipeline Session
                        run: |
                        curl -X POST "${baseUrl}/coordinator/execute/${sessionId}" \\
                            -H "Authorization: Bearer \${{ secrets.ARIDNOVA_API_KEY }}" \\
                            -H "Content-Type: application/json"
                `;

        case 'jenkins':
            return `// Jenkinsfile for Saved Session: ${sessionName}
                pipeline {
                    agent any
                    
                    environment {
                        ARIDNOVA_API_KEY = credentials('aridnova-api-key')
                        ARIDNOVA_API_URL = '${baseUrl}'
                    }

                    stages {
                        stage('Execute AridNova Session') {
                            steps {
                                sh '''
                                    curl -X POST "${baseUrl}/coordinator/execute/${sessionId}" \\
                                    -H "Authorization: Bearer \${ARIDNOVA_API_KEY}" \\
                                    -H "Content-Type: application/json"
                                '''
                            }
                        }
                    }
                }
                `;

        case 'aws-codebuild':
            return `# AWS CodeBuild for Saved Session: ${sessionName}
                version: 0.2

                env:
                secrets-manager:
                    ARIDNOVA_API_KEY: "aridnova/api:key"
                variables:
                    ARIDNOVA_API_URL: "${baseUrl}"

                phases:
                build:
                    commands:
                    - echo "Triggering AridNova Session ${sessionId}..."
                    - curl -X POST "$ARIDNOVA_API_URL/coordinator/execute/${sessionId}" -H "Authorization: Bearer $ARIDNOVA_API_KEY" -H "Content-Type: application/json"
                `;

        case 'gitlab-ci':
            return `# GitLab CI/CD for Saved Session: ${sessionName}
                    stages:
                - analysis

                run_aridnova_session:
                stage: analysis
                image: curlimages/curl:latest
                script:
                    - curl -X POST "$ARIDNOVA_API_URL/coordinator/execute/${sessionId}" -H "Authorization: Bearer $ARIDNOVA_API_KEY" -H "Content-Type: application/json"
                `;

        default:
            return '';
    }
};