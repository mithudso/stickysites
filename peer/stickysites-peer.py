#!/usr/bin/env python3
"""StickySites local peer daemon — keeps browsers on the same LAN in sync with no server.

Stdlib only (Python 3.9+). Three sockets:
  * loopback HTTP  127.0.0.1:47831   the extension pushes its snapshot and pulls peers' snapshots
  * LAN HTTPS      0.0.0.0:47832     peers fetch this machine's snapshot (bearer auth + pinned cert)
  * UDP multicast  239.255.77.31:47833  announce/discover peers; announcements are HMAC-signed
                                        with the shared pairing key so strangers are ignored

State lives in ~/.stickysites/ (config, self-signed cert, latest snapshot).

  stickysites-peer.py install [--pair-key KEY] [--name NAME]   create config+cert, register launchd job
  stickysites-peer.py uninstall                                 unload the launchd job
  stickysites-peer.py run                                       run in the foreground
  stickysites-peer.py status                                    ask the running daemon for peers
  stickysites-peer.py pair [KEY]                                show or set the pairing key
  stickysites-peer.py init                                      config+cert only (no launchd; used by tests)
"""
import argparse, hashlib, hmac, http.client, json, os, secrets, socket, ssl, struct, subprocess, sys, threading, time, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = '1.0.0'
HOME = os.path.expanduser(os.environ.get('STICKYSITES_HOME', '~/.stickysites'))
CONFIG = os.path.join(HOME, 'peer.json')
CERT = os.path.join(HOME, 'peer-cert.pem')
KEY = os.path.join(HOME, 'peer-key.pem')
SNAPSHOT = os.path.join(HOME, 'snapshot.json')
LOG = os.path.join(HOME, 'peer.log')
MCAST_GROUP = '239.255.77.31'
ANNOUNCE_EVERY = 5
PEER_TTL = 20
LAUNCHD_LABEL = 'com.stickysites.peer'

def log(msg):
    line = time.strftime('%Y-%m-%d %H:%M:%S ') + msg
    # Under launchd stdout is already redirected into LOG, so only echo to a terminal.
    if sys.stdout.isatty(): print(line, flush=True)
    try:
        with open(LOG, 'a') as f: f.write(line + '\n')
    except OSError: pass

# ── config ───────────────────────────────────────────────────────────────────
def load_config():
    with open(CONFIG) as f: return json.load(f)

def save_config(cfg):
    os.makedirs(HOME, exist_ok=True)
    tmp = CONFIG + '.tmp'
    with open(tmp, 'w') as f: json.dump(cfg, f, indent=2)
    os.chmod(tmp, 0o600); os.replace(tmp, CONFIG)

def ensure_config(pair_key=None, name=None, loop_port=None, lan_port=None, mcast_port=None):
    cfg = load_config() if os.path.exists(CONFIG) else {}
    cfg.setdefault('id', 'peer_' + secrets.token_hex(6))
    cfg.setdefault('name', socket.gethostname().split('.')[0])
    cfg.setdefault('pair_key', secrets.token_urlsafe(24))
    cfg.setdefault('loop_port', 47831); cfg.setdefault('lan_port', 47832); cfg.setdefault('mcast_port', 47833)
    if pair_key: cfg['pair_key'] = pair_key
    if name: cfg['name'] = name
    if loop_port: cfg['loop_port'] = int(loop_port)
    if lan_port: cfg['lan_port'] = int(lan_port)
    if mcast_port: cfg['mcast_port'] = int(mcast_port)
    save_config(cfg)
    return cfg

def ensure_cert():
    if os.path.exists(CERT) and os.path.exists(KEY): return
    os.makedirs(HOME, exist_ok=True)
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650',
                    '-subj', '/CN=stickysites-peer', '-keyout', KEY, '-out', CERT],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.chmod(KEY, 0o600)

def cert_fingerprint():
    der = ssl.PEM_cert_to_DER_cert(open(CERT).read())
    return hashlib.sha256(der).hexdigest()

def sign(pair_key, *parts):
    return hmac.new(pair_key.encode(), '|'.join(str(p) for p in parts).encode(), hashlib.sha256).hexdigest()

def bearer(pair_key):
    return sign(pair_key, 'auth')

def default_route_ip():
    """IPv4 of the interface that carries the default route (no packet is sent)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('10.255.255.255', 1)); ip = s.getsockname()[0]; s.close(); return ip
    except OSError: return None

def interface_ipv4s():
    return [ip for ip, _brd in interfaces()]

def interfaces():
    """(ip, broadcast) of real LAN interfaces (skips loopback and tunnels such as utun/tun/tap/wg).
    Parses `ifconfig` (macOS/BSD) or `ip -o -4 addr` (Linux); stdlib has no portable API for this."""
    out = []
    skip = ('lo', 'utun', 'tun', 'tap', 'wg', 'ppp', 'ipsec', 'gif', 'stf', 'awdl', 'llw', 'docker', 'br-', 'vboxnet', 'vmnet')
    try:
        if sys.platform == 'darwin' or 'bsd' in sys.platform:
            text = subprocess.run(['ifconfig'], capture_output=True, text=True, timeout=5).stdout
            iface = ''
            for line in text.splitlines():
                if line and not line[0].isspace(): iface = line.split(':', 1)[0]
                elif line.strip().startswith('inet ') and not iface.startswith(skip):
                    parts = line.split()
                    ip = parts[1]
                    brd = parts[parts.index('broadcast') + 1] if 'broadcast' in parts else None
                    if ' --> ' not in line and not ip.startswith('127.') and ip not in [o[0] for o in out]: out.append((ip, brd))
        else:
            text = subprocess.run(['ip', '-o', '-4', 'addr'], capture_output=True, text=True, timeout=5).stdout
            for line in text.splitlines():
                parts = line.split()
                if len(parts) >= 4 and not parts[1].startswith(skip):
                    ip = parts[3].split('/')[0]
                    brd = parts[parts.index('brd') + 1] if 'brd' in parts else None
                    if not ip.startswith('127.') and ip not in [o[0] for o in out]: out.append((ip, brd))
    except (OSError, subprocess.SubprocessError): pass
    return out

def local_ipv4s():
    """Candidate addresses peers may reach us on: LAN interfaces first, then the default route,
    then hostname addresses. Tunnel addresses (VPN) are deliberately last-resort only."""
    out = interface_ipv4s()
    d = default_route_ip()
    if d and d not in out: out.append(d)
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in out and not ip.startswith('127.'): out.append(ip)
    except OSError: pass
    return out

# ── snapshot store ───────────────────────────────────────────────────────────
class SnapshotStore:
    def __init__(self):
        self.lock = threading.Lock(); self.body = b''; self.etag = ''
        if os.path.exists(SNAPSHOT):
            try:
                self.body = open(SNAPSHOT, 'rb').read(); self.etag = hashlib.sha256(self.body).hexdigest()
            except OSError: pass
    def put(self, body):
        with self.lock:
            self.body = body; self.etag = hashlib.sha256(body).hexdigest()
            tmp = SNAPSHOT + '.tmp'
            with open(tmp, 'wb') as f: f.write(body)
            os.chmod(tmp, 0o600); os.replace(tmp, SNAPSHOT)
    def get(self):
        with self.lock: return self.body, self.etag

# ── peers ────────────────────────────────────────────────────────────────────
class Peers:
    def __init__(self): self.lock = threading.Lock(); self.peers = {}
    def seen(self, pid, info):
        with self.lock: self.peers[pid] = info
    def live(self):
        now = time.time()
        with self.lock:
            return {k: v for k, v in self.peers.items() if now - v['lastSeen'] < PEER_TTL}

class Daemon:
    def __init__(self, cfg):
        self.cfg = cfg; self.store = SnapshotStore(); self.peers = Peers(); self.fp = cert_fingerprint()
        self.cache = {}  # peer id → {'etag','snapshot'}
        self.stop = threading.Event()

    # discovery
    def announce_loop(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 1)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_LOOP, 1)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        failing = set()
        while not self.stop.is_set():
            ts = int(time.time())
            addrs = local_ipv4s()
            msg = {'v': 1, 'id': self.cfg['id'], 'name': self.cfg['name'], 'port': self.cfg['lan_port'], 'fp': self.fp, 'ts': ts, 'addrs': addrs}
            msg['sig'] = sign(self.cfg['pair_key'], msg['id'], msg['name'], msg['port'], msg['fp'], ts, ','.join(addrs))
            data = json.dumps(msg).encode()
            # Announce on every LAN interface (a VPN default route would otherwise swallow the packet):
            # multicast to the group, plus the interface's subnet broadcast as a fallback for networks
            # that drop multicast. Listeners bind the port on all addresses, so either delivery works.
            sent = 0
            for iface, brd in (interfaces() or [(None, None)]):
                for target in ((MCAST_GROUP, self.cfg['mcast_port']),) + (((brd, self.cfg['mcast_port']),) if brd else ()):
                    key = (iface, target[0])
                    try:
                        if iface and target[0] == MCAST_GROUP: sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(iface))
                        sock.sendto(data, target); sent += 1
                        failing.discard(key)
                    except OSError as e:
                        if key not in failing: log('announce via %s to %s failed: %s' % (iface or 'default', target[0], e)); failing.add(key)
            if not sent and 'none' not in failing: log('announce failed on every interface'); failing.add('none')
            self.stop.wait(ANNOUNCE_EVERY)

    def listen_loop(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, 'SO_REUSEPORT'): sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        sock.bind(('', self.cfg['mcast_port']))
        # Join the group on every LAN interface (and the default); a failed join is not fatal because
        # peers also announce via subnet broadcast, which this socket receives regardless.
        joined = 0
        for iface in interface_ipv4s() + [None]:
            try:
                mreq = struct.pack('4s4s', socket.inet_aton(MCAST_GROUP), socket.inet_aton(iface) if iface else struct.pack('4s', b'\0\0\0\0'))
                sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq); joined += 1
            except OSError as e:
                log('multicast join via %s failed: %s (broadcast discovery still works)' % (iface or 'default', e))
        if not joined: log('no multicast membership; relying on subnet broadcast for discovery')
        sock.settimeout(1.0)
        while not self.stop.is_set():
            try: data, addr = sock.recvfrom(4096)
            except socket.timeout: continue
            except OSError: break
            try: msg = json.loads(data.decode())
            except ValueError: continue
            if not isinstance(msg, dict) or msg.get('v') != 1 or msg.get('id') == self.cfg['id']: continue
            try:
                addrs = [str(a) for a in msg.get('addrs', [])][:8]
                expected = sign(self.cfg['pair_key'], msg['id'], msg['name'], msg['port'], msg['fp'], msg['ts'], ','.join(addrs))
                if not hmac.compare_digest(expected, str(msg.get('sig', ''))): continue
                if abs(time.time() - int(msg['ts'])) > 90: continue
            except (KeyError, TypeError, ValueError): continue
            live = self.peers.live(); known = msg['id'] in live
            candidates = [addr[0]] + [a for a in addrs if a != addr[0]]
            prev = live.get(msg['id'], {}).get('addr')
            if prev in candidates: candidates.remove(prev); candidates.insert(0, prev)  # keep the address that worked
            self.peers.seen(msg['id'], {'id': msg['id'], 'name': str(msg['name'])[:64], 'addr': candidates[0], 'addrs': candidates, 'port': int(msg['port']), 'fp': str(msg['fp']), 'lastSeen': time.time()})
            if not known: log('peer up: %s (%s:%s)' % (msg['name'], addr[0], msg['port']))

    # fetch a peer's snapshot over pinned TLS, trying each announced address until one connects
    def fetch_peer(self, p):
        ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
        conn = None; last = None
        for addr in p.get('addrs') or [p['addr']]:
            try:
                c = http.client.HTTPSConnection(addr, p['port'], timeout=2.5, context=ctx); c.connect(); conn = c
                if addr != p['addr']:
                    p['addr'] = addr; p['addrs'] = [addr] + [a for a in p['addrs'] if a != addr]; self.peers.seen(p['id'], p)
                break
            except OSError as e: last = e
        if conn is None: raise RuntimeError('unreachable on %s (%s)' % (', '.join(p.get('addrs') or [p['addr']]), last))
        der = conn.sock.getpeercert(binary_form=True)
        if hashlib.sha256(der).hexdigest() != p['fp']:
            conn.close(); raise RuntimeError('certificate fingerprint mismatch for %s' % p['name'])
        headers = {'Authorization': 'Bearer ' + bearer(self.cfg['pair_key'])}
        cached = self.cache.get(p['id'])
        if cached: headers['If-None-Match'] = cached['etag']
        conn.request('GET', '/snapshot', headers=headers)
        r = conn.getresponse(); body = r.read(); conn.close()
        if r.status == 304 and cached: return cached['snapshot']
        if r.status == 204: return None
        if r.status != 200: raise RuntimeError('peer %s answered HTTP %s' % (p['name'], r.status))
        snap = json.loads(body.decode())
        self.cache[p['id']] = {'etag': r.getheader('ETag', ''), 'snapshot': snap}
        return snap

    def peers_snapshots(self):
        out = []
        for p in self.peers.live().values():
            try: snap = self.fetch_peer(p)
            except Exception as e:
                log('fetch from %s failed: %s' % (p['name'], e)); out.append({'id': p['id'], 'name': p['name'], 'error': str(e)}); continue
            out.append({'id': p['id'], 'name': p['name'], 'snapshot': snap})
        return out

    def status(self):
        return {'version': VERSION, 'id': self.cfg['id'], 'name': self.cfg['name'], 'lanPort': self.cfg['lan_port'],
                'hasSnapshot': bool(self.store.get()[0]),
                'peers': [{'id': p['id'], 'name': p['name'], 'addr': p['addr'], 'port': p['port'], 'lastSeen': int(time.time() - p['lastSeen'])} for p in self.peers.live().values()]}

def make_handlers(d):
    class LoopHandler(BaseHTTPRequestHandler):
        """Loopback API for the extension. CORS-open to chrome-extension:// origins only."""
        def log_message(self, *a): pass
        def _cors(self):
            origin = self.headers.get('Origin', '')
            if origin.startswith('chrome-extension://') or origin.startswith('moz-extension://'):
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'content-type')
            self.send_header('Access-Control-Max-Age', '600')
        def _json(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code); self._cors(); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
        def do_OPTIONS(self):
            self.send_response(204); self._cors(); self.end_headers()
        def do_GET(self):
            if self.path == '/status': return self._json(200, d.status())
            if self.path == '/peers/snapshots': return self._json(200, {'peers': d.peers_snapshots()})
            self._json(404, {'error': 'not found'})
        def do_PUT(self):
            if self.path != '/snapshot': return self._json(404, {'error': 'not found'})
            n = int(self.headers.get('Content-Length', '0'))
            if n > 64 * 1024 * 1024: return self._json(413, {'error': 'snapshot too large'})
            body = self.rfile.read(n)
            try:
                snap = json.loads(body.decode())
                if not isinstance(snap, dict) or snap.get('version') != 1 or 'notes' not in snap: raise ValueError('bad snapshot')
            except ValueError as e: return self._json(400, {'error': str(e)})
            d.store.put(body)
            self._json(200, {'ok': True, 'etag': d.store.get()[1]})

    class LanHandler(BaseHTTPRequestHandler):
        """LAN API for peers. Bearer token derived from the pairing key; TLS with a pinned cert."""
        def log_message(self, *a): pass
        def do_GET(self):
            auth = self.headers.get('Authorization', '')
            if not hmac.compare_digest(auth, 'Bearer ' + bearer(d.cfg['pair_key'])):
                self.send_response(401); self.end_headers(); return
            if self.path == '/hello':
                body = json.dumps({'id': d.cfg['id'], 'name': d.cfg['name'], 'version': VERSION}).encode()
                self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
            if self.path == '/snapshot':
                body, etag = d.store.get()
                if not body: self.send_response(204); self.end_headers(); return
                if self.headers.get('If-None-Match') == etag: self.send_response(304); self.end_headers(); return
                self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('ETag', etag); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
            self.send_response(404); self.end_headers()
    return LoopHandler, LanHandler

def run(cfg):
    ensure_cert()
    d = Daemon(cfg)
    LoopHandler, LanHandler = make_handlers(d)
    loop = ThreadingHTTPServer(('127.0.0.1', cfg['loop_port']), LoopHandler); loop.daemon_threads = True
    lan = ThreadingHTTPServer(('0.0.0.0', cfg['lan_port']), LanHandler); lan.daemon_threads = True
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(CERT, KEY)
    lan.socket = ctx.wrap_socket(lan.socket, server_side=True)
    for target in (d.announce_loop, d.listen_loop, loop.serve_forever, lan.serve_forever):
        threading.Thread(target=target, daemon=True).start()
    log('stickysites-peer %s "%s" up: loopback http://127.0.0.1:%d, lan https://0.0.0.0:%d, mcast %s:%d' % (VERSION, cfg['name'], cfg['loop_port'], cfg['lan_port'], MCAST_GROUP, cfg['mcast_port']))
    try:
        while True: time.sleep(3600)
    except KeyboardInterrupt:
        pass
    finally:
        d.stop.set(); loop.shutdown(); lan.shutdown()

# ── install ──────────────────────────────────────────────────────────────────
def launchd_plist(cfg):
    return '''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>%s</string>
  <key>ProgramArguments</key><array><string>%s</string><string>%s</string><string>run</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>%s</string>
  <key>StandardErrorPath</key><string>%s</string>
</dict></plist>
''' % (LAUNCHD_LABEL, sys.executable, os.path.abspath(__file__), LOG, LOG)

def cmd_install(a):
    cfg = ensure_config(a.pair_key, a.name); ensure_cert()
    if sys.platform == 'darwin' and not a.no_launchd:
        plist = os.path.expanduser('~/Library/LaunchAgents/%s.plist' % LAUNCHD_LABEL)
        os.makedirs(os.path.dirname(plist), exist_ok=True)
        subprocess.run(['launchctl', 'unload', plist], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        open(plist, 'w').write(launchd_plist(cfg))
        subprocess.run(['launchctl', 'load', plist], check=True)
        print('launchd job %s loaded (%s)' % (LAUNCHD_LABEL, plist))
    elif not a.no_launchd:
        print('Non-macOS: run `%s %s run` under your service manager (systemd unit example in peer/README.md).' % (sys.executable, os.path.abspath(__file__)))
    print('peer "%s" ready. Pairing key (use it on your other laptops):\n\n  %s\n' % (cfg['name'], cfg['pair_key']))
    print('On another laptop:  python3 peer/stickysites-peer.py install --pair-key %s' % cfg['pair_key'])

def cmd_uninstall(a):
    plist = os.path.expanduser('~/Library/LaunchAgents/%s.plist' % LAUNCHD_LABEL)
    if os.path.exists(plist):
        subprocess.run(['launchctl', 'unload', plist], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); os.remove(plist)
        print('launchd job removed')
    print('config, cert and snapshot left in %s (delete the folder to purge)' % HOME)

def cmd_status(a):
    cfg = load_config()
    try:
        with urllib.request.urlopen('http://127.0.0.1:%d/status' % cfg['loop_port'], timeout=3) as r: print(json.dumps(json.load(r), indent=2))
    except Exception as e:
        print('daemon not reachable on 127.0.0.1:%d (%s)' % (cfg['loop_port'], e)); sys.exit(1)

def cmd_pair(a):
    cfg = ensure_config(a.key)
    print(cfg['pair_key'] if not a.key else 'pairing key updated; restart the daemon (launchctl kickstart -k gui/$(id -u)/%s)' % LAUNCHD_LABEL)

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('install'); p.add_argument('--pair-key'); p.add_argument('--name'); p.add_argument('--no-launchd', action='store_true'); p.set_defaults(fn=cmd_install)
    p = sub.add_parser('init'); p.add_argument('--pair-key'); p.add_argument('--name'); p.add_argument('--loop-port'); p.add_argument('--lan-port'); p.add_argument('--mcast-port')
    p.set_defaults(fn=lambda a: (ensure_config(a.pair_key, a.name, a.loop_port, a.lan_port, a.mcast_port), ensure_cert(), print('initialised %s' % HOME)))
    sub.add_parser('uninstall').set_defaults(fn=cmd_uninstall)
    sub.add_parser('run').set_defaults(fn=lambda a: run(load_config() if os.path.exists(CONFIG) else ensure_config()))
    sub.add_parser('status').set_defaults(fn=cmd_status)
    p = sub.add_parser('pair'); p.add_argument('key', nargs='?'); p.set_defaults(fn=cmd_pair)
    a = ap.parse_args(argv); a.fn(a)

if __name__ == '__main__':
    main()
