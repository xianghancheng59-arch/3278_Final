"""Verify B's SQL against a disposable real MySQL server, never an existing DB.

Python standard library only. Requires local MySQL server/client binaries.
Usage: python tests/verify_database.py --mysql-bin "C:/Program Files/MySQL/MySQL Server 8.0/bin"
"""
import argparse
from pathlib import Path
import socket
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mysql-bin', required=True, type=Path)
    args = parser.parse_args()
    suffix = '.exe' if __import__('os').name == 'nt' else ''
    server = args.mysql_bin / ('mysqld' + suffix)
    client = args.mysql_bin / ('mysql' + suffix)
    for binary in (server, client):
        if not binary.is_file():
            raise SystemExit(f'Missing binary: {binary}')
    repo = Path(__file__).resolve().parents[1]
    flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    passed = 0

    def run(command, **kwargs):
        return subprocess.run(command, capture_output=True, text=True,
                              encoding='utf-8', creationflags=flags, **kwargs)

    with tempfile.TemporaryDirectory(prefix='campusswap-db-test-') as temporary:
        root = Path(temporary).resolve()
        data = root / 'data'
        initialized = run([str(server), '--no-defaults', '--initialize-insecure',
                           f'--basedir={args.mysql_bin.resolve().parent}', f'--datadir={data}'], timeout=120)
        if initialized.returncode:
            raise RuntimeError(initialized.stderr)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        with (root / 'server-output.log').open('w', encoding='utf-8') as log:
            process = subprocess.Popen([
                str(server), '--no-defaults', f'--basedir={args.mysql_bin.resolve().parent}',
                f'--datadir={data}', '--bind-address=127.0.0.1', f'--port={port}',
                '--mysqlx=OFF', '--skip-log-bin', f'--log-error={root / "error.log"}',
            ], stdout=log, stderr=log, creationflags=flags)
            command = [str(client), '--no-defaults', '--protocol=TCP', '--host=127.0.0.1',
                       f'--port={port}', '--user=root', '--skip-password',
                       '--default-character-set=utf8mb4', '--batch', '--skip-column-names']
            try:
                for _ in range(120):
                    ready = run(command, input='SELECT 1;', timeout=5)
                    if ready.returncode == 0:
                        break
                    if process.poll() is not None:
                        raise RuntimeError((root / 'error.log').read_text(errors='replace'))
                    time.sleep(0.25)
                else:
                    raise RuntimeError('Disposable MySQL did not become ready')

                def sql(statement, error=None):
                    result = run(command, input='USE campusswap_test;\n' + statement, timeout=30)
                    if error is not None:
                        if result.returncode == 0 or f'ERROR {error} ' not in result.stderr:
                            raise AssertionError(f'Expected MySQL error {error}: {result.stdout} {result.stderr}')
                    elif result.returncode:
                        raise AssertionError(result.stderr)
                    return result.stdout.strip()

                def check(name, actual, expected):
                    nonlocal passed
                    if actual != expected:
                        raise AssertionError(f'{name}: expected {expected!r}, got {actual!r}')
                    passed += 1
                    print(f'PASS {name}', flush=True)

                created = run(command, input='CREATE DATABASE campusswap_test;', timeout=10)
                if created.returncode:
                    raise RuntimeError(created.stderr)
                print('MySQL ' + sql('SELECT VERSION();'), flush=True)
                sql((repo / 'sql/schema.sql').read_text(encoding='utf-8'))
                sql((repo / 'sql/seed.sql').read_text(encoding='utf-8'))
                for table, count in [('users',5),('categories',5),('items',10),('favorites',4),('orders',5)]:
                    check(f'{table} seed count', sql(f'SELECT COUNT(*) FROM {table};'), str(count))
                sql((repo / 'sql/queries.sql').read_text(encoding='utf-8'))
                check('zero price permitted',sql('SELECT price FROM items WHERE id=108;'),'0.00')
                check('zero-item category retained',sql("SELECT COUNT(i.id) FROM categories c LEFT JOIN items i ON i.category_id=c.id AND i.status='available' WHERE c.id=5;"),'0')
                check('popular item',sql('SELECT item_id FROM favorites GROUP BY item_id HAVING COUNT(*)>=2;'),'101')
                check('cancelled order history retained',sql('SELECT COUNT(*) FROM orders WHERE item_id=104;'),'2')
                check('one active order per seeded item',sql("SELECT COUNT(*) FROM (SELECT item_id FROM orders WHERE status IN ('pending','confirmed') GROUP BY item_id HAVING COUNT(*)>1) AS bad;"),'0')
                check('seed status consistency',sql("SELECT COUNT(*) FROM orders o JOIN items i ON i.id=o.item_id WHERE (o.status IN ('pending','confirmed') AND i.status<>'reserved') OR (o.status='completed' AND i.status<>'sold');"),'0')
                check('seed has no self purchase',sql('SELECT COUNT(*) FROM orders o JOIN items i ON i.id=o.item_id WHERE o.buyer_id=i.seller_id;'),'0')

                rejected = [
                    ('duplicate favorite',"INSERT INTO favorites VALUES(2,101,'2026-11-05');",1062),
                    ('duplicate email ignoring case',"UPDATE users SET email='ALICE@CONNECT.HKU.HK' WHERE id=2;",1062),
                    ('missing seller','UPDATE items SET seller_id=999 WHERE id=101;',1452),
                    ('missing category','UPDATE items SET category_id=999 WHERE id=101;',1452),
                    ('missing favorite user',"INSERT INTO favorites VALUES(999,101,'2026-11-05');",1452),
                    ('missing favorite item',"INSERT INTO favorites VALUES(2,999,'2026-11-05');",1452),
                    ('missing order buyer','UPDATE orders SET buyer_id=999 WHERE id=1001;',1452),
                    ('missing order item','UPDATE orders SET item_id=999 WHERE id=1001;',1452),
                    ('negative listing price','UPDATE items SET price=-1 WHERE id=101;',3819),
                    ('negative agreed amount','UPDATE orders SET agreed_amount=-1 WHERE id=1001;',3819),
                    ('invalid condition',"UPDATE items SET item_condition='broken' WHERE id=101;",3819),
                    ('invalid item status',"UPDATE items SET status='unknown' WHERE id=101;",3819),
                    ('invalid order status',"UPDATE orders SET status='unknown' WHERE id=1001;",3819),
                    ('invalid user status',"UPDATE users SET status='unknown' WHERE id=1;",3819),
                    ('empty title',"UPDATE items SET title='   ' WHERE id=101;",3819),
                    ('blank pickup',"UPDATE orders SET pickup_location=' ' WHERE id=1001;",3819),
                    ('null price','UPDATE items SET price=NULL WHERE id=101;',1048),
                    ('ordered listing deletion','DELETE FROM items WHERE id=110;',1451),
                    ('favorite reference protected','DELETE FROM items WHERE id=101;',1451),
                    ('seller reference protected','DELETE FROM users WHERE id=1;',1451),
                ]
                for name, statement, code in rejected:
                    sql(statement,error=code)
                    passed += 1
                    print('PASS ' + name, flush=True)
                sql("INSERT INTO items SELECT 999,seller_id,category_id,'CRUD demo',description,150.00,item_condition,status,location,image_url,created_at,updated_at FROM items WHERE id=101;")
                check('CRUD create/read',sql('SELECT price FROM items WHERE id=999;'),'150.00')
                sql("UPDATE items SET price=120.00,updated_at='2026-11-05' WHERE id=999;")
                check('CRUD update persisted across connections',sql('SELECT price FROM items WHERE id=999;'),'120.00')
                sql("INSERT INTO favorites VALUES(2,999,'2026-11-05'); DELETE FROM favorites WHERE item_id=999; DELETE FROM items WHERE id=999;")
                check('CRUD delete',sql('SELECT COUNT(*) FROM items WHERE id=999;'),'0')
                check('favorite cleanup',sql('SELECT COUNT(*) FROM favorites WHERE item_id=999;'),'0')
                sql("UPDATE items SET price=26.00 WHERE id=106;")
                check('order snapshot unaffected by price edit',sql('SELECT agreed_amount FROM orders WHERE id=1003;'),'25.00')
                print(f'PASS: {passed} checks; schema, seed and report SQL executed on disposable MySQL.',flush=True)
            finally:
                if process.poll() is None:
                    run(command, input='SHUTDOWN;', timeout=15)
                    try:
                        process.wait(timeout=20)
                    except subprocess.TimeoutExpired:
                        process.terminate()
                        process.wait(timeout=10)


if __name__ == '__main__':
    main()
