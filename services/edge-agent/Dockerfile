# syntax=docker/dockerfile:1.7
# SPDX-License-Identifier: AGPL-3.0-only
#
# Builds the edge agent of Spark Onyx Stream.
#
#   docker build -t onyx-edge-agent services/edge-agent

ARG GO_IMAGE=golang:1.24-alpine
ARG RUN_IMAGE=alpine:3.21

FROM ${GO_IMAGE} AS build
ARG VERSION=0.1.0
WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.Version=${VERSION}" \
      -o /onyx-edge-agent ./cmd/edge-agent

FROM ${RUN_IMAGE}
# Certificates for reaching the main server over HTTPS.
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 onyx \
 && mkdir -p /var/lib/onyx-edge \
 && chown onyx:onyx /var/lib/onyx-edge
COPY --from=build /onyx-edge-agent /usr/local/bin/onyx-edge-agent
USER onyx
ENV ONYX_EDGE_CACHE_DIR=/var/lib/onyx-edge \
    ONYX_EDGE_LISTEN=:8080
VOLUME /var/lib/onyx-edge
EXPOSE 8080
# Healthy once the main server has sent the key for checking tokens.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/onyx-edge-agent"]
