FROM debian:12-slim

# Install ALL Buildroot dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    wget \
    curl \
    git \
    file \
    cpio \
    rsync \
    bc \
    python3 \
    unzip \
    bzip2 \
    xz-utils \
    perl \
    patch \
    gzip \
    bison \
    flex \
    libncurses-dev \
    libssl-dev \
    gettext \
    cmake \
    ninja-build \
    && rm -rf /var/lib/apt/lists/*

# Create build user
RUN useradd -m -s /bin/bash builder
USER builder
WORKDIR /home/builder

# Download Buildroot (pinned version)
ENV BUILDROOT_VERSION=2024.02.9
RUN wget -q --no-verbose \
    https://buildroot.org/downloads/buildroot-${BUILDROOT_VERSION}.tar.gz \
    -O /tmp/buildroot.tar.gz && \
    mkdir -p /home/builder/buildroot && \
    tar -xzf /tmp/buildroot.tar.gz -C /home/builder/buildroot --strip-components=1 && \
    rm /tmp/buildroot.tar.gz

WORKDIR /home/builder/buildroot
