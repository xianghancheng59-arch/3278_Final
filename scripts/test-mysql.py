"""Run C's integration tests on a newly initialized, disposable MySQL instance.

Usage: python3 scripts/test-mysql.py --mysql-bin /path/to/mysql/bin
Uses only the Python standard library plus the repository's npm dependencies.
Never connects to the database in .env or reuses an existing data directory.
"""
import argparse
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mysql-bin', required=True, type=Path)
    args = parser.parse_args()
    suffix = '.exe' if os.name == 'nt' else ''
    server, client = [args.mysql_bin.resolve() / (name + suffix) for name in ('mysqld', 'mysql')]
    for binary in (server, client):
        if not binary.is_file():
            raise SystemExit(f'Missing binary: {binary}')
    repo = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix='campusswap-c-') as temporary:
        root = Path(temporary)
        subprocess.run([str(server), '--no-defaults', '--initialize-insecure',
                        f'--basedir={server.parent.parent}', f'--datadir={root / "data"}'], check=True, capture_output=True, timeout=120)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        command = [str(client), '--no-defaults', '--protocol=TCP', '--host=127.0.0.1',
                   f'--port={port}', '--user=root', '--skip-password', '--default-character-set=utf8mb4', '--batch', '--skip-column-names']
        with (root / 'server.log').open('w') as log:
            process = subprocess.Popen([str(server), '--no-defaults', f'--basedir={server.parent.parent}',
                f'--datadir={root / "data"}', '--bind-address=127.0.0.1', f'--port={port}',
                f'--socket={root / "mysql.sock"}', f'--pid-file={root / "mysql.pid"}',
                '--mysqlx=OFF', '--skip-log-bin'], stdout=log, stderr=log)
            try:
                for _ in range(120):
                    ready = subprocess.run(command, input='SELECT 1;', text=True, capture_output=True, timeout=5)
                    if ready.returncode == 0:
                        break
                    if process.poll() is not None:
                        raise RuntimeError((root / 'server.log').read_text())
                    time.sleep(0.25)
                else:
                    raise RuntimeError('Disposable MySQL did not become ready')
                sql = 'CREATE DATABASE campusswap_c_test; USE campusswap_c_test;\n'
                sql += (repo / 'sql/schema.sql').read_text() + '\n' + (repo / 'sql/seed.sql').read_text()
                subprocess.run(command, input=sql, text=True, capture_output=True, check=True, timeout=30)
                version = subprocess.run(command, input='SELECT VERSION();', text=True, capture_output=True, check=True).stdout.strip()
                print(f'Running integration tests on disposable MySQL {version}', flush=True)
                env = {**os.environ, 'C_MYSQL_TEST': '1', 'MYSQL_HOST': '127.0.0.1', 'MYSQL_PORT': str(port),
                       'MYSQL_USER': 'root', 'MYSQL_PASSWORD': '', 'MYSQL_DATABASE': 'campusswap_c_test'}
                result = subprocess.run(['node', '--test', 'tests/mysql.test.js'], cwd=repo, env=env)
            finally:
                if process.poll() is None:
                    subprocess.run(command, input='SHUTDOWN;', text=True, capture_output=True, timeout=15)
                    try:
                        process.wait(timeout=20)
                    except subprocess.TimeoutExpired:
                        process.terminate()
                        process.wait(timeout=10)
            raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
