#!/usr/bin/env bash
# Build a pre-verified release without allowing the builder to exhaust the host.
# Arguments: exact verified Git SHA, SHA256 of its git archive.
set -euo pipefail
revision=${1:?Verified source SHA is required}
archive_hash=${2:?Archive SHA256 is required}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]]
[[ "$archive_hash" =~ ^[0-9a-f]{64}$ ]]
short=${revision:0:12}
root=/root/garage
release="$root/releases/order-$short"
archive="$root/garage-order-$short.tar.gz"
builder="garage-order-$short"
container="buildx_buildkit_${builder}0"
log="$root/backups/manual-order-$short-build.log"
failure="$root/backups/manual-order-$short-guard-failure"
mkdir -p "$root/backups"
exec 9> "$root/backups/manual-order-constrained.lock"
flock -n 9
test ! -e "$failure"
test ! -e "$release"
exec >> "$log" 2>&1
echo "source=$revision"
echo "$archive_hash  $archive" | sha256sum -c -
available_kb() { awk '/^MemAvailable:/ { print $2 }' /proc/meminfo; }
test "$(available_kb)" -ge 2500000
test "$(df -Pk "$root" | awk 'NR==2 { print $4 }')" -ge 10000000
curl --fail --silent --show-error --max-time 5 --resolve garagecoffee.id:443:127.0.0.1 https://garagecoffee.id/api/health
mkdir -p "$release"
tar -xzf "$archive" -C "$release"
printf '%s\n' "$revision" > "$release/source-sha"
cat > "$release/buildkit-constrained.toml" <<'TOML'
[worker.oci]
  max-parallelism = 1
TOML
test "$(docker info --format '{{.CgroupVersion}}')" = 2
if docker buildx inspect "$builder" >/dev/null 2>&1; then
  echo EXISTING_BUILDER_REJECTED
  exit 1
fi
watchdog_pid=''
builder_created=0
cleanup() {
  if test -n "$watchdog_pid"; then kill "$watchdog_pid" 2>/dev/null || true; fi
  if test "$builder_created" = 1; then timeout --kill-after=5s 20s docker buildx stop "$builder" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
docker buildx create --name "$builder" --driver docker-container \
  --driver-opt memory=2g --driver-opt memory-swap=3g \
  --driver-opt cpu-period=100000 --driver-opt cpu-quota=40000 \
  --driver-opt restart-policy=no \
  --buildkitd-config "$release/buildkit-constrained.toml"
builder_created=1
timeout --kill-after=10s 120s docker buildx inspect "$builder" --bootstrap
limits=$(docker inspect "$container" --format '{{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} {{.HostConfig.CpuPeriod}} {{.HostConfig.CpuQuota}} {{.HostConfig.RestartPolicy.Name}}')
echo "enforced_limits=$limits"
test "$limits" = '2147483648 3221225472 100000 40000 no'
warnings=$(docker info --format '{{json .Warnings}}')
if printf '%s' "$warnings" | grep -Ei 'no (memory|swap).*limit support|no cpu.*(quota|period|limit|shares).*support'; then
  echo RESOURCE_LIMIT_SUPPORT_MISSING
  docker buildx stop "$builder"
  exit 1
fi
pid=$(docker inspect "$container" --format '{{.State.Pid}}')
cgroup=$(awk -F: '$1 == "0" {print $3}' "/proc/$pid/cgroup")
[[ "$cgroup" = /* && "$cgroup" != / && "$cgroup" != *..* ]]
test "$(cat "/sys/fs/cgroup$cgroup/memory.max")" = 2147483648
test "$(cat "/sys/fs/cgroup$cgroup/memory.swap.max")" = 1073741824
test "$(cat "/sys/fs/cgroup$cgroup/cpu.max")" = '40000 100000'
docker exec "$container" cat /etc/buildkit/buildkitd.toml | grep -Eq '^[[:space:]]*max-parallelism[[:space:]]*=[[:space:]]*1[[:space:]]*$'
echo CGROUP_LIMITS_AND_SINGLE_WORKER_VERIFIED
watch_host() {
  trap - EXIT INT TERM HUP
  misses=0
  while sleep 10; do
    mem=$(available_kb)
    if test "$mem" -lt 600000 || ! curl --fail --silent --max-time 5 --resolve garagecoffee.id:443:127.0.0.1 https://garagecoffee.id/api/health >/dev/null; then
      misses=$((misses + 1))
    else
      misses=0
    fi
    if test "$misses" -ge 2; then
      echo "PRODUCTION_GUARD_STOP available_kb=$mem" | tee "$failure"
      timeout --kill-after=5s 20s docker buildx stop "$builder" || true
      return
    fi
  done
}
watch_host &
watchdog_pid=$!
cd "$release"
for target in runner migrator; do
  image=garage-app
  if test "$target" = migrator; then image=garage-migrate; fi
  timeout --kill-after=30s 35m docker buildx build --builder "$builder" --progress plain --load \
    --target "$target" \
    --build-arg GARAGE_BUILD_NODE_OPTIONS=--max-old-space-size=1536 \
    --build-arg GARAGE_BUILD_TYPECHECK_VERIFIED=true \
    --label "org.opencontainers.image.revision=$revision" \
    -t "$image:order-$short" .
  test ! -e "$failure"
done
curl --fail --silent --show-error --max-time 5 --resolve garagecoffee.id:443:127.0.0.1 https://garagecoffee.id/api/health
docker image inspect "garage-app:order-$short" --format '{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
echo CONSTRAINED_CANDIDATE_IMAGES_READY
