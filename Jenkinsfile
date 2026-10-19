pipeline {
    agent any

    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '15'))
        timeout(time: 20, unit: 'MINUTES')
    }

    environment {
        COMPOSE_PROJECT_NAME = 'nekai'
        TAG = "${env.BUILD_NUMBER}"
    }

    triggers {
        // Instant: the GitHub webhook (push events, through the ngrok tunnel) starts a build
        githubPush()
        // Fallback: check GitHub every 2 minutes, in case ngrok or the network is down
        pollSCM('H/2 * * * *')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Test') {
            steps {
                // Each Dockerfile has a "test" stage. A failing test fails the build here,
                // so nothing below (Build, Deploy) runs and the live app keeps its version.
                sh '''
                    docker build --no-cache --progress=plain \
                      --target test -t nekai/api:test ./api

                    docker build --no-cache --progress=plain \
                      --target test -t nekai/ai-service:test ./ai-service

                    docker build --no-cache --progress=plain \
                      --target test -t nekai/frontend:test ./frontend
                '''
            }
        }

        stage('Build Images') {
            steps {
                withCredentials([
                    file(
                        credentialsId: 'nekai-env',
                        variable: 'ENV_FILE'
                    )
                ]) {
                    sh '''
                        docker compose --env-file "$ENV_FILE" \
                          -f docker-compose.yml build
                    '''
                }
            }
        }

        stage('Deploy') {
            steps {
                withCredentials([
                    file(
                        credentialsId: 'nekai-env',
                        variable: 'ENV_FILE'
                    )
                ]) {
                    sh '''
                        docker compose --env-file "$ENV_FILE" \
                          -f docker-compose.yml \
                          up -d --no-build --wait --wait-timeout 120
                    '''
                }
            }
        }

        stage('Smoke Test / Verify') {
            steps {
                withCredentials([
                    file(
                        credentialsId: 'nekai-env',
                        variable: 'ENV_FILE'
                    )
                ]) {
                    // scripts/smoke-test.js runs inside the api container (shared with the rollback job).
                    // EXPECTED_BUILD also checks that this build's number is the one being served.
                    sh '''
                        docker compose --env-file "$ENV_FILE" \
                          -f docker-compose.yml \
                          exec -T -e EXPECTED_BUILD="$TAG" api node - < scripts/smoke-test.js
                    '''
                }
            }
        }
    }

    post {
        success {
            echo "Nekai build ${env.BUILD_NUMBER} deployed and verified."
        }

        failure {
            echo "Pipeline failed. Open the failed stage logs."
            echo "A Test-stage failure blocks deployment."
            echo "If Deploy or Verify failed, run the 'nekai-rollback' job with the last good build number."
        }
    }
}
