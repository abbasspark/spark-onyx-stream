# syntax=docker/dockerfile:1.7
# SPDX-License-Identifier: AGPL-3.0-only
#
# Builds the tracker of Spark Onyx Stream.
#
#   docker build -t onyx-stream/tracker services/tracker

ARG GO_IMAGE=golang:1.24-alpine
ARG RUN_IMAGE=alpine:3.21

FROM ${GO_IMAGE} AS build
ARG VERSION=0.1.0
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.Version=${VERSION}" \
      -o /onyx-tracker ./cmd/tracker

FROM ${RUN_IMAGE}
RUN adduser -D -u 10001 onyx
COPY --from=build /onyx-tracker /usr/local/bin/onyx-tracker
USER onyx
ENV ONYX_TRACKER_LISTEN=:8070
EXPOSE 8070
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:8070/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/onyx-tracker"]
