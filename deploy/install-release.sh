#!/usr/bin/env bash
set -euo pipefail
umask 077
release_id=${1:?Missing release ID}
[[ "$release_id" =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ ]] || { echo 'Invalid release ID' >&2; exit 1; }
base="$HOME/whitebird-wowaudit-mcp"
release="$base/releases/$release_id"
archive="$base/incoming/$release_id.tgz"
env_file="$HOME/whitebird/shared/agent.env"
if [[ ! -f "$env_file" || ! -r "$env_file" ]]; then
  echo 'Shared configuration ~/whitebird/shared/agent.env is missing or unreadable by the deployment user.' >&2
  exit 1
fi
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
mkdir -p "$base/releases"
mkdir "$release"
trap 'rm -f "$archive" "$base/.current-'"$release_id"'"' EXIT
tar -xzf "$archive" -C "$release"
cd "$release"
npm ci --ignore-scripts --no-audit --no-fund
npm test
# Do not emit tool metadata, credentials or server errors to Actions logs.
if ! timeout 90s node --env-file="$env_file" src/cli.js >/dev/null 2>&1; then
  echo 'MCP connection check failed; current release was not changed. Check endpoint and OAuth session on the VM; run src/login.js if authorization is required.' >&2
  exit 1
fi
if [[ -e "$base/current" && ! -L "$base/current" ]]; then
  echo 'current must be a symlink' >&2
  exit 1
fi
ln -s "$release" "$base/.current-$release_id"
mv -Tf "$base/.current-$release_id" "$base/current"
echo "Activated release $release_id"
