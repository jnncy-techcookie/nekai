FROM jenkins/jenkins:2.580.1-jdk21

USER root

RUN apt-get update \
    && apt-get install -y ca-certificates curl \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg \
       -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

USER jenkins

# Plugins are installed into the image (list: plugins.txt), so the setup wizard has nothing to
# download. Where they come from is a build argument: the official jenkins.io servers by
# default, or a mirror when jenkins.io is unreachable (see infra/jenkins/docker-compose.yml).
ARG JENKINS_UC=https://updates.jenkins.io
ARG JENKINS_UC_DOWNLOAD=https://updates.jenkins.io/download
COPY --chown=jenkins:jenkins plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN JENKINS_UC_DOWNLOAD="$JENKINS_UC_DOWNLOAD" jenkins-plugin-cli \
      --jenkins-update-center "$JENKINS_UC/update-center.json" \
      --jenkins-plugin-info "$JENKINS_UC/current/plugin-versions.json" \
      --plugin-file /usr/share/jenkins/ref/plugins.txt