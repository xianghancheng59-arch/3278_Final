"""Member C API. Authentication owner must set Flask session['user_id']."""
import os
import secrets
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from contextlib import contextmanager
from flask import Flask, request, session, jsonify
from werkzeug.exceptions import HTTPException
import pymysql

class APIError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status

def ident(value):
    raw = str(value)
    if isinstance(value, bool) or len(raw) > 19 or not raw.isascii() or not raw.isdigit() or not 0 < int(raw) < 2**63:
        raise APIError('Invalid ID')
    return int(value)

def money(value):
    try:
        v = Decimal(str(value))
        if not v.is_finite() or v < 0 or v > Decimal('99999999.99') or v != v.quantize(Decimal('.01')):
            raise ValueError()
        return v
    except (InvalidOperation, ValueError):
        raise APIError('Price must be non-negative with at most two decimal places')

def text(value, limit, required=True):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise APIError('Invalid text field')
    return value.strip()

def public(row):
    return {k: str(v) if k == 'id' or k.endswith('_id') or isinstance(v, Decimal) else v.isoformat()+'Z' if isinstance(v, datetime) else v for k,v in row.items()}

def create_app(config=None):
    app = Flask(__name__)
    app.config.update(SECRET_KEY=os.environ.get('SESSION_SECRET'), SESSION_COOKIE_HTTPONLY=True,
                      SESSION_COOKIE_SAMESITE='Strict', MAX_CONTENT_LENGTH=65536)
    if config: app.config.update(config)

    @contextmanager
    def db():
        conn = pymysql.connect(host=os.getenv('DB_HOST','127.0.0.1'), port=int(os.getenv('DB_PORT','3306')),
            user=os.environ['DB_USER'], password=os.environ['DB_PASSWORD'], database=os.environ['DB_NAME'],
            charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor, autocommit=False)
        try:
            with conn.cursor() as c: yield c
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally: conn.close()

    def one(c, sql, args=()):
        c.execute(sql,args)
        return c.fetchone()

    def actor(c):
        if not session.get('user_id'): raise APIError('Login required',401)
        uid = ident(session['user_id'])
        user = one(c,'SELECT id,status FROM users WHERE id=%s',(uid,))
        if not user or user['status'] != 'active': raise APIError('Account unavailable',403)
        return uid

    def body(allowed):
        data=request.get_json(silent=True)
        if not isinstance(data,dict) or set(data)-set(allowed): raise APIError('Invalid JSON fields')
        return data

    def item(c,i):
        row=one(c,'SELECT * FROM items WHERE id=%s FOR UPDATE',(ident(i),))
        if not row: raise APIError('Item not found',404)
        return row

    def owned(row,uid):
        if row['seller_id'] != uid: raise APIError('Seller only',403)

    def history(c,i,active=False):
        return one(c,"SELECT id FROM orders WHERE item_id=%s" + (" AND status IN ('pending','confirmed')" if active else '') + ' LIMIT 1 FOR UPDATE',(i,))

    def insert(c,table,data):
        # Table and column names come only from internal code, never user input.
        for attempt in range(3):
            data['id']=secrets.randbits(62)+1
            try:
                c.execute(f"INSERT INTO {table} ({','.join(data)}) VALUES ({','.join(['%s']*len(data))})",tuple(data.values()))
                return data['id']
            except pymysql.err.IntegrityError as e:
                if e.args[0]!=1062 or attempt==2: raise

    @app.errorhandler(APIError)
    def error(e): return jsonify(error=e.message),e.status

    @app.errorhandler(pymysql.err.IntegrityError)
    def integrity(e): return jsonify(error='Database constraint conflict'),409

    @app.errorhandler(HTTPException)
    def http_error(e): return jsonify(error=e.description), e.code

    @app.before_request
    def csrf():
        if request.method in ('POST','PATCH','DELETE','PUT') and request.path.startswith('/api/'):
            token=session.get('csrf_token')
            if not token or not secrets.compare_digest(token.encode('utf-8'),request.headers.get('X-CSRF-Token','').encode('utf-8')):
                raise APIError('CSRF token required',403)

    @app.get('/api/csrf')
    def csrf_token():
        if 'csrf_token' not in session: session['csrf_token']=secrets.token_urlsafe(32)
        return jsonify(csrf_token=session['csrf_token'])

    @app.get('/api/categories')
    def categories():
        with db() as c:
            c.execute('SELECT id,name FROM categories ORDER BY id')
            return jsonify([public(r) for r in c.fetchall()])

    @app.get('/api/items')
    def items():
        clauses,args=[],[]
        for key,column in [('category_id','category_id'),('seller_id','seller_id'),('condition','item_condition'),('status','status')]:
            if key in request.args:
                value=request.args[key]
                if key.endswith('_id'): value=ident(value)
                if key == 'condition' and value not in ('new','like_new','good','fair'): raise APIError('Invalid condition filter')
                if key == 'status' and value not in ('available','reserved','sold','removed'): raise APIError('Invalid status filter')
                clauses.append(f'{column}=%s');args.append(value)
        if 'status' not in request.args: clauses.append("status='available'")
        if 'q' in request.args:
            q=text(request.args['q'],160,False)
            clauses.append('(title LIKE %s OR description LIKE %s)');args.extend(['%'+q+'%']*2)
        for key,op in [('min_price','>='),('max_price','<=')]:
            if key in request.args: clauses.append('price'+op+'%s');args.append(money(request.args[key]))
        if 'min_price' in request.args and 'max_price' in request.args and money(request.args['min_price']) > money(request.args['max_price']):
            raise APIError('min_price exceeds max_price')
        try:
            limit=int(request.args.get('limit',50));offset=int(request.args.get('offset',0))
            if not 1<=limit<=100 or offset<0: raise ValueError()
        except ValueError: raise APIError('Invalid pagination')
        with db() as c:
            c.execute('SELECT * FROM items WHERE '+ ' AND '.join(clauses)+' ORDER BY created_at DESC,id DESC LIMIT %s OFFSET %s',args+[limit,offset])
            return jsonify([public(r) for r in c.fetchall()])

    @app.get('/api/items/<i>')
    def detail(i):
        with db() as c:
            row=one(c,'SELECT * FROM items WHERE id=%s',(ident(i),))
            if not row: raise APIError('Item not found',404)
            return jsonify(public(row))

    def listing(data,creating=False):
        required={'title','description','price','item_condition','category_id','location'}
        if creating and not required<=data.keys(): raise APIError('Missing listing fields')
        out={}
        for k,v in data.items():
            if k=='price': out[k]=money(v)
            elif k=='category_id': out[k]=ident(v)
            elif k=='item_condition':
                if v not in ('new','like_new','good','fair'): raise APIError('Invalid condition')
                out[k]=v
            elif k=='status':
                if v not in ('available','removed'): raise APIError('Reserved/sold status is managed by orders')
                out[k]=v
            elif k=='image_url':
                out[k]=None if v is None else text(v,2048,False)
                if out[k] and not out[k].startswith(('https://','http://')): raise APIError('Invalid image URL')
            else:
                out[k]=text(v,65535 if k=='description' else 160,k!='description')
                if k == 'description':
                    try: size=len(out[k].encode('utf-8'))
                    except UnicodeEncodeError: raise APIError('Invalid description encoding')
                    if size > 65535: raise APIError('Description exceeds MySQL TEXT byte limit')
        return out

    fields={'title','description','price','item_condition','category_id','location','image_url'}
    @app.post('/api/items')
    def create_item():
        values=listing(body(fields),True)
        with db() as c:
            uid=actor(c); now=datetime.now(timezone.utc).replace(tzinfo=None)
            values.update(seller_id=uid,status='available',created_at=now,updated_at=now)
            insert(c,'items',values)
            return jsonify(public(values)),201

    @app.patch('/api/items/<i>')
    def edit_item(i):
        values=listing(body(fields|{'status'}))
        if not values: raise APIError('No changes supplied')
        with db() as c:
            uid=actor(c);row=item(c,i);owned(row,uid)
            if row['status'] in ('reserved','sold') or history(c,row['id'],True): raise APIError('Listing locked by order',409)
            if one(c,"SELECT id FROM orders WHERE item_id=%s AND status='completed' LIMIT 1 FOR UPDATE",(row['id'],)): raise APIError('Sold listing cannot change',409)
            values['updated_at']=datetime.now(timezone.utc).replace(tzinfo=None)
            c.execute('UPDATE items SET '+','.join(k+'=%s' for k in values)+' WHERE id=%s',tuple(values.values())+(row['id'],))
            row.update(values);return jsonify(public(row))

    @app.delete('/api/items/<i>')
    def delete_item(i):
        with db() as c:
            uid=actor(c);row=item(c,i);owned(row,uid)
            if row['status'] in ('reserved','sold') or history(c,row['id']): raise APIError('Order history prevents deletion',409)
            c.execute('DELETE FROM favorites WHERE item_id=%s',(row['id'],))
            c.execute('DELETE FROM items WHERE id=%s',(row['id'],))
            return '',204

    @app.post('/api/orders')
    def order():
        data=body({'item_id','pickup_location'})
        if 'item_id' not in data: raise APIError('item_id required')
        with db() as c:
            uid=actor(c);row=item(c,data['item_id'])
            if row['seller_id']==uid: raise APIError('Cannot buy your own listing',403)
            if row['status']!='available' or history(c,row['id'],True): raise APIError('Item unavailable',409)
            now=datetime.now(timezone.utc).replace(tzinfo=None)
            values=dict(buyer_id=uid,item_id=row['id'],agreed_amount=row['price'],pickup_location=text(data.get('pickup_location',row['location']),160),status='pending',created_at=now,updated_at=now)
            insert(c,'orders',values)
            c.execute("UPDATE items SET status='reserved',updated_at=%s WHERE id=%s",(now,row['id']))
            return jsonify(public(values)),201

    @app.get('/api/orders')
    def orders():
        with db() as c:
            uid=actor(c)
            c.execute('SELECT o.*,i.title,i.seller_id FROM orders o JOIN items i ON i.id=o.item_id WHERE o.buyer_id=%s OR i.seller_id=%s ORDER BY o.created_at DESC,o.id DESC',(uid,uid))
            return jsonify([public(r) for r in c.fetchall()])

    @app.patch('/api/orders/<oid>/status')
    def status(oid):
        target=body({'status'}).get('status')
        if target not in ('confirmed','completed','cancelled'): raise APIError('Invalid order status')
        with db() as c:
            uid=actor(c)
            initial=one(c,'SELECT item_id FROM orders WHERE id=%s',(ident(oid),))
            if not initial: raise APIError('Order not found',404)
            row=item(c,initial['item_id']) # Always item first, then order: consistent lock ordering.
            o=one(c,'SELECT * FROM orders WHERE id=%s FOR UPDATE',(ident(oid),))
            seller=row['seller_id']==uid;buyer=o['buyer_id']==uid
            if not seller and not buyer: raise APIError('Order participant only',403)
            allowed=(seller and (o['status'],target) in {('pending','confirmed'),('pending','cancelled'),('confirmed','cancelled'),('confirmed','completed')}) or (buyer and o['status']=='pending' and target=='cancelled')
            if not allowed or row['status']!='reserved': raise APIError('Invalid order transition',409)
            now=datetime.now(timezone.utc).replace(tzinfo=None);state={'confirmed':'reserved','cancelled':'available','completed':'sold'}[target]
            c.execute('UPDATE orders SET status=%s,updated_at=%s WHERE id=%s',(target,now,o['id']))
            c.execute('UPDATE items SET status=%s,updated_at=%s WHERE id=%s',(state,now,row['id']))
            o.update(status=target,updated_at=now);return jsonify(public(o))
    return app

if __name__=='__main__':
    if not os.environ.get('SESSION_SECRET'): raise SystemExit('Set SESSION_SECRET first')
    create_app().run(host='127.0.0.1',port=int(os.getenv('PORT','5000')))
