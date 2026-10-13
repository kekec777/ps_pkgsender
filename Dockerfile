FROM ghcr.io/phantomptr/ps5upload-engine-webui:latest AS ps5upload

FROM node:20-alpine

WORKDIR /pkg_sender

RUN apk --no-cache add curl unzip ca-certificates netcat-openbsd

COPY --from=ps5upload /ps5upload-engine /usr/local/bin/ps5upload-engine

COPY package.json package.json
RUN npm install

COPY src src
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /data /tmp /pkgs \
    && chmod 1777 /data /tmp

ENV HOME=/data
ENV TMPDIR=/tmp
ENV PS5UPLOAD_WEB_PORT=19113
ENV PS5UPLOAD_RUNTIME_PORT=9120
ENV PS5UPLOAD_ALLOW_IP=192.168.1.0/24
ENV PS5UPLOAD_PKG_HOST_IP=192.168.1.202
ENV PS5_ADDR=192.168.1.110

EXPOSE 7777 19113

CMD ["/usr/local/bin/docker-entrypoint.sh"]
