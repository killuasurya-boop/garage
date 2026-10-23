#!/usr/bin/env bash
# Run on the VPS from APP_DIR. Never restores into the production database.
set -euo pipefail
cd "$(dirname "$0")/.."
phase="${1:?Use: release-safety.sh pre|post <40-character commit SHA>}"
release_sha="${2:?Missing release commit}"
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid release SHA" >&2; exit 2; }
compose=(docker compose --env-file .env.production)
evidence="backups/release-${release_sha}"
baseline() {
  "${compose[@]}" exec -T db sh -c 'exec psql -XqAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    < scripts/pos-release-baseline.sql | sha256sum | cut -d ' ' -f 1
}
case "$phase" in
  pre)
    mkdir -p backups
    # Isolated, unexposed, resource-bounded PostgreSQL; all restore writes are disposable.
    restore_container="garage-restore-${release_sha:0:12}"
    restore_created=false
    cleanup() { if "$restore_created"; then docker rm -fv "$restore_container" >/dev/null 2>&1 || true; fi; }
    trap cleanup EXIT
    mapfile -t dumps < <(find backups -maxdepth 1 -type f -name 'garage-pre-deploy-*.sql.gz' | sort -r)
    dump="${dumps[0]:?No pre-deploy backup available}"
    gzip -t "$dump"
    docker run -d --name "$restore_container" --network none \
      --memory 256m --memory-swap 384m --cpus 0.25 \
      -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=garage_restore_check \
      postgres:16-bookworm postgres -c shared_buffers=32MB -c maintenance_work_mem=16MB \
      -c work_mem=2MB -c max_connections=10 >/dev/null
    restore_created=true
    ready=false
    for _ in $(seq 1 30); do
      if docker exec "$restore_container" pg_isready -q -U postgres -d garage_restore_check; then ready=true; break; fi
      sleep 2
    done
    "$ready" || { echo "Restore check database did not start" >&2; exit 1; }
    gzip -dc "$dump" | timeout 600 docker exec -i "$restore_container" \
      psql -Xq -v ON_ERROR_STOP=1 -U postgres -d garage_restore_check >/dev/null
    # Prove the protected catalog can be queried after the full dump restores.
    docker exec -i "$restore_container" psql -XqAt -v ON_ERROR_STOP=1 \
      -U postgres -d garage_restore_check < scripts/pos-release-baseline.sql \
      | sha256sum > "${evidence}-restore-pos.sha256"
    printf '%s\n' "$dump" > "${evidence}-backup.txt"
    baseline > "${evidence}-pos-before.sha256"
    docker image inspect "garage-app:${release_sha}" --format '{{.Id}}' > "${evidence}-image.txt"
    echo "Isolated restore and pre-migration POS baseline verified"
    ;;
  post)
    baseline > "${evidence}-pos-after.sha256"
    cmp "${evidence}-pos-before.sha256" "${evidence}-pos-after.sha256" || {
      echo "Protected POS catalog changed during deployment; inspect evidence, do not restore production automatically" >&2
      exit 1
    }
    container_id="$("${compose[@]}" ps -q app)"
    [[ -n "$container_id" ]] || { echo "No app container" >&2; exit 1; }
    actual_image="$(docker inspect "$container_id" --format '{{.Image}}')"
    [[ "$actual_image" = "$(cat "${evidence}-image.txt")" ]] || { echo "Running app image does not match release" >&2; exit 1; }
    echo "Running release image and unchanged POS catalog verified"
    ;;
  *) echo "Unknown phase: $phase" >&2; exit 2 ;;
esac
