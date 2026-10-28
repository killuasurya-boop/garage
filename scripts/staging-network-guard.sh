#!/usr/bin/env bash
# =============================================================================
# Pengaman insiden 28 Okt 2026: di jaringan produksi (garage_default), nama "app" dan "db"
# hanya boleh dimiliki container PRODUKSI. Bila container lain (mis. staging bernama "app")
# ikut menjawab nama itu, Caddy produksi meneruskan sebagian request ke staging → login
# produksi "Silakan login". Keluar 1 bila bentrok (pemanggil lalu mematikan staging).
# =============================================================================
set -euo pipefail

NETWORK="${NETWORK:-garage_default}"
status=0
for name in app db; do
  owners=""
  for id in $(docker ps -q --filter "network=$NETWORK"); do
    aliases="$(docker inspect --format "{{with index .NetworkSettings.Networks \"$NETWORK\"}}{{join .Aliases \" \"}}{{end}}" "$id")"
    if printf ' %s ' "$aliases" | grep -q " $name "; then
      owners="$owners $(docker inspect --format '{{.Name}}' "$id")"
    fi
  done
  count="$(printf '%s' "$owners" | wc -w)"
  if [ "$count" -ne 1 ]; then
    echo "BAHAYA: nama '$name' di $NETWORK dimiliki $count container:$owners"
    status=1
  else
    echo "OK: '$name' →$owners"
  fi
done
exit "$status"
