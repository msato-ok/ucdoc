ARG NODE_VERSION=16.9.1

FROM debian:buster AS pictbuilder

ARG PICT_VERSION=v3.7.3

RUN apt-get update \
  && apt-get -y install \
  build-essential \
  git \
  && git clone https://github.com/microsoft/pict.git \
  && cd pict && git checkout "$PICT_VERSION" \
  && make

FROM node:${NODE_VERSION}

ARG APP_HOME=/app
ARG USERNAME=node

# install some packages to use
RUN apt-get update \
  && apt-get -y install --no-install-recommends \
  curl \
  vim

# Create a non-root user to use if preferred - see https://aka.ms/vscode-remote/containers/non-root-user.
RUN apt-get install --no-install-recommends -y \
  sudo \
  && echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME\
  && chmod 0440 /etc/sudoers.d/$USERNAME

# 日本語が使えるようにする
ENV DEBIAN_FRONTEND noninteractive

RUN apt-get install -y locales
RUN locale-gen ja_JP.UTF-8

ENV LANG ja_JP.UTF-8
ENV LC_CTYPE ja_JP.UTF-8
RUN localedef -f UTF-8 -i ja_JP ja_JP.utf8

# pict
COPY --from=pictbuilder /pict/pict /usr/local/bin/pict

# pandoc
RUN apt-get -y install --no-install-recommends \
  pandoc

# cleaning up unused files
RUN apt-get purge -y --auto-remove -o APT::AutoRemove::RecommendsImportant=false \
  && rm -rf /var/lib/apt/lists/*

WORKDIR ${APP_HOME}
COPY package.json ${APP_HOME}
COPY package-lock.json ${APP_HOME}
COPY .husky/ ${APP_HOME}/.husky/
COPY src/ ${APP_HOME}/src/
RUN chown -R $USERNAME:$USERNAME ${APP_HOME}

USER $USERNAME
RUN npm install
