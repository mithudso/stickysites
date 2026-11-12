"""Actual peer integration and regression tests. Run: python3 -m unittest peer/test_peer.py"""
import concurrent.futures
import copy
import hashlib
import http.client as http_client
import json
import os
import socket
import ssl
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch
from peer.peer_fixture import PeerFixture, http


class TwoDaemons(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = PeerFixture(cls.addClassCleanup)
        cls.homes = [state['home'] for state in cls.fixture.peers]
        cls.discovery_port = cls.fixture.peers[0]['daemon'].cfg['mcast_port']
        cls.initial_static = list(cls.fixture.peers[0]['daemon'].cfg['static_peers'])

    def url(self, index, path):
        return self.fixture.url(index, path)

    def test_cors_preflight_for_extension_origin(self):
        req = urllib.request.Request(self.url(0, '/snapshot'), method='OPTIONS', headers={'Origin': 'chrome-extension://abc'})
        with urllib.request.urlopen(req, timeout=5) as r:
            self.assertEqual(r.status, 204)
            self.assertEqual(r.headers['Access-Control-Allow-Origin'], 'chrome-extension://abc')
            self.assertIn('PUT', r.headers['Access-Control-Allow-Methods'])

    def test_rejects_bad_snapshot(self):
        with self.assertRaises(urllib.error.HTTPError) as cm:
            http('PUT', self.url(0, '/snapshot'), b'{"nope":1}')
        self.assertEqual(cm.exception.code, 400)
        cm.exception.close()

    def test_snapshot_round_trip_between_peers(self):
        snap = {'version': 1, 'deviceId': 'dev_a', 'ts': 'T', 'notes': {'stickysites_sites_v1': {'example.com': {'key': 'example.com', 'body': 'hello', 'updatedAt': '2026-01-01T00:00:00Z'}}}, 'tombstones': {}, 'crypto': None}
        status, _, body = http('PUT', self.url(0, '/snapshot'), json.dumps(snap).encode())
        self.assertEqual(status, 200); self.assertTrue(json.loads(body)['ok'])
        # peer1 pulls peer0's snapshot over pinned TLS with bearer auth
        _, _, body = http('GET', self.url(1, '/peers/snapshots'))
        peers = json.loads(body)['peers']
        self.assertEqual(len(peers), 1)
        self.assertEqual(peers[0]['name'], 'peer0')
        self.assertEqual(peers[0]['snapshot']['notes']['stickysites_sites_v1']['example.com']['body'], 'hello')
        # second pull hits the ETag cache and still returns the snapshot
        _, _, body = http('GET', self.url(1, '/peers/snapshots'))
        self.assertEqual(json.loads(body)['peers'][0]['snapshot']['deviceId'], 'dev_a')
        # peer0 has no snapshot from peer1 yet → entry has no snapshot
        _, _, body = http('GET', self.url(0, '/peers/snapshots'))
        self.assertIsNone(json.loads(body)['peers'][0]['snapshot'])

    def test_config_round_trip_and_validation(self):
        _, _, body = http('GET', self.url(0, '/config'))
        cfg = json.loads(body)
        self.assertEqual(cfg['name'], 'peer0'); self.assertEqual(cfg['pairKey'], 'test-pair-key-123'); self.assertEqual(cfg['staticPeers'], self.initial_static)
        self.assertEqual(cfg['discoveryPort'], self.discovery_port); self.assertIsInstance(cfg['addrs'], list)
        # set static peers (comma-separated string accepted, whitespace/dupes dropped) — persists to peer.json
        normalized = ['127.0.0.2', '127.0.0.3:%d' % self.discovery_port]
        _, _, body = http('PUT', self.url(0, '/config'), json.dumps({'staticPeers': ', '.join(normalized + ['', '127.0.0.2'])}).encode())
        res = json.loads(body)
        self.assertTrue(res['ok']); self.assertEqual(res['changed'], ['staticPeers'])
        self.assertEqual(res['config']['staticPeers'], normalized)
        with open(os.path.join(self.homes[0], 'peer.json')) as stream: on_disk = json.load(stream)
        self.assertEqual(on_disk['static_peers'], normalized)
        st = json.loads(http('GET', self.url(0, '/status'))[2])
        self.assertEqual(st['staticPeers'], normalized)
        # invalid inputs are rejected and leave config untouched
        for bad in (b'{"pairKey": "short"}', b'{"staticPeers": ["not an ip !!"]}', b'{"staticPeers": ["127.0.0.4:99999"]}', b'[1,2]'):
            with self.assertRaises(urllib.error.HTTPError) as cm:
                http('PUT', self.url(0, '/config'), bad)
            self.assertEqual(cm.exception.code, 400); cm.exception.close()
        self.assertEqual(json.loads(http('GET', self.url(0, '/config'))[2])['pairKey'], 'test-pair-key-123')
        # clear again so other tests are unaffected
        http('PUT', self.url(0, '/config'), json.dumps({'staticPeers': self.initial_static}).encode())

    def test_connection_test_endpoint(self):
        # peer0 tests peer1 explicitly by address: tcp → tls → pairing all pass
        _, _, body = http('GET', self.url(0, '/test?peer=127.0.0.1:%d' % self.fixture.peers[1]['daemon'].cfg['lan_port']))
        res = json.loads(body)['results'][0]
        self.assertTrue(res['ok'], res)
        self.assertEqual([s['step'] for s in res['steps']], ['tcp', 'tls', 'pairing'])
        self.assertEqual(res['peerName'], 'peer1')
        # A dynamic bound socket that never listens fails definitively at the TCP step.
        closed = socket.socket(); self.addCleanup(closed.close); closed.bind(('127.0.0.1', 0))
        closed_port = closed.getsockname()[1]
        _, _, body = http('GET', self.url(0, '/test?peer=127.0.0.1:%d' % closed_port))
        res = json.loads(body)['results'][0]
        self.assertFalse(res['ok']); self.assertEqual(res['steps'][-1]['step'], 'tcp')
        # default (no ?peer): tests every announced peer
        _, _, body = http('GET', self.url(0, '/test'))
        self.assertTrue(any(r['ok'] for r in json.loads(body)['results']))

    def test_sync_folder_transport(self):
        # both daemons point at one shared folder; peer1 sees peer0's snapshot through it even with
        # LAN discovery ignored (peer ids differ, so no dedupe against live peers matters here)
        shared_dir = tempfile.TemporaryDirectory(prefix='ss-shared-'); shared = shared_dir.name
        try:
            for index in range(2):
                _, _, body = http('PUT', self.url(index, '/config'), json.dumps({'syncDir': shared}).encode())
                self.assertEqual(json.loads(body)['changed'], ['syncDir'])
            snap = {'version': 1, 'deviceId': 'dev_folder', 'ts': 'T', 'notes': {'stickysites_daily_v1': {'2026-01-01': {'key': '2026-01-01', 'body': 'via folder', 'updatedAt': '2026-01-01T00:00:00Z'}}}, 'tombstones': {}, 'crypto': None}
            http('PUT', self.url(0, '/snapshot'), json.dumps(snap).encode())
            files = [f for f in os.listdir(shared) if f.startswith('stickysites-peer-') and f.endswith('.json')]
            self.assertEqual(len(files), 1)
            with open(os.path.join(shared, files[0])) as stream: doc = json.load(stream)
            self.assertEqual(doc['name'], 'peer0'); self.assertIn('sig', doc); self.assertEqual(doc['snapshot']['deviceId'], 'dev_folder')
            _, _, body = http('GET', self.url(1, '/peers/snapshots'))
            peers = json.loads(body)['peers']
            # peer0 is also a live LAN peer here, so the entry is reported once: via LAN with alsoVia=folder,
            # or via folder if the LAN fetch failed — either way the folder content is what we wrote
            p0 = [p for p in peers if p['name'] == 'peer0']
            self.assertEqual(len(p0), 1)
            self.assertIn(p0[0].get('via') or p0[0].get('alsoVia'), ('folder',))
            self.assertEqual(p0[0]['snapshot']['notes']['stickysites_daily_v1']['2026-01-01']['body'], 'via folder')
            # a file signed with a different key is reported, not trusted
            bad = dict(doc); bad['id'] = 'peer_evil'; bad['sig'] = '0' * 64
            with open(os.path.join(shared, 'stickysites-peer-peer_evil.json'), 'w') as stream: json.dump(bad, stream)
            _, _, body = http('GET', self.url(1, '/peers/snapshots'))
            evil = [p for p in json.loads(body)['peers'] if p['id'] == 'peer_evil']
            self.assertEqual(len(evil), 1); self.assertIn('signature mismatch', evil[0]['error']); self.assertNotIn('snapshot', evil[0])
            # status/test expose folder health
            st = json.loads(http('GET', self.url(1, '/status'))[2])['folder']
            self.assertTrue(st['configured'] and st['exists'] and st['writable'])
            self.assertTrue(any(p['ok'] for p in st['peers']), st)
            # missing folder is rejected on PUT
            with self.assertRaises(urllib.error.HTTPError) as cm:
                http('PUT', self.url(1, '/config'), b'{"syncDir": "/nonexistent/ss-folder"}')
            self.assertEqual(cm.exception.code, 400); cm.exception.close()
        finally:
            for index in range(2): http('PUT', self.url(index, '/config'), b'{"syncDir": ""}')
            shared_dir.cleanup()

    def test_lan_endpoint_requires_bearer(self):
        ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
        conn = http_client.HTTPSConnection('127.0.0.1', self.fixture.peers[0]['daemon'].cfg['lan_port'], timeout=5, context=ctx)
        conn.request('GET', '/snapshot'); r = conn.getresponse(); r.read(); conn.close()
        self.assertEqual(r.status, 401)


class PeerRegressions(unittest.TestCase):
    def setUp(self):
        self.fixture = PeerFixture(self.addCleanup, discover=False)
        self.modules = [state['module'] for state in self.fixture.peers]
        self.daemons = [state['daemon'] for state in self.fixture.peers]
        self.daemon = self.daemons[0]
        self.module = self.modules[0]

    def snapshot(self, marker='old'):
        return json.dumps({'version': 1, 'notes': {}, 'deviceId': marker}).encode()

    def shared_folder(self):
        directory = tempfile.TemporaryDirectory(prefix='ss-shared-')
        self.addCleanup(directory.cleanup)
        self.daemon.update_config({'syncDir': directory.name})
        return directory.name

    def test_unknown_tls_certificate_receives_no_bearer(self):
        remote = self.fixture.peers[1]['servers'][1]
        original_handler = remote.RequestHandlerClass
        received = []
        class CaptureHandler(original_handler):
            def do_GET(handler):
                received.append(handler.headers.get('Authorization'))
                super().do_GET()
        remote.RequestHandlerClass = CaptureHandler
        result = self.daemon.test_peer('127.0.0.1:%d' % remote.server_port)
        self.assertFalse(result['ok'], result)
        self.assertEqual(result['steps'][-1]['step'], 'tls')
        self.assertFalse(result['steps'][-1]['ok'])
        self.assertEqual(received, [], 'an unannounced certificate must never receive a request with the bearer')

    def test_stalled_raw_tls_client_does_not_block_second_client(self):
        server = self.fixture.peers[0]['servers'][1]
        accepted = threading.Event()
        original_accept = server.get_request
        def accept():
            result = original_accept(); accepted.set(); return result
        with patch.object(server, 'get_request', side_effect=accept):
            raw = socket.create_connection(('127.0.0.1', server.server_port), timeout=1)
            try: self.assertTrue(accepted.wait(1), 'server did not accept the stalled client')
            except BaseException: raw.close(); raise
        try:
            context = ssl._create_unverified_context()
            conn = http_client.HTTPSConnection('127.0.0.1', server.server_port, timeout=0.7, context=context)
            try:
                conn.request('GET', '/hello', headers={'Authorization': 'Bearer ' + self.module.bearer(self.daemon.cfg['pair_key'])})
                response = conn.getresponse(); response.read()
                self.assertEqual(response.status, 200)
            finally: conn.close()
        finally: raw.close()

    def test_folder_array_is_reported_alongside_valid_peer(self):
        directory = self.shared_folder()
        snapshot = json.loads(self.snapshot())
        doc = {'v': 1, 'id': 'peer_valid', 'name': 'valid', 'ts': int(time.time()), 'snapshot': snapshot}
        doc['sig'] = self.daemon.folder_sig(doc['id'], doc['name'], doc['ts'], snapshot)
        for name, body in [('array', []), ('valid', doc)]:
            with open(os.path.join(directory, 'stickysites-peer-%s.json' % name), 'w') as stream: json.dump(body, stream)
        entries = self.daemon.folder_peers()
        self.assertEqual(len(entries), 2)
        self.assertTrue(any('error' in entry and 'array' in entry['id'] for entry in entries))
        self.assertTrue(any(entry.get('snapshot') == snapshot for entry in entries))
        status = json.loads(http('GET', self.fixture.url(0, '/status'))[2])
        self.assertEqual(len(status['folder']['peers']), 2)
        snapshots = json.loads(http('GET', self.fixture.url(0, '/peers/snapshots'))[2])
        self.assertTrue(any(entry.get('snapshot') == snapshot for entry in snapshots['peers']))

    def test_failed_config_validation_keeps_config_and_trust_state(self):
        daemon = self.daemon
        daemon.peers.seen('trusted', {'lastSeen': time.time()})
        daemon.cache['trusted'] = {'etag': 'old', 'snapshot': {}}
        daemon.folder_cache['file'] = {'doc': {}}
        before = copy.deepcopy((daemon.cfg, daemon.peers.live(), daemon.cache, daemon.folder_cache))
        with open(self.module.CONFIG) as stream: persisted = json.load(stream)
        with self.assertRaises(ValueError):
            daemon.update_config({'pairKey': 'replacement-key', 'staticPeers': {}})
        self.assertEqual((daemon.cfg, daemon.peers.live(), daemon.cache, daemon.folder_cache), before)
        with open(self.module.CONFIG) as stream: self.assertEqual(json.load(stream), persisted)

    def test_failed_config_persistence_keeps_live_config(self):
        before = copy.deepcopy(self.daemon.cfg)
        with patch.object(self.module, 'save_config', side_effect=OSError('synthetic disk failure')):
            with self.assertRaises(OSError): self.daemon.update_config({'name': 'replacement'})
            with self.assertRaises(urllib.error.HTTPError) as caught:
                http('PUT', self.fixture.url(0, '/config'), b'{"name":"replacement"}')
            self.assertEqual(caught.exception.code, 500); caught.exception.close()
        self.assertEqual(self.daemon.cfg, before)

    def test_key_rotation_republishes_unchanged_folder_snapshot(self):
        self.shared_folder()
        self.daemon.store.put(self.snapshot())
        self.assertEqual(self.daemon.write_folder_snapshot(), 'written')
        self.daemon.update_config({'pairKey': 'replacement-key'})
        self.assertEqual(self.daemon.write_folder_snapshot(), 'written')
        with open(self.daemon.own_folder_file()) as stream: doc = json.load(stream)
        self.assertEqual(doc['sig'], self.daemon.folder_sig(doc['id'], doc['name'], doc['ts'], doc['snapshot']))
        self.assertEqual(self.daemon.write_folder_snapshot(), 'unchanged')

    def test_concurrent_folder_publications_keep_file_and_etag_consistent(self):
        self.shared_folder()
        daemon = self.daemon
        daemon.store.put(self.snapshot('first'))
        intercepted = threading.Event(); second_started = threading.Event()
        real_replace = self.module.os.replace
        def replace(source, destination):
            if destination == daemon.own_folder_file() and not intercepted.is_set():
                intercepted.set()
                if not second_started.wait(2): raise RuntimeError('second writer never started')
                time.sleep(0.1)  # the unfixed second writer consumes the shared .tmp path
            return real_replace(source, destination)
        def second():
            second_started.set()
            return daemon.write_folder_snapshot()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            with patch.object(self.module.os, 'replace', side_effect=replace):
                first = pool.submit(daemon.write_folder_snapshot)
                self.assertTrue(intercepted.wait(2))
                daemon.store.put(self.snapshot('second'))
                later = pool.submit(second)
                first.result(timeout=3); later.result(timeout=3)
        with open(daemon.own_folder_file()) as stream: doc = json.load(stream)
        self.assertEqual(doc['snapshot']['deviceId'], 'second')
        self.assertEqual(daemon._folder_written_etag, daemon.store.get()[1])
        self.assertEqual(os.listdir(self.daemon.sync_dir()), [os.path.basename(daemon.own_folder_file())])

    def raw_put(self, path, headers, body=b''):
        port = self.daemon.cfg['loop_port']
        with socket.create_connection(('127.0.0.1', port), timeout=1) as connection:
            connection.settimeout(0.7)
            connection.sendall(('PUT %s HTTP/1.1\r\nHost: 127.0.0.1:%d\r\n%s\r\n\r\n' % (path, port, headers)).encode() + body)
            return connection.recv(4096)

    def test_invalid_content_lengths_return_promptly(self):
        for path in ('/config', '/snapshot'):
            for length in ('-1', 'garbage', '+2', '1.0'):
                with self.subTest(path=path, length=length):
                    started = time.monotonic()
                    response = self.raw_put(path, 'Content-Length: ' + length)
                    self.assertIn(b' 400 ', response.split(b'\r\n', 1)[0])
                    self.assertLess(time.monotonic() - started, 0.6)

    def test_request_length_is_required_unambiguous_and_bounded(self):
        for path, limit in (('/config', 16 * 1024), ('/snapshot', 64 * 1024 * 1024)):
            for headers, expected in (('', 411), ('Content-Length: 1\r\nContent-Length: 2', 400),
                                      ('Content-Length: 1\r\nTransfer-Encoding: chunked', 400),
                                      ('Content-Length: %d' % (limit + 1), 413)):
                with self.subTest(path=path, headers=headers):
                    response = self.raw_put(path, headers)
                    self.assertIn((' %d ' % expected).encode(), response.split(b'\r\n', 1)[0])

    def test_idle_tls_handshake_times_out(self):
        self.module.REQUEST_TIMEOUT = 0.2
        server = self.fixture.peers[0]['servers'][1]
        with socket.create_connection(('127.0.0.1', server.server_port), timeout=1) as connection:
            connection.settimeout(0.7)
            self.assertEqual(connection.recv(1), b'')

    def test_incomplete_request_body_times_out(self):
        self.module.REQUEST_TIMEOUT = 0.2
        response = self.raw_put('/snapshot', 'Content-Length: 100', b'{')
        self.assertIn(b' 408 ', response.split(b'\r\n', 1)[0])

    def test_failed_snapshot_persistence_keeps_previous_memory_and_disk(self):
        store = self.daemon.store
        store.put(self.snapshot())
        before = store.get()
        with patch.object(self.module.os, 'replace', side_effect=OSError('synthetic disk failure')):
            with self.assertRaises(OSError): store.put(self.snapshot('new'))
            with self.assertRaises(urllib.error.HTTPError) as caught:
                http('PUT', self.fixture.url(0, '/snapshot'), self.snapshot('new'))
            self.assertEqual(caught.exception.code, 500); caught.exception.close()
        self.assertEqual(store.get(), before)
        with open(self.module.SNAPSHOT, 'rb') as stream: self.assertEqual(stream.read(), before[0])

    def test_fetch_peer_closes_failed_connections(self):
        from unittest.mock import MagicMock
        peer = {'id': 'remote', 'name': 'remote', 'addr': '127.0.0.1', 'port': self.daemons[1].cfg['lan_port'], 'fp': hashlib.sha256(b'cert').hexdigest()}
        for failure in ('connect', 'request', 'getresponse', 'read'):
            with self.subTest(failure=failure):
                connection = MagicMock()
                connection.sock.getpeercert.return_value = b'cert'
                response = connection.getresponse.return_value
                response.status = 200; response.read.return_value = b'{}'
                target = response.read if failure == 'read' else getattr(connection, failure)
                target.side_effect = OSError('synthetic transport failure')
                with patch.object(self.module.http.client, 'HTTPSConnection', return_value=connection):
                    with self.assertRaises((OSError, RuntimeError)): self.daemon.fetch_peer(dict(peer))
                connection.close.assert_called_once()

    def test_loopback_rejects_browser_origins_and_rebound_host(self):
        url = self.fixture.url(0, '/test?peer=127.0.0.1:%d' % self.daemons[1].cfg['lan_port'])
        with patch.object(self.daemon, 'test_peer', return_value={'ok': False}) as diagnostic:
            for origin in ('https://example.com', 'null', 'chrome-extension://abc/extra'):
                with self.subTest(origin=origin):
                    with self.assertRaises(urllib.error.HTTPError) as caught: http('GET', url, origin=origin)
                    self.assertEqual(caught.exception.code, 403); caught.exception.close()
            diagnostic.assert_not_called()
        connection = http_client.HTTPConnection('127.0.0.1', self.daemon.cfg['loop_port'], timeout=1)
        try:
            connection.request('GET', '/config', headers={'Host': 'rebound.invalid'})
            response = connection.getresponse(); response.read()
            self.assertEqual(response.status, 403)
        finally: connection.close()
        connection = http_client.HTTPConnection('127.0.0.1', self.daemon.cfg['loop_port'], timeout=1)
        try:
            connection.request('GET', '/config', headers={'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'no-cors'})
            response = connection.getresponse(); response.read()
            self.assertEqual(response.status, 403)
        finally: connection.close()
        self.assertEqual(http('GET', self.fixture.url(0, '/status'), origin=None)[0], 200)


class DaemonBoundaryRegressions(unittest.TestCase):
    def setUp(self):
        self.fixture = PeerFixture(self.addCleanup, discover=False)
        self.daemon = self.fixture.peers[0]['daemon']
        self.module = self.fixture.peers[0]['module']
        self.remote = self.fixture.peers[1]

    @staticmethod
    def nested_json():
        return b'[' * 1500 + b'0' + b']' * 1500

    def folder(self):
        directory = tempfile.TemporaryDirectory(prefix='ss-boundary-')
        self.addCleanup(directory.cleanup)
        self.daemon.update_config({'syncDir': directory.name})
        return directory.name

    def folder_doc(self, directory, pid='valid', snapshot=None):
        if snapshot is None: snapshot = {'version': 1, 'notes': {}, 'deviceId': 'valid'}
        doc = {'v': 1, 'id': pid, 'name': pid, 'ts': int(time.time()), 'snapshot': snapshot}
        doc['sig'] = self.daemon.folder_sig(pid, pid, doc['ts'], snapshot)
        path = os.path.join(directory, 'stickysites-peer-%s.json' % pid)
        with open(path, 'w') as stream: json.dump(doc, stream)
        return path

    def peer(self):
        remote = self.remote['daemon']
        return {'id': remote.cfg['id'], 'name': remote.cfg['name'], 'addr': '127.0.0.1',
                'addrs': ['127.0.0.1'], 'port': remote.cfg['lan_port'], 'fp': remote.fp, 'lastSeen': time.time()}

    def test_nested_udp_json_does_not_stop_signed_discovery(self):
        remote = self.remote['daemon']
        msg = {'v': 1, 'id': remote.cfg['id'], 'name': 'valid-after-deep-json', 'port': remote.cfg['lan_port'],
               'fp': remote.fp, 'ts': int(time.time()), 'addrs': ['127.0.0.1']}
        msg['sig'] = self.module.sign(self.daemon.cfg['pair_key'], msg['id'], msg['name'], msg['port'], msg['fp'], msg['ts'], ','.join(msg['addrs']))
        self.assertLessEqual(len(self.nested_json()), 4096)
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sender:
            destination = ('127.0.0.1', self.daemon.cfg['mcast_port'])
            sender.sendto(self.nested_json(), destination)
            sender.sendto(json.dumps(msg).encode(), destination)
        deadline = time.monotonic() + 1
        while remote.cfg['id'] not in self.daemon.peers.live() and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertIn(remote.cfg['id'], self.daemon.peers.live(), self.fixture.errors)
        self.assertEqual(self.fixture.errors, [])

    def test_nested_datagram_with_injected_socket_keeps_listener_alive(self):
        from unittest.mock import MagicMock
        remote = self.remote['daemon']
        msg = {'v': 1, 'id': remote.cfg['id'], 'name': 'valid-after-deep-json', 'port': remote.cfg['lan_port'],
               'fp': remote.fp, 'ts': int(time.time()), 'addrs': ['127.0.0.1']}
        msg['sig'] = self.module.sign(self.daemon.cfg['pair_key'], msg['id'], msg['name'], msg['port'], msg['fp'], msg['ts'], ','.join(msg['addrs']))
        datagram = MagicMock()
        source = ('127.0.0.1', self.daemon.cfg['mcast_port'])
        datagram.recvfrom.side_effect = [(self.nested_json(), source), (json.dumps(msg).encode(), source), OSError('synthetic end of datagrams')]
        with patch.object(self.module.socket, 'socket', return_value=datagram):
            self.daemon.listen_loop('127.0.0.1')
        self.assertIn(remote.cfg['id'], self.daemon.peers.live())
        datagram.close.assert_called_once()

    def test_nested_http_json_returns_bad_request_and_retains_state(self):
        before = dict(self.daemon.cfg)
        for path in ('/config', '/snapshot'):
            with self.subTest(path=path):
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    http('PUT', self.fixture.url(0, path), self.nested_json())
                self.assertEqual(caught.exception.code, 400); caught.exception.close()
        self.assertEqual(self.daemon.cfg, before)
        self.assertEqual(http('GET', self.fixture.url(0, '/status'))[0], 200)

    def test_nested_folder_json_is_reported_without_losing_valid_peer(self):
        directory = self.folder()
        self.folder_doc(directory)
        with open(os.path.join(directory, 'stickysites-peer-deep.json'), 'wb') as stream: stream.write(self.nested_json())
        entries = self.daemon.folder_peers()
        self.assertTrue(any(entry.get('snapshot', {}).get('deviceId') == 'valid' for entry in entries))
        self.assertTrue(any('deep' in entry['id'] and 'error' in entry for entry in entries))
        self.assertEqual(http('GET', self.fixture.url(0, '/status'))[0], 200)

    def test_folder_fifo_directory_and_symlink_are_bounded_errors(self):
        directory = self.folder()
        regular = self.folder_doc(directory)
        fifo = os.path.join(directory, 'stickysites-peer-00fifo.json'); os.mkfifo(fifo)
        os.mkdir(os.path.join(directory, 'stickysites-peer-directory.json'))
        os.symlink(regular, os.path.join(directory, 'stickysites-peer-link.json'))
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            result = pool.submit(self.daemon.folder_peers)
            blocked = False
            try:
                try: entries = result.result(timeout=0.5)
                except concurrent.futures.TimeoutError: blocked = True
            finally:
                if not result.done():
                    # Release the unfixed FIFO reader so a red test cannot orphan a blocked worker.
                    descriptor = os.open(fifo, os.O_WRONLY | os.O_NONBLOCK)
                    os.close(descriptor)
                    result.result(timeout=2)
            self.assertFalse(blocked, 'folder_peers blocked opening an unauthenticated FIFO')
        self.assertEqual(sum('snapshot' in entry for entry in entries), 1)
        self.assertEqual(sum('error' in entry for entry in entries), 3)
        for path in ('/status', '/peers/snapshots'):
            self.assertEqual(http('GET', self.fixture.url(0, path))[0], 200)

    def test_folder_size_limit_rejects_oversized_signed_file_and_keeps_valid_cache(self):
        directory = self.folder()
        regular = self.folder_doc(directory)
        self.folder_doc(directory, 'oversized', {'version': 1, 'notes': {}, 'body': 'x' * 2048})
        with patch.object(self.module, 'MAX_FOLDER_BYTES', 1024, create=True):
            entries = self.daemon.folder_peers()
            self.assertEqual(sum('snapshot' in entry for entry in entries), 1)
            oversized = next(entry for entry in entries if 'oversized' in entry['id'])
            self.assertIn('too large', oversized['error'])
            # Replacing a previously cached regular file with a directory must not reuse it.
            os.unlink(regular); os.mkdir(regular)
            self.assertTrue(all('snapshot' not in entry for entry in self.daemon.folder_peers()))

    def test_pair_rotation_rejects_inflight_200_304_and_folder_aggregation(self):
        daemon = self.daemon
        directory = self.folder()
        remote = self.remote['daemon']
        body = json.dumps({'version': 1, 'notes': {}, 'deviceId': 'revoked-snapshot'}).encode()
        remote.store.put(body)
        server = self.remote['servers'][1]
        original = server.RequestHandlerClass
        for aggregate in (False, True):
            for cached_response in (False, True):
                with self.subTest(aggregate=aggregate, cached=cached_response):
                    daemon.update_config({'pairKey': 'test-pair-key-123'})
                    peer = self.peer(); daemon.peers.seen(peer['id'], dict(peer))
                    if cached_response: daemon.cache[peer['id']] = {'etag': remote.store.get()[1], 'snapshot': json.loads(body)}
                    self.folder_doc(directory, peer['id'], json.loads(body))
                    arrived = threading.Event(); release = threading.Event(); auth = []
                    class PausedHandler(original):
                        def do_GET(handler):
                            auth.append(handler.headers.get('Authorization'))
                            arrived.set()
                            if not release.wait(3): return handler.send_error(503)
                            super().do_GET()
                    server.RequestHandlerClass = PausedHandler
                    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                        operation = daemon.peers_snapshots if aggregate else lambda: daemon.fetch_peer(dict(peer))
                        future = pool.submit(operation)
                        try:
                            self.assertTrue(arrived.wait(2))
                            # Rotation must finish while the old-key network response remains paused.
                            pool.submit(daemon.update_config, {'pairKey': 'replacement-key'}).result(timeout=1)
                        finally: release.set()
                        try: result = future.result(timeout=3)
                        except RuntimeError as error: result = error
                    self.assertEqual(daemon.cache, {}, 'revoked request repopulated the cache')
                    self.assertEqual(daemon.peers.live(), {})
                    self.assertEqual(auth, ['Bearer ' + self.module.bearer('test-pair-key-123')])
                    if aggregate: self.assertEqual(result, [])
                    else: self.assertIsInstance(result, RuntimeError)
                    self.assertEqual(daemon.folder_cache, {})
        server.RequestHandlerClass = original

    def test_pair_rotation_during_connect_cannot_reinsert_peer_or_send_new_bearer(self):
        daemon = self.daemon; peer = self.peer()
        peer['addr'] = '127.0.0.2'  # successful fallback would previously reinsert this peer
        daemon.peers.seen(peer['id'], dict(peer))
        arrived = threading.Event(); release = threading.Event(); received = []
        original_connection = http_client.HTTPSConnection
        server = self.remote['servers'][1]; original_handler = server.RequestHandlerClass
        class CaptureHandler(original_handler):
            def do_GET(handler):
                received.append(handler.headers.get('Authorization'))
                super().do_GET()
        server.RequestHandlerClass = CaptureHandler
        original_connect = original_connection.connect
        def paused_connect(connection):
            original_connect(connection)
            arrived.set()
            if not release.wait(3): raise RuntimeError('synthetic connection gate timeout')
        with patch.object(original_connection, 'connect', paused_connect):
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                future = pool.submit(daemon.fetch_peer, peer)
                try:
                    self.assertTrue(arrived.wait(2))
                    pool.submit(daemon.update_config, {'pairKey': 'replacement-key'}).result(timeout=1)
                finally: release.set()
                try: result = future.result(timeout=3)
                except RuntimeError as error: result = error
        self.assertEqual(daemon.peers.live(), {}, 'revoked fallback peer was reinserted')
        self.assertEqual(daemon.cache, {})
        self.assertEqual(received, [], 'a revoked connection must not receive the replacement bearer')
        self.assertIsInstance(result, RuntimeError)
        server.RequestHandlerClass = original_handler


class FixtureLifecycle(unittest.TestCase):
    def test_second_initialization_failure_closes_every_acquired_resource(self):
        from peer import peer_fixture
        callbacks = []
        real_spec = peer_fixture.importlib.util.spec_from_file_location
        calls = []
        def failing_spec(*args, **kwargs):
            spec = real_spec(*args, **kwargs)
            real_execute = spec.loader.exec_module
            def execute(module):
                real_execute(module)
                calls.append(module)
                if len(calls) == 2:
                    module.ensure_cert = lambda: (_ for _ in ()).throw(RuntimeError('synthetic second initialization failure'))
            spec.loader.exec_module = execute
            return spec
        try:
            with patch.object(peer_fixture.importlib.util, 'spec_from_file_location', side_effect=failing_spec):
                with self.assertRaisesRegex(RuntimeError, 'synthetic second initialization failure'):
                    PeerFixture(callbacks.append)
        finally:
            for callback in reversed(callbacks): callback()
        fixture = callbacks[0].__self__
        self.assertEqual(len(fixture.peers), 2)
        for state in fixture.peers:
            self.assertFalse(os.path.exists(state['home']))
            self.assertTrue(all(not thread.is_alive() for thread in state['threads']))
            self.assertTrue(all(server.fileno() == -1 for server in state['servers']))

    def test_cleanup_failure_does_not_skip_other_sockets_or_threads(self):
        from unittest.mock import MagicMock
        first, second = MagicMock(), MagicMock()
        threads = [MagicMock(ident=1), MagicMock(ident=2)]
        for thread in threads: thread.is_alive.side_effect = [True, False]
        first.shutdown.side_effect = RuntimeError('synthetic shutdown failure')
        first.server_close.side_effect = RuntimeError('synthetic close failure')
        threads[0].join.side_effect = RuntimeError('synthetic join failure')
        state = {'daemon': MagicMock(), 'servers': [first, second], 'threads': threads,
                 'server_threads': {first: threads[0], second: threads[1]}}
        with self.assertRaisesRegex(RuntimeError, 'synthetic'):
            PeerFixture._close_peer(state)
        first.server_close.assert_called_once()
        second.shutdown.assert_called_once(); second.server_close.assert_called_once()
        for thread in threads: thread.join.assert_called_once_with(timeout=3)

    def test_simultaneous_fixtures_discover_only_their_own_peers(self):
        first = PeerFixture(self.addCleanup)
        second = PeerFixture(self.addCleanup)
        all_ids = {state['daemon'].cfg['id'] for fixture in (first, second) for state in fixture.peers}
        self.assertEqual(len(all_ids), 4)
        for fixture in (first, second):
            for index, state in enumerate(fixture.peers):
                expected = fixture.peers[1 - index]['daemon'].cfg['id']
                self.assertEqual(list(state['daemon'].peers.live()), [expected])


if __name__ == '__main__':
    unittest.main()
