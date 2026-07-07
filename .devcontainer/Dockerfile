FROM maven:3.9.6-eclipse-temurin-21

WORKDIR /workspace

RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN bash -c "$(curl -fsSL https://raw.githubusercontent.com/ohmybash/oh-my-bash/master/tools/install.sh)" --unattended && \
    sed -i 's/^OSH_THEME=.*/OSH_THEME="powerline-icon"/' /root/.bashrc