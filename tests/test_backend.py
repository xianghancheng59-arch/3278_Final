import unittest
from unittest.mock import patch, MagicMock
from decimal import Decimal
from backend.app import create_app, money, ident, APIError

class BackendTests(unittest.TestCase):
    def setUp(self):
        self.app=create_app({'TESTING':True,'SECRET_KEY':'test-only'})
        self.client=self.app.test_client()
        with self.client.session_transaction() as s:
            s['user_id']=2;s['csrf_token']='test-token'
        self.headers={'X-CSRF-Token':'test-token'}

    def test_validation(self):
        for v in ['-1','1.001','NaN','Infinity','100000000',True]:
            with self.assertRaises(APIError): money(v)
        self.assertEqual(money('0'),Decimal('0'))
        for v in [True,0,-1,'1 OR 1=1',2**63,'²','1'*5000]:
            with self.assertRaises(APIError): ident(v)

    def test_csrf_before_database(self):
        self.assertEqual(self.client.post('/api/orders',json={'item_id':101}).status_code,403)

    def test_bad_input(self):
        for data in [{}, {'seller_id':1}, {'title':'x','description':'x','price':'1.001','item_condition':'good','category_id':1,'location':'HKU'}]:
            self.assertEqual(self.client.post('/api/items',json=data,headers=self.headers).status_code,400)

    def connection(self,rows):
        conn=MagicMock();c=conn.cursor.return_value.__enter__.return_value
        c.fetchone.side_effect=rows
        return conn,c

    @patch.dict('os.environ',{'DB_USER':'test','DB_PASSWORD':'test','DB_NAME':'test'})
    def test_order_commits_snapshot_and_reservation(self):
        conn,c=self.connection([{'id':2,'status':'active'}, {'id':101,'seller_id':1,'status':'available','price':Decimal('150'),'location':'HKU'},None])
        with patch('backend.app.pymysql.connect',return_value=conn):
            r=self.client.post('/api/orders',json={'item_id':'101'},headers=self.headers)
        self.assertEqual(r.status_code,201)
        self.assertEqual(r.json['agreed_amount'],'150')
        sql=[x.args[0] for x in c.execute.call_args_list]
        self.assertTrue(any('FOR UPDATE' in x for x in sql))
        self.assertTrue(any("status='reserved'" in x for x in sql))
        conn.commit.assert_called_once();conn.rollback.assert_not_called()

    @patch.dict('os.environ',{'DB_USER':'test','DB_PASSWORD':'test','DB_NAME':'test'})
    def test_unavailable_rolls_back(self):
        conn,c=self.connection([{'id':2,'status':'active'}, {'id':101,'seller_id':1,'status':'reserved'}])
        with patch('backend.app.pymysql.connect',return_value=conn):
            r=self.client.post('/api/orders',json={'item_id':101},headers=self.headers)
        self.assertEqual(r.status_code,409)
        conn.rollback.assert_called_once();conn.commit.assert_not_called()

    @patch.dict('os.environ',{'DB_USER':'test','DB_PASSWORD':'test','DB_NAME':'test'})
    def test_unauthorized_delete(self):
        conn,c=self.connection([{'id':2,'status':'active'},{'id':101,'seller_id':1}])
        with patch('backend.app.pymysql.connect',return_value=conn):
            r=self.client.delete('/api/items/101',headers=self.headers)
        self.assertEqual(r.status_code,403)
        self.assertFalse(any(x.args[0].startswith('DELETE') for x in c.execute.call_args_list))

    @patch.dict('os.environ',{'DB_USER':'test','DB_PASSWORD':'test','DB_NAME':'test'})
    def test_history_blocks_delete(self):
        conn,c=self.connection([{'id':2,'status':'active'},{'id':101,'seller_id':2,'status':'available'},{'id':1001}])
        with patch('backend.app.pymysql.connect',return_value=conn):
            r=self.client.delete('/api/items/101',headers=self.headers)
        self.assertEqual(r.status_code,409)

    def test_filters_reject_invalid_values(self):
        for query in ['condition=broken','status=unknown','min_price=10&max_price=1','offset=-1','limit=101']:
            with self.subTest(query=query):
                self.assertEqual(self.client.get('/api/items?'+query).status_code,400)

    def test_json_error_for_oversized_request(self):
        response=self.client.post('/api/items',data='x'*70000,content_type='application/json',headers=self.headers)
        self.assertEqual(response.status_code,413)
        self.assertIn('error',response.json)

    def test_item_cannot_directly_become_reserved_or_sold(self):
        for status in ['reserved','sold']:
            response=self.client.patch('/api/items/101',json={'status':status},headers=self.headers)
            self.assertEqual(response.status_code,400)

    @patch.dict('os.environ',{'DB_USER':'test','DB_PASSWORD':'test','DB_NAME':'test'})
    def test_authentication_and_suspension(self):
        conn,c=self.connection([])
        with self.client.session_transaction() as s: s.pop('user_id')
        with patch('backend.app.pymysql.connect',return_value=conn):
            self.assertEqual(self.client.get('/api/orders').status_code,401)
        with self.client.session_transaction() as s: s['user_id']=5
        conn,c=self.connection([{'id':5,'status':'suspended'}])
        with patch('backend.app.pymysql.connect',return_value=conn):
            self.assertEqual(self.client.get('/api/orders').status_code,403)

    @patch.dict('os.environ',{'DB_USER':'test','DB_PASSWORD':'test','DB_NAME':'test'})
    def test_cannot_buy_own_item(self):
        conn,c=self.connection([{'id':2,'status':'active'},{'id':101,'seller_id':2}])
        with patch('backend.app.pymysql.connect',return_value=conn):
            self.assertEqual(self.client.post('/api/orders',json={'item_id':101},headers=self.headers).status_code,403)
        conn.commit.assert_not_called()

    @patch.dict('os.environ',{'DB_USER':'test','DB_PASSWORD':'test','DB_NAME':'test'})
    def test_delete_favorites_before_item(self):
        conn,c=self.connection([{'id':2,'status':'active'},{'id':101,'seller_id':2,'status':'available'},None])
        with patch('backend.app.pymysql.connect',return_value=conn):
            self.assertEqual(self.client.delete('/api/items/101',headers=self.headers).status_code,204)
        deletes=[call.args[0] for call in c.execute.call_args_list if call.args[0].startswith('DELETE')]
        self.assertEqual(deletes,['DELETE FROM favorites WHERE item_id=%s','DELETE FROM items WHERE id=%s'])
        conn.commit.assert_called_once()

    @patch.dict('os.environ',{'DB_USER':'test','DB_PASSWORD':'test','DB_NAME':'test'})
    def test_transition_permissions_and_item_state(self):
        cases=[(1,'pending','confirmed',200,'reserved'),(1,'pending','cancelled',200,'available'),
               (1,'confirmed','cancelled',200,'available'),(1,'confirmed','completed',200,'sold'),
               (2,'pending','cancelled',200,'available'),(2,'confirmed','cancelled',409,None),
               (2,'pending','confirmed',409,None),(2,'confirmed','completed',409,None),
               (1,'pending','completed',409,None),(1,'completed','cancelled',409,None),
               (1,'cancelled','confirmed',409,None),(3,'pending','confirmed',403,None)]
        for uid,current,target,expected,item_status in cases:
            with self.subTest(uid=uid,current=current,target=target):
                with self.client.session_transaction() as s: s['user_id']=uid
                conn,c=self.connection([{'id':uid,'status':'active'},{'item_id':101},
                    {'id':101,'seller_id':1,'status':'reserved'},
                    {'id':1001,'item_id':101,'buyer_id':2,'status':current}])
                with patch('backend.app.pymysql.connect',return_value=conn):
                    response=self.client.patch('/api/orders/1001/status',json={'status':target},headers=self.headers)
                self.assertEqual(response.status_code,expected)
                updates=[call for call in c.execute.call_args_list if call.args[0].startswith('UPDATE')]
                if expected==200:
                    self.assertEqual(len(updates),2)
                    self.assertEqual(updates[1].args[1][0],item_status)
                    locks=[call.args[0] for call in c.execute.call_args_list if 'FOR UPDATE' in call.args[0]]
                    self.assertIn('FROM items',locks[0]);self.assertIn('FROM orders',locks[1])
                    conn.commit.assert_called_once()
                else:
                    self.assertEqual(updates,[]);conn.rollback.assert_called_once()

    @patch.dict('os.environ',{'DB_USER':'test','DB_PASSWORD':'test','DB_NAME':'test'})
    def test_failed_reservation_rolls_back_order_insert(self):
        conn,c=self.connection([{'id':2,'status':'active'},
            {'id':101,'seller_id':1,'status':'available','price':Decimal('150'),'location':'HKU'},None])
        def execute(sql,args):
            if sql.startswith('UPDATE items'): raise RuntimeError('Simulated write failure')
        c.execute.side_effect=execute
        with patch('backend.app.pymysql.connect',return_value=conn):
            with self.assertRaises(RuntimeError):
                self.client.post('/api/orders',json={'item_id':101},headers=self.headers)
        self.assertTrue(any(call.args[0].startswith('INSERT INTO orders') for call in c.execute.call_args_list))
        conn.rollback.assert_called_once();conn.commit.assert_not_called()

    @patch.dict('os.environ',{'DB_USER':'test','DB_PASSWORD':'test','DB_NAME':'test'})
    def test_search_binds_user_input(self):
        conn,c=self.connection([]);c.fetchall.return_value=[]
        query="' OR 1=1 --"
        with patch('backend.app.pymysql.connect',return_value=conn):
            self.assertEqual(self.client.get('/api/items',query_string={'q':query}).status_code,200)
        sql,args=c.execute.call_args.args
        self.assertNotIn(query,sql);self.assertIn('%'+query+'%',args)

if __name__=='__main__': unittest.main()
