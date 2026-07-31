#!/bin/sh
set -eu

target=/run/secrets/runtime
mkdir -p "$target"
for name in \
  e2e_worker_postgres_url \
  e2e_rabbit_ca \
  e2e_rabbit_consumer_username \
  e2e_rabbit_consumer_password \
  e2e_rabbit_publisher_username \
  e2e_rabbit_publisher_password
do
  cp "/run/secrets/$name" "$target/$name"
  chmod 0400 "$target/$name"
done

exec node dist/worker-main.js
