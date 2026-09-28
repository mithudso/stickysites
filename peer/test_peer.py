"""End-to-end test: two daemons on one box (different ports, same pairing key, multicast loopback)
discover each other and exchange a snapshot. Run: python3 -m unittest peer/test_peer.py"""
import json, os, shutil, subprocess, sys, tempfile, time, unittest, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, 'stickysites-peer.py')

def http(method, url, body=None, origin='chrome-extension://abc'):
    req = urllib.request.Request(url, data=body, method=method, headers={'Origin': origin, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=5) as r:
        return r.status, dict(r.headers), r.read()

class TwoDaemons(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if shutil.which('openssl') is None: raise unittest.SkipTest('openssl not available')
        cls.homes = [tempfile.mkdtemp(prefix='ss-peer-') for _ in range(2)]
        cls.procs = []
        key = 'test-pair-key-123'
        for i, home in enumerate(cls.homes):
            env = dict(os.environ, STICKYSITES_HOME=home)
            subprocess.run([sys.executable, SCRIPT, 'init', '--pair-key', key, '--name', 'peer%d' % i,
                            '--loop-port', str(57831 + i * 10), '--lan-port', str(57832 + i * 10), '--mcast-port', '57833'],
                           env=env, check=True, stdout=subprocess.DEVNULL)
            cls.procs.append(subprocess.Popen([sys.executable, SCRIPT, 'run'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        deadline = time.time() + 20
        while time.time() < deadline:
            try:
                a = json.loads(http('GET', 'http://127.0.0.1:57831/status')[2])['peers']
                b = json.loads(http('GET', 'http://127.0.0.1:57841/status')[2])['peers']
                if a and b: return  # both directions discovered; the round-trip test reads both views
            except Exception: pass
            time.sleep(0.5)
        cls.tearDownClass()  # unittest skips tearDownClass when setUpClass raises — do not orphan the daemons
        raise RuntimeError('peers never discovered each other')

    @classmethod
    def tearDownClass(cls):
        for p in cls.procs: p.terminate()
        for p in cls.procs: p.wait(timeout=5)
        for h in cls.homes: shutil.rmtree(h, ignore_errors=True)

    def test_cors_preflight_for_extension_origin(self):
        req = urllib.request.Request('http://127.0.0.1:57831/snapshot', method='OPTIONS', headers={'Origin': 'chrome-extension://abc'})
        with urllib.request.urlopen(req, timeout=5) as r:
            self.assertEqual(r.status, 204)
            self.assertEqual(r.headers['Access-Control-Allow-Origin'], 'chrome-extension://abc')
            self.assertIn('PUT', r.headers['Access-Control-Allow-Methods'])

    def test_rejects_bad_snapshot(self):
        with self.assertRaises(urllib.error.HTTPError) as cm:
            http('PUT', 'http://127.0.0.1:57831/snapshot', b'{"nope":1}')
        self.assertEqual(cm.exception.code, 400)
        cm.exception.close()

    def test_snapshot_round_trip_between_peers(self):
        snap = {'version': 1, 'deviceId': 'dev_a', 'ts': 'T', 'notes': {'stickysites_sites_v1': {'example.com': {'key': 'example.com', 'body': 'hello', 'updatedAt': '2026-01-01T00:00:00Z'}}}, 'tombstones': {}, 'crypto': None}
        status, _, body = http('PUT', 'http://127.0.0.1:57831/snapshot', json.dumps(snap).encode())
        self.assertEqual(status, 200); self.assertTrue(json.loads(body)['ok'])
        # peer1 pulls peer0's snapshot over pinned TLS with bearer auth
        _, _, body = http('GET', 'http://127.0.0.1:57841/peers/snapshots')
        peers = json.loads(body)['peers']
        self.assertEqual(len(peers), 1)
        self.assertEqual(peers[0]['name'], 'peer0')
        self.assertEqual(peers[0]['snapshot']['notes']['stickysites_sites_v1']['example.com']['body'], 'hello')
        # second pull hits the ETag cache and still returns the snapshot
        _, _, body = http('GET', 'http://127.0.0.1:57841/peers/snapshots')
        self.assertEqual(json.loads(body)['peers'][0]['snapshot']['deviceId'], 'dev_a')
        # peer0 has no snapshot from peer1 yet → entry has no snapshot
        _, _, body = http('GET', 'http://127.0.0.1:57831/peers/snapshots')
        self.assertIsNone(json.loads(body)['peers'][0]['snapshot'])

    def test_config_round_trip_and_validation(self):
        _, _, body = http('GET', 'http://127.0.0.1:57831/config')
        cfg = json.loads(body)
        self.assertEqual(cfg['name'], 'peer0'); self.assertEqual(cfg['pairKey'], 'test-pair-key-123'); self.assertEqual(cfg['staticPeers'], [])
        self.assertEqual(cfg['discoveryPort'], 57833); self.assertIsInstance(cfg['addrs'], list)
        # set static peers (comma-separated string accepted, whitespace/dupes dropped) — persists to peer.json
        _, _, body = http('PUT', 'http://127.0.0.1:57831/config', b'{"staticPeers": "192.168.1.50, 192.168.1.51:57833,,192.168.1.50"}')
        res = json.loads(body)
        self.assertTrue(res['ok']); self.assertEqual(res['changed'], ['staticPeers'])
        self.assertEqual(res['config']['staticPeers'], ['192.168.1.50', '192.168.1.51:57833'])
        on_disk = json.load(open(os.path.join(self.homes[0], 'peer.json')))
        self.assertEqual(on_disk['static_peers'], ['192.168.1.50', '192.168.1.51:57833'])
        st = json.loads(http('GET', 'http://127.0.0.1:57831/status')[2])
        self.assertEqual(st['staticPeers'], ['192.168.1.50', '192.168.1.51:57833'])
        # invalid inputs are rejected and leave config untouched
        for bad in (b'{"pairKey": "short"}', b'{"staticPeers": ["not an ip !!"]}', b'{"staticPeers": ["192.168.1.9:99999"]}', b'[1,2]'):
            with self.assertRaises(urllib.error.HTTPError) as cm:
                http('PUT', 'http://127.0.0.1:57831/config', bad)
            self.assertEqual(cm.exception.code, 400); cm.exception.close()
        self.assertEqual(json.loads(http('GET', 'http://127.0.0.1:57831/config')[2])['pairKey'], 'test-pair-key-123')
        # clear again so other tests are unaffected
        http('PUT', 'http://127.0.0.1:57831/config', b'{"staticPeers": []}')

    def test_connection_test_endpoint(self):
        # peer0 tests peer1 explicitly by address: tcp → tls → pairing all pass
        _, _, body = http('GET', 'http://127.0.0.1:57831/test?peer=127.0.0.1:57842')
        res = json.loads(body)['results'][0]
        self.assertTrue(res['ok'], res)
        self.assertEqual([s['step'] for s in res['steps']], ['tcp', 'tls', 'pairing'])
        self.assertEqual(res['peerName'], 'peer1')
        # a closed port fails definitively at the tcp step
        _, _, body = http('GET', 'http://127.0.0.1:57831/test?peer=127.0.0.1:1')
        res = json.loads(body)['results'][0]
        self.assertFalse(res['ok']); self.assertEqual(res['steps'][-1]['step'], 'tcp')
        # default (no ?peer): tests every announced peer
        _, _, body = http('GET', 'http://127.0.0.1:57831/test')
        self.assertTrue(any(r['ok'] for r in json.loads(body)['results']))

    def test_sync_folder_transport(self):
        # both daemons point at one shared folder; peer1 sees peer0's snapshot through it even with
        # LAN discovery ignored (peer ids differ, so no dedupe against live peers matters here)
        shared = tempfile.mkdtemp(prefix='ss-shared-')
        try:
            for port in (57831, 57841):
                _, _, body = http('PUT', 'http://127.0.0.1:%d/config' % port, json.dumps({'syncDir': shared}).encode())
                self.assertEqual(json.loads(body)['changed'], ['syncDir'])
            snap = {'version': 1, 'deviceId': 'dev_folder', 'ts': 'T', 'notes': {'stickysites_daily_v1': {'2026-01-01': {'key': '2026-01-01', 'body': 'via folder', 'updatedAt': '2026-01-01T00:00:00Z'}}}, 'tombstones': {}, 'crypto': None}
            http('PUT', 'http://127.0.0.1:57831/snapshot', json.dumps(snap).encode())
            files = [f for f in os.listdir(shared) if f.startswith('stickysites-peer-') and f.endswith('.json')]
            self.assertEqual(len(files), 1)
            doc = json.load(open(os.path.join(shared, files[0])))
            self.assertEqual(doc['name'], 'peer0'); self.assertIn('sig', doc); self.assertEqual(doc['snapshot']['deviceId'], 'dev_folder')
            _, _, body = http('GET', 'http://127.0.0.1:57841/peers/snapshots')
            peers = json.loads(body)['peers']
            # peer0 is also a live LAN peer here, so the entry is reported once: via LAN with alsoVia=folder,
            # or via folder if the LAN fetch failed — either way the folder content is what we wrote
            p0 = [p for p in peers if p['name'] == 'peer0']
            self.assertEqual(len(p0), 1)
            self.assertIn(p0[0].get('via') or p0[0].get('alsoVia'), ('folder',))
            self.assertEqual(p0[0]['snapshot']['notes']['stickysites_daily_v1']['2026-01-01']['body'], 'via folder')
            # a file signed with a different key is reported, not trusted
            bad = dict(doc); bad['id'] = 'peer_evil'; bad['sig'] = '0' * 64
            json.dump(bad, open(os.path.join(shared, 'stickysites-peer-peer_evil.json'), 'w'))
            _, _, body = http('GET', 'http://127.0.0.1:57841/peers/snapshots')
            evil = [p for p in json.loads(body)['peers'] if p['id'] == 'peer_evil']
            self.assertEqual(len(evil), 1); self.assertIn('signature mismatch', evil[0]['error']); self.assertNotIn('snapshot', evil[0])
            # status/test expose folder health
            st = json.loads(http('GET', 'http://127.0.0.1:57841/status')[2])['folder']
            self.assertTrue(st['configured'] and st['exists'] and st['writable'])
            self.assertTrue(any(p['ok'] for p in st['peers']), st)
            # missing folder is rejected on PUT
            with self.assertRaises(urllib.error.HTTPError) as cm:
                http('PUT', 'http://127.0.0.1:57841/config', b'{"syncDir": "/nonexistent/ss-folder"}')
            self.assertEqual(cm.exception.code, 400); cm.exception.close()
        finally:
            for port in (57831, 57841): http('PUT', 'http://127.0.0.1:%d/config' % port, b'{"syncDir": ""}')
            shutil.rmtree(shared, ignore_errors=True)

    def test_lan_endpoint_requires_bearer(self):
        import ssl, http.client
        ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
        conn = http.client.HTTPSConnection('127.0.0.1', 57832, timeout=5, context=ctx)
        conn.request('GET', '/snapshot'); r = conn.getresponse(); conn.close()
        self.assertEqual(r.status, 401)

if __name__ == '__main__':
    unittest.main()
