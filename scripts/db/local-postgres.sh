#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_bin="${POSTGRES_APP_BIN:-/Applications/Postgres.app/Contents/Versions/latest/bin}"
data_dir="${LOCAL_POSTGRES_DATA_DIR:-${project_root}/.local/postgres-data}"
log_file="${project_root}/.local/postgres.log"
port="${LOCAL_POSTGRES_PORT:-5432}"
database="${LOCAL_POSTGRES_DATABASE:-cse_training_partner_local}"
postgres_user="$(id -un)"

for command in initdb pg_ctl pg_isready createdb; do
  if [[ ! -x "${postgres_bin}/${command}" ]]; then
    echo "Postgres.app was not found at ${postgres_bin}. Install Postgres.app or set POSTGRES_APP_BIN." >&2
    exit 1
  fi
done

initialize_cluster() {
  if [[ -f "${data_dir}/PG_VERSION" ]]; then
    return
  fi

  mkdir -p "${project_root}/.local"
  "${postgres_bin}/initdb" --auth=trust --username="${postgres_user}" --no-locale --encoding=UTF8 --pgdata="${data_dir}"
}

start_database() {
  initialize_cluster

  if "${postgres_bin}/pg_ctl" --pgdata="${data_dir}" status >/dev/null 2>&1; then
    echo "Local PostgreSQL is already running on port ${port}."
  else
    "${postgres_bin}/pg_ctl" --pgdata="${data_dir}" --log="${log_file}" --options="-p ${port} -c listen_addresses=127.0.0.1" start
  fi

  until "${postgres_bin}/pg_isready" --host=127.0.0.1 --port="${port}" --username="${postgres_user}" >/dev/null; do
    sleep 1
  done

  if ! "${postgres_bin}/psql" --host=127.0.0.1 --port="${port}" --username="${postgres_user}" --dbname=postgres --tuples-only --no-align --command="SELECT 1 FROM pg_database WHERE datname = '${database}'" | grep -qx "1"; then
    "${postgres_bin}/createdb" --host=127.0.0.1 --port="${port}" --username="${postgres_user}" "${database}"
    echo "Created local database ${database}."
  fi

  echo "Local PostgreSQL is ready: postgresql://${postgres_user}@127.0.0.1:${port}/${database}?schema=public"
}

case "${1:-}" in
  start)
    start_database
    ;;
  stop)
    if "${postgres_bin}/pg_ctl" --pgdata="${data_dir}" status >/dev/null 2>&1; then
      "${postgres_bin}/pg_ctl" --pgdata="${data_dir}" stop --mode=fast
    else
      echo "Local PostgreSQL is not running."
    fi
    ;;
  status)
    "${postgres_bin}/pg_ctl" --pgdata="${data_dir}" status
    ;;
  *)
    echo "Usage: $0 {start|stop|status}" >&2
    exit 1
    ;;
esac
