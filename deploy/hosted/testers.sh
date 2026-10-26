#!/usr/bin/env bash
# Hosted, invite-only test instances: one OpenCaptions container per tester on one Linux server, each with its own
# rooms, passwords and transcripts, all on your Gemini key with a weekly spending cap (BUDGET_USD_WEEK). Caddy gives
# each one https://<name>.<DOMAIN> with its own certificate. Setup: docs/deployment.md#hosted-test-instances.
#
#   ./testers.sh add ana       a new tester: prints their sign-in link (works once, within 30 minutes)
#   ./testers.sh link ana      a new sign-in link (restarts their instance: a few seconds without captions)
#   ./testers.sh list          every tester, whether it's running, and this week's AI spend
#   ./testers.sh rm ana        delete the tester and everything they made
#   ./testers.sh upgrade       the newest OpenCaptions for everyone (settings and transcripts stay)
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "Copy .env.example to .env and fill it in first." >&2; exit 1; }
set -a; . ./.env; set +a
: "${DOMAIN:?set DOMAIN in .env}" "${GEMINI_API_KEY:?set GEMINI_API_KEY in .env}"
IMAGE=${IMAGE:-ghcr.io/carraroesteban/opencaptions:latest}
mkdir -p sites

testers() { docker ps -a --format '{{.Names}}' | sed -n 's/^oc-t-//p' | sort; }
# Caddy logs to stderr even when all is well: shown only if the reload fails.
reload() { local out; out=$(docker exec oc-caddy caddy reload --config /etc/caddy/Caddyfile 2>&1) || { echo "$out" >&2; return 1; }; }

caddy_up() {
  if ! docker inspect oc-caddy >/dev/null 2>&1; then
    docker run -d --name oc-caddy --restart unless-stopped -p 80:80 -p 443:443 -p 443:443/udp \
      -e DOMAIN -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$PWD/sites:/etc/caddy/sites:ro" \
      -v oc-caddy-data:/data caddy:2 >/dev/null
  fi
  # Caddy joins each tester's own network; testers can't reach each other.
  for n in $(testers); do docker network connect "oc-t-$n" oc-caddy 2>/dev/null || true; done
}

# The tester's container. Same hardening as docker-compose.yml, plus memory, CPU and process limits so one tester
# can't slow down the others.
run() {
  docker run -d --name "oc-t-$1" --network "oc-t-$1" --restart unless-stopped \
    --memory 512m --cpus 1 --pids-limit 256 --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
    --log-opt max-size=10m --log-opt max-file=3 \
    -v "oc-t-$1:/app/data" \
    -e RECORDING_MAX_MB=300 -e GEMINI_API_KEY -e BUDGET_USD_WEEK="${BUDGET_USD_WEEK:-3}" -e TZ="${TZ:-UTC}" \
    -e PUBLIC_URL="https://$1.$DOMAIN" -e TRUST_PROXY=uniquelocal -e UPDATE_CHECK=0 \
    -e GLOSSARY=/app/data/glossary.json -e SCHEDULE=/app/data/schedule.json \
    "$IMAGE" >/dev/null
}

# Waits for the sign-in link the server prints when it starts.
signin_link() {
  for _ in $(seq 60); do
    url=$(docker logs --since "$2" "oc-t-$1" 2>&1 | grep -o 'https://[^ ]*/admin\.html?token=[^ ]*' | tail -1 || true)
    [ -n "$url" ] && { echo "$url"; return; }
    sleep 1
  done
  echo "No sign-in link after a minute: docker logs oc-t-$1" >&2; exit 1
}

invite() {
  echo
  echo "Send this to $1 (the link works once, within 30 minutes):"
  echo "  $2"
  echo "Their address: https://$1.$DOMAIN · AI budget: US\$ ${BUDGET_USD_WEEK:-3} a week, renewed on Mondays."
  echo "Ask them to keep the admin password from Settings → Security to sign in again later."
}

name=${2:-}
need_name() { [[ $name =~ ^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$ ]] || { echo "Name: lower-case letters, digits and dashes, up to 30." >&2; exit 1; }; }

case "${1:-}" in
  add)
    need_name
    docker inspect "oc-t-$name" >/dev/null 2>&1 && { echo "$name already exists: ./testers.sh link $name for a new link." >&2; exit 1; }
    since=$(date +%s)
    docker network create "oc-t-$name" >/dev/null
    run "$name"
    printf '%s.{$DOMAIN} {\n\treverse_proxy oc-t-%s:8080\n}\n' "$name" "$name" > "sites/$name.caddy"
    caddy_up
    reload
    url=$(signin_link "$name" "$since")
    invite "$name" "$url"
    ;;
  link)
    need_name
    since=$(date +%s)
    docker restart "oc-t-$name" >/dev/null
    url=$(signin_link "$name" "$since")
    invite "$name" "$url"
    ;;
  list)
    printf '%-20s %-10s %-12s %s\n' TESTER STATE SPENT ADDRESS
    for n in $(testers); do
      state=$(docker inspect -f '{{.State.Status}}' "oc-t-$n")
      spent=$(docker exec "oc-t-$n" node -e "try{const b=require('/app/data/budget.json');process.stdout.write('US\$ '+b.usd.toFixed(2))}catch{process.stdout.write('-')}" 2>/dev/null || echo -)
      printf '%-20s %-10s %-12s %s\n' "$n" "$state" "$spent" "https://$n.$DOMAIN"
    done
    ;;
  rm)
    need_name
    read -r -p "Delete $name, with all their rooms and transcripts? [y/N] " ok
    [ "$ok" = y ] || exit 1
    docker rm -f "oc-t-$name" >/dev/null 2>&1 || true
    docker network disconnect "oc-t-$name" oc-caddy 2>/dev/null || true
    docker network rm "oc-t-$name" >/dev/null 2>&1 || true
    docker volume rm "oc-t-$name" >/dev/null 2>&1 || true
    rm -f "sites/$name.caddy"
    reload
    echo "$name deleted."
    ;;
  upgrade)
    docker pull "$IMAGE"
    for n in $(testers); do docker rm -f "oc-t-$n" >/dev/null; run "$n"; echo "$n: upgraded"; done
    caddy_up
    ;;
  *)
    sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
