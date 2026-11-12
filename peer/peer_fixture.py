"""Synthetic actual-daemon fixture: temporary state and loopback-only dynamic sockets."""
import importlib.util
import atexit
import json
import os
import shutil
import socket
import tempfile
import threading
import time
import urllib.request
import functools
import signal
import subprocess
import sys
from contextlib import ExitStack
from unittest.mock import patch

SCRIPT = os.environ.get('STICKYSITES_TEST_DAEMON_SOURCE', os.path.join(os.path.dirname(__file__), 'stickysites-peer.py'))
PAIR_KEY = 'test-pair-key-123'
_reserved_tcp = None


def _load_reserved_tcp():
    global _reserved_tcp
    if _reserved_tcp is None:
        listeners = []
        try:
            for descriptor in json.loads(os.environ['STICKYSITES_TEST_TCP_LISTENERS']):
                listener = socket.socket(fileno=descriptor)
                listeners.append(listener)
                atexit.register(listener.close)
                if (listener.family != socket.AF_INET or listener.getsockname()[0] != '127.0.0.1'
                        or listener.getsockopt(socket.SOL_SOCKET, socket.SO_TYPE) != socket.SOCK_STREAM):
                    raise RuntimeError('inherited test descriptor is not an owned loopback TCP listener')
                listener.listen()  # validates listener state; SO_ACCEPTCONN is unavailable on macOS
                listener.set_inheritable(False)
        except BaseException:
            for listener in listeners: listener.close()
            raise
        _reserved_tcp = listeners
    return _reserved_tcp


def _reserved_server_type(server_type):
    """Adopt exact test-owned listeners supplied by an optional process-tree guard launcher."""
    if 'STICKYSITES_TEST_TCP_LISTENERS' not in os.environ: return server_type
    listeners = _load_reserved_tcp()
    def make_server(address, handler, **options):
        if not listeners: raise RuntimeError('guarded fixture TCP listener pool exhausted')
        listener = listeners.pop(0)
        try:
            server = server_type(address, handler, bind_and_activate=False, **options)
            server.socket.close()
            server.socket = listener
            server.server_address = listener.getsockname()
            server.server_name = 'localhost'; server.server_port = server.server_address[1]
            return server
        except BaseException:
            listener.close()
            raise
    return make_server


def run_supervised(command, timeout=20, **options):
    """Kill and reap this exact child process group if a test deadlocks."""
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True, **options)
    try:
        stdout, stderr = process.communicate(timeout=timeout)
        return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
    except BaseException as error:
        try: os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError: pass
        process.communicate()
        if isinstance(error, subprocess.TimeoutExpired): error.pid = process.pid
        raise


def needs_supervision(test):
    method = getattr(type(test), test._testMethodName)
    return getattr(method, '_supervised', False) and os.environ.get('STICKYSITES_SUPERVISED_TEST') != test.id()


def supervised_test(method):
    @functools.wraps(method)
    def wrapper(test):
        if not needs_supervision(test): return method(test)
        env = dict(os.environ, STICKYSITES_SUPERVISED_TEST=test.id(), STICKYSITES_TEST_DAEMON_SOURCE=SCRIPT)
        selected = []
        try:
            if 'STICKYSITES_TEST_TCP_LISTENERS' in env:
                pool = _load_reserved_tcp()
                if len(pool) < 4: raise RuntimeError('guarded fixture listener pool exhausted before supervised test')
                selected = [pool.pop(0) for _ in range(4)]
                env['STICKYSITES_TEST_TCP_LISTENERS'] = json.dumps([listener.fileno() for listener in selected])
            result = run_supervised([sys.executable, '-m', 'unittest', test.id()], env=env, pass_fds=tuple(listener.fileno() for listener in selected))
            test.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        finally:
            for listener in selected: listener.close()
    wrapper._supervised = True
    return wrapper


def http(method, url, body=None, origin='chrome-extension://abc'):
    headers = {'Content-Type': 'application/json'}
    if origin is not None: headers['Origin'] = origin
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=5) as response:
        return response.status, dict(response.headers), response.read()


class PeerFixture:
    """Exercise production discovery, request handlers, snapshot store, and TLS transport."""
    def __init__(self, register_cleanup, count=2, discover=True):
        self.stack = ExitStack()
        register_cleanup(self.close)  # setup failures run the same cleanup as success
        disable_udp = os.environ.get('STICKYSITES_TEST_DISABLE_UDP') == '1'
        if disable_udp and discover:
            raise RuntimeError('UDP discovery is disabled for this guarded run; use isolated CI for discovery tests')
        if shutil.which('openssl') is None:
            raise RuntimeError('openssl is required for the peer integration tests')
        self.peers = []
        self.errors = []
        for index in range(count):
            home = self.stack.enter_context(tempfile.TemporaryDirectory(prefix='ss-peer-'))
            state = {'home': home, 'threads': [], 'servers': [], 'server_threads': {}}
            self.peers.append(state)
            self.stack.callback(self._close_peer, state)
            spec = importlib.util.spec_from_file_location('ss_peer_fixture_%s_%d' % (id(self), index), SCRIPT)
            module = importlib.util.module_from_spec(spec)
            with patch.dict(os.environ, {'STICKYSITES_HOME': home}):
                spec.loader.exec_module(module)
            state['module'] = module
            module.PeerHTTPServer = _reserved_server_type(module.PeerHTTPServer)
            # Keep the real signed announce/listen loops. Only discovery destinations and the
            # interface inventory change: no LAN permission, broadcast, or real peer is involved.
            module.MCAST_GROUP = '127.0.0.1'
            module._iface_table = lambda: [('127.0.0.1', False, None)]
            module.ANNOUNCE_EVERY = 0.1
            cfg = module.ensure_config(PAIR_KEY, 'peer%d' % index)
            cfg.update(loop_port=0, lan_port=0, mcast_port=0)
            module.save_config(cfg)
            module.ensure_cert()
            daemon = state['daemon'] = module.Daemon(cfg)
            servers = module.make_servers(daemon, lan_host='127.0.0.1')
            state['servers'].extend(servers)
            cfg['loop_port'], cfg['lan_port'] = [server.server_port for server in servers]
            for server in servers:
                state['server_threads'][server] = self._start(state, lambda s=server: s.serve_forever(poll_interval=0.05))
            if not disable_udp:
                ready = threading.Event()
                self._start(state, lambda d=daemon, r=ready: d.listen_loop('127.0.0.1', r))
                if not ready.wait(3):
                    raise RuntimeError('discovery listener did not start: %s' % self.diagnostics())
        for index, state in enumerate(self.peers):
            state['daemon'].cfg['static_peers'] = [
                '127.0.0.1:%d' % other['daemon'].cfg['mcast_port']
                for other_index, other in enumerate(self.peers) if other_index != index
            ] if discover else []
            state['module'].save_config(state['daemon'].cfg)
        if discover:
            for state in self.peers: self._start(state, state['daemon'].announce_loop)
            self.wait_discovery()

    def _start(self, state, target):
        def guarded():
            try: target()
            except BaseException as error:
                self.errors.append('%s: %r' % (getattr(target, '__name__', 'thread'), error))
        thread = threading.Thread(target=guarded, daemon=True)
        state['threads'].append(thread)
        thread.start()
        return thread

    @staticmethod
    def _close_peer(state):
        if 'daemon' in state: state['daemon'].stop.set()
        errors = []
        for server in state['servers']:
            try:
                thread = state['server_threads'].get(server)
                if thread is not None and thread.is_alive(): server.shutdown()
            except Exception as error: errors.append(str(error))
            try: server.server_close()
            except Exception as error: errors.append(str(error))
        for thread in state['threads']:
            try:
                if thread.ident is not None: thread.join(timeout=3)
            except Exception as error: errors.append(str(error))
            if thread.is_alive(): errors.append('peer fixture thread failed to stop: %s' % thread.name)
        if errors: raise RuntimeError('; '.join(errors))

    def close(self):
        self.stack.close()

    def diagnostics(self):
        lines = list(self.errors)
        for state in self.peers:
            try:
                with open(os.path.join(state['home'], 'peer.log')) as stream:
                    lines.extend(stream.read()[-2000:].splitlines())
            except OSError: pass
        return '\n'.join(lines)[-6000:]

    def url(self, index, path):
        return 'http://127.0.0.1:%d%s' % (self.peers[index]['daemon'].cfg['loop_port'], path)

    def wait_discovery(self):
        deadline = time.monotonic() + 5
        last = None
        while time.monotonic() < deadline:
            try:
                views = [json.loads(http('GET', self.url(i, '/status'))[2])['peers'] for i in range(len(self.peers))]
                if all(len(peers) == len(self.peers) - 1 for peers in views): return
            except Exception as error: last = repr(error)
            if self.errors: break
            time.sleep(0.05)
        raise RuntimeError('peers never discovered each other: %s\n%s' % (last, self.diagnostics()))
