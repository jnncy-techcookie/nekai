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
                sh '''
                    docker build --no-cache --progress=plain \
                      --target test -t nekai/api:test ./api

                    docker build --no-cache --progress=plain \
                      --target test -t nekai/ai-service:test ./ai-service
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
                    sh '''
                        docker compose --env-file "$ENV_FILE" \
                          -f docker-compose.yml exec -T api node -e '
                        const assert = require("node:assert/strict");

                        async function check(url, expectedStatus, options = {}) {
                            const response = await fetch(url, {
                                ...options,
                                signal: AbortSignal.timeout(5000)
                            });

                            await response.text();

                            assert.equal(
                                response.status,
                                expectedStatus,
                                url + " returned " + response.status
                            );

                            console.log("PASS: " + url);
                        }

                        async function verify() {
                            // Proxy itself.
                            await check("http://proxy:8080/health", 200);

                            // Frontend through the proxy.
                            await check("http://proxy:8080/", 200);

                            // API and its database connection through the proxy.
                            await check("http://proxy:8080/api/health", 200);

                            // AI service readiness on the internal network.
                            await check("http://ai-service:3001/health", 200);

                            // AI routing through the proxy.
                            // Invalid JSON must return 400 without calling Gemini.
                            await check(
                                "http://proxy:8080/api/neko/chat",
                                400,
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json"
                                    },
                                    body: "{"
                                }
                            );
                        }

                        async function main() {
                            for (let attempt = 1; attempt <= 12; attempt++) {
                                try {
                                    await verify();
                                    console.log("Smoke test passed");
                                    return;
                                } catch (error) {
                                    console.error(
                                        "Attempt " + attempt + ": " + error.message
                                    );

                                    if (attempt === 12) throw error;

                                    await new Promise(
                                        resolve => setTimeout(resolve, 5000)
                                    );
                                }
                            }
                        }

                        main().catch(error => {
                            console.error(error);
                            process.exitCode = 1;
                        });
                        '
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
            echo "If Deploy or Verify failed, inspect Nekai and roll back if needed."
        }
    }
}