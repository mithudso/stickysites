#!/usr/bin/env python3
"""StickySites local peer daemon — keeps browsers on the same LAN in sync with no server.

Stdlib only (Python 3.9+). Three sockets:
  * loopback HTTP  127.0.0.1:47831   the extension pushes its snapshot and pulls peers' snapshots
  * LAN HTTPS      0.0.0.0:47832     peers fetch this machine's snapshot (bearer auth + pinned cert)
  * UDP multicast  239.255.77.31:47833  announce/discover peers; announcements are HMAC-signed
                                        with the shared pairing key so strangers are ignored

State lives in ~/.stickysites/ (config, self-signed cert, latest snapshot).

  stickysites-peer.py install [--pair-key KEY] [--name NAME] [--peer IP ...] [--python PATH]   create config+cert, register launchd job
  stickysites-peer.py uninstall                                 unload the launchd job
  stickysites-peer.py run                                       run in the foreground
  stickysites-peer.py status                                    ask the running daemon for peers
  stickysites-peer.py pair [KEY]                                show or set the pairing key
  stickysites-peer.py init                                      config+cert only (no launchd; used by tests)
  stickysites-peer.py folder [DIR|--clear]                      show or set the sync folder (a shared/cloud folder;
                                                                each laptop drops its signed snapshot file there)

The pairing key and static peer list can also be set from the extension popup (Settings →
Local Peer Sync); the daemon applies them live and writes them back to peer.json.
"""
import argparse, errno, hashlib, hmac, http.client, json, os, secrets, socket, ssl, stat, subprocess, sys, tempfile, threading, time, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

VERSION = '1.2.0'
HOME = os.path.expanduser(os.environ.get('STICKYSITES_HOME', '~/.stickysites'))
CONFIG = os.path.join(HOME, 'peer.json')
CERT = os.path.join(HOME, 'peer-cert.pem')
KEY = os.path.join(HOME, 'peer-key.pem')
SNAPSHOT = os.path.join(HOME, 'snapshot.json')
LOG = os.path.join(HOME, 'peer.log')
MCAST_GROUP = '239.255.77.31'
ANNOUNCE_EVERY = 5
PEER_TTL = 20
IFACE_RESCAN = 60      # seconds between interface re-enumerations (VPN up/down, Wi-Fi switch)
LAUNCHD_LABEL = 'com.stickysites.peer'
REQUEST_TIMEOUT = 5  # bound TLS handshakes, HTTP headers, and request-body reads
# A 64 MiB UTF-8 snapshot can expand threefold when the folder writer escapes Unicode.
MAX_FOLDER_BYTES = 3 * 64 * 1024 * 1024 + 16 * 1024

def load_json(body):
    try: return json.loads(body)
    except RecursionError as e: raise ValueError('JSON is nested too deeply') from e

class ConfigurationChanged(RuntimeError):
    pass

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

def atomic_write(path, body):
    """Publish a complete private file, and remove its unique temporary file on failure."""
    fd, tmp = tempfile.mkstemp(prefix='.%s-' % os.path.basename(path), dir=os.path.dirname(path))
    try:
        with os.fdopen(fd, 'wb') as f: f.write(body)
        os.replace(tmp, path)
    finally:
        try: os.unlink(tmp)
        except FileNotFoundError: pass

def save_config(cfg):
    os.makedirs(HOME, exist_ok=True)
    atomic_write(CONFIG, json.dumps(cfg, indent=2).encode())

def ensure_config(pair_key=None, name=None, loop_port=None, lan_port=None, mcast_port=None, peers=None):
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
    if peers is not None: cfg['static_peers'] = [p for p in peers if p]
    cfg.setdefault('sync_dir', '')
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
    with open(CERT) as f: der = ssl.PEM_cert_to_DER_cert(f.read())
    return hashlib.sha256(der).hexdigest()

def sign(pair_key, *parts):
    return hmac.new(pair_key.encode(), '|'.join(str(p) for p in parts).encode(), hashlib.sha256).hexdigest()

def bearer(pair_key):
    return sign(pair_key, 'auth')

def split_host_port(s):
    """'192.168.1.20' → ('192.168.1.20', None); '192.168.1.20:47833' → ('192.168.1.20', 47833)."""
    if s.count(':') == 1:
        host, _, port = s.partition(':')
        if port.isdigit() and 0 < int(port) < 65536: return host, int(port)
    return s, None

def default_route_ip():
    """IPv4 of the interface that carries the default route (no packet is sent)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('10.255.255.255', 1)); ip = s.getsockname()[0]; s.close(); return ip
    except OSError: return None

def _is_private(ip):
    """RFC 1918 — the addresses a laptop on the same LAN can actually reach."""
    a = ip.split('.')
    return a[0] == '10' or (a[0] == '192' and a[1] == '168') or (a[0] == '172' and 16 <= int(a[1]) <= 31)

_IFACE_CACHE = {'at': 0.0, 'table': []}

def _iface_table():
    """[(ip, point_to_point, broadcast|None)] for every non-loopback IPv4 on this host, cached IFACE_RESCAN s.

    Uses `ip -4 -o addr` (Linux) or `ifconfig` (macOS/BSD); falls back to the hostname's addresses
    and the default-route IP. VPN tunnels (utun*, tun*) are point-to-point: their address is still
    advertised (a peer may only be reachable through one) but they are skipped for discovery, which
    on macOS the tunnel otherwise captures via the 224.0.0/4 route so LAN peers never see us.
    The subnet broadcast address feeds the fallback for networks/EDR agents that drop multicast."""
    now = time.time()
    if now - _IFACE_CACHE['at'] < IFACE_RESCAN: return list(_IFACE_CACHE['table'])
    table = []
    def add(ip, p2p=False, bcast=None):
        if not ip or ip.startswith('127.') or ip.startswith('169.254.') or ip.startswith('0.'): return
        if all(t[0] != ip for t in table): table.append((ip, p2p, bcast))
    try:
        if sys.platform.startswith('linux'):
            out = subprocess.run(['ip', '-4', '-o', 'addr', 'show', 'up'], capture_output=True, text=True, timeout=3).stdout
            for line in out.splitlines():
                parts = line.split()
                if 'inet' in parts:
                    add(parts[parts.index('inet') + 1].split('/')[0], 'peer' in parts, parts[parts.index('brd') + 1] if 'brd' in parts else None)
        else:
            out = subprocess.run(['ifconfig'], capture_output=True, text=True, timeout=3).stdout
            p2p = False
            for line in out.splitlines():
                if line and not line[0].isspace(): p2p = 'POINTOPOINT' in line
                parts = line.split()
                if parts and parts[0] == 'inet': add(parts[1], p2p, parts[parts.index('broadcast') + 1] if 'broadcast' in parts else None)
    except (OSError, subprocess.SubprocessError, ValueError): pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET): add(info[4][0])
    except OSError: pass
    add(default_route_ip())
    table.sort(key=lambda t: (t[1], not _is_private(t[0])))  # LAN first, then public, tunnels last
    _IFACE_CACHE['at'] = now; _IFACE_CACHE['table'] = table
    return list(table)

def multicast_ifaces():
    """Interface IPs to join/announce the discovery group on: every non-tunnel IPv4, else None (kernel default)."""
    ips = [t[0] for t in _iface_table() if not t[1]]
    return ips or [None]

def broadcast_targets():
    """Subnet broadcast addresses of every LAN interface — reaches peers where multicast is filtered."""
    return [t[2] for t in _iface_table() if t[2] and not t[1]]

def local_ipv4s():
    """Candidate addresses peers may reach us on: LAN addresses first, tunnels last (max 8, signed)."""
    return [t[0] for t in _iface_table()][:8]

# ── snapshot store ───────────────────────────────────────────────────────────
class SnapshotStore:
    def __init__(self):
        self.lock = threading.Lock(); self.body = b''; self.etag = ''
        if os.path.exists(SNAPSHOT):
            try:
                with open(SNAPSHOT, 'rb') as f: self.body = f.read()
                self.etag = hashlib.sha256(self.body).hexdigest()
            except OSError: pass
    def put(self, body):
        with self.lock:
            atomic_write(SNAPSHOT, body)
            self.body = body; self.etag = hashlib.sha256(body).hexdigest()
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
        self.config_lock = threading.RLock(); self.folder_lock = threading.Lock()
        self.config_generation = 0
        self.cache = {}  # peer id → {'etag','snapshot'}
        self.folder_cache = {}  # sync-folder file name → {'key': (mtime, size), 'doc'}
        self.stop = threading.Event()

    def _check_generation(self, generation):
        """Call while holding config_lock, immediately before trusting or publishing a result."""
        if generation != self.config_generation: raise ConfigurationChanged('configuration changed during request')

    # discovery
    def announce_loop(self):
        socks = {}; scanned = 0.0; failing = set()  # log a failing target once, not every 5 s
        def send(sock, dst, what, dport=None):
            try: sock.sendto(data, (dst, dport or port))
            except OSError as e:
                if what not in failing: failing.add(what); log('announce %s failed: %s (broadcast/static peers still tried)' % (what, e))
            else:
                if what in failing: failing.discard(what); log('announce %s working again' % what)
        try:
            while not self.stop.is_set():
                if time.time() - scanned >= IFACE_RESCAN:
                    wanted = multicast_ifaces()
                    for ip in [k for k in socks if k not in wanted]: socks.pop(ip).close()
                    for ip in wanted:
                        if ip in socks: continue
                        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
                        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 1)
                        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_LOOP, 1)
                        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
                        if ip:
                            try: sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(ip))
                            except OSError as e: log('multicast interface %s not usable (%s)' % (ip, e)); sock.close(); continue
                        socks[ip] = sock
                    if not socks: log('no multicast interface available; retrying in %ss' % IFACE_RESCAN)
                    scanned = time.time()
                ts = int(time.time())
                addrs = local_ipv4s()
                msg = {'v': 1, 'id': self.cfg['id'], 'name': self.cfg['name'], 'port': self.cfg['lan_port'], 'fp': self.fp, 'ts': ts, 'addrs': addrs}
                msg['sig'] = sign(self.cfg['pair_key'], msg['id'], msg['name'], msg['port'], msg['fp'], ts, ','.join(addrs))
                data = json.dumps(msg).encode(); port = self.cfg['mcast_port']
                for ip, sock in socks.items(): send(sock, MCAST_GROUP, 'multicast on %s' % (ip or 'default'))
                # fallbacks for networks / endpoint agents that drop multicast: subnet broadcast, then
                # unicast to any statically configured peers (`static_peers` in peer.json)
                if socks:
                    sock = next(iter(socks.values()))
                    for dst in broadcast_targets(): send(sock, dst, 'broadcast to %s' % dst)
                    for dst in self.cfg.get('static_peers', []):
                        host, dport = split_host_port(str(dst))
                        send(sock, host, 'unicast to %s' % dst, dport)
                self.stop.wait(ANNOUNCE_EVERY)
        finally:
            for sock in socks.values(): sock.close()

    def _join_group(self, sock, joined):
        """Join the discovery group on every LAN interface (plus the kernel default); idempotent, re-run on rescan."""
        for ip in multicast_ifaces() + [None]:
            if ip in joined: continue
            mreq = socket.inet_aton(MCAST_GROUP) + socket.inet_aton(ip or '0.0.0.0')
            try: sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq); joined.add(ip)
            except OSError as e:
                if e.errno == errno.EADDRINUSE: joined.add(ip)
                else: log('multicast join on %s failed: %s' % (ip or 'default', e))

    def listen_loop(self, bind_host='', ready=None):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if hasattr(socket, 'SO_REUSEPORT'): sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            sock.bind((bind_host, self.cfg['mcast_port']))
            if self.cfg['mcast_port'] == 0: self.cfg['mcast_port'] = sock.getsockname()[1]
            joined = set(); self._join_group(sock, joined); scanned = time.time()
            sock.settimeout(1.0)
            if ready is not None: ready.set()
            while not self.stop.is_set():
                if time.time() - scanned >= IFACE_RESCAN: self._join_group(sock, joined); scanned = time.time()
                try: data, addr = sock.recvfrom(4096)
                except socket.timeout: continue
                except OSError: break
                try: msg = load_json(data.decode())
                except ValueError: continue
                if not isinstance(msg, dict) or msg.get('v') != 1 or msg.get('id') == self.cfg['id']: continue
                with self.config_lock:
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
        finally:
            sock.close()

    # fetch a peer's snapshot over pinned TLS, trying each announced address until one connects
    def fetch_peer(self, p, generation=None):
        with self.config_lock:
            if generation is None: generation = self.config_generation
            self._check_generation(generation)
            pair_key = self.cfg['pair_key']
            cached = self.cache.get(p['id'])
        ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
        conn = None; last = None
        for addr in p.get('addrs') or [p['addr']]:
            c = http.client.HTTPSConnection(addr, p['port'], timeout=2.5, context=ctx)
            try: c.connect()
            except OSError as e:
                c.close(); last = e; continue
            conn = c
            break
        if conn is None: raise RuntimeError('unreachable on %s (%s)' % (', '.join(p.get('addrs') or [p['addr']]), last))
        try:
            der = conn.sock.getpeercert(binary_form=True)
            if not hmac.compare_digest(hashlib.sha256(der).hexdigest(), p['fp']):
                raise RuntimeError('certificate fingerprint mismatch for %s' % p['name'])
            with self.config_lock: self._check_generation(generation)
            headers = {'Authorization': 'Bearer ' + bearer(pair_key)}
            if cached: headers['If-None-Match'] = cached['etag']
            conn.request('GET', '/snapshot', headers=headers)
            r = conn.getresponse(); body = r.read()
            if r.status == 304 and cached: snap = cached['snapshot']
            elif r.status == 204: snap = None
            elif r.status == 200: snap = load_json(body.decode())
            else: raise RuntimeError('peer %s answered HTTP %s' % (p['name'], r.status))
            with self.config_lock:
                self._check_generation(generation)
                if addr != p['addr']:
                    p = dict(p, addr=addr, addrs=[addr] + [a for a in p['addrs'] if a != addr])
                    self.peers.seen(p['id'], p)
                if r.status == 200: self.cache[p['id']] = {'etag': r.getheader('ETag', ''), 'snapshot': snap}
                return snap
        finally:
            conn.close()

    # ── sync-folder transport ─────────────────────────────────────────────────
    # A folder both laptops can see (Google Drive, iCloud, SMB share). We write our snapshot there as
    # stickysites-peer-<id>.json, signed with the pairing key; every other such file is a peer.
    FOLDER_PREFIX = 'stickysites-peer-'

    def sync_dir(self):
        d = str(self.cfg.get('sync_dir') or '').strip()
        return os.path.expanduser(d) if d else ''

    def own_folder_file(self):
        return os.path.join(self.sync_dir(), '%s%s.json' % (self.FOLDER_PREFIX, self.cfg['id']))

    @staticmethod
    def canon(obj):
        """Canonical bytes of a snapshot object — the same on write and read regardless of how the
        extension formatted its JSON."""
        return json.dumps(obj, separators=(',', ':'), sort_keys=True, ensure_ascii=False).encode()

    def folder_sig(self, pid, name, ts, snapshot_obj, pair_key=None):
        return sign(self.cfg['pair_key'] if pair_key is None else pair_key, 'folder', pid, name, ts, hashlib.sha256(self.canon(snapshot_obj)).hexdigest())

    def write_folder_snapshot(self):
        with self.config_lock, self.folder_lock:
            d = self.sync_dir()
            if not d: return None
            body, etag = self.store.get()
            if not body: return None
            if getattr(self, '_folder_written_etag', None) == etag and os.path.exists(self.own_folder_file()): return 'unchanged'
            if not os.path.isdir(d): raise RuntimeError('sync folder does not exist: %s' % d)
            # (an OSError from the write below is caught by callers and logged; the daemon keeps serving)
            ts = int(time.time()); snap = load_json(body.decode())
            doc = {'v': 1, 'id': self.cfg['id'], 'name': self.cfg['name'], 'ts': ts, 'daemon': VERSION,
                   'sig': self.folder_sig(self.cfg['id'], self.cfg['name'], ts, snap), 'snapshot': snap}
            atomic_write(self.own_folder_file(), json.dumps(doc, separators=(',', ':')).encode())
            self._folder_written_etag = etag
            return 'written'

    def _folder_result(self, generation, entries):
        with self.config_lock:
            return entries if generation == self.config_generation else []

    def folder_peers(self, generation=None):
        """Read bounded regular files; return only results from the current configuration."""
        with self.config_lock:
            if generation is None: generation = self.config_generation
            if generation != self.config_generation: return []
            d = self.sync_dir(); own = os.path.basename(self.own_folder_file())
            pair_key = self.cfg['pair_key']; own_id = self.cfg['id']
        out = []
        if not d: return out
        if not os.path.isdir(d): return self._folder_result(generation, [{'id': 'folder', 'name': 'sync folder', 'error': 'sync folder does not exist: %s' % d, 'via': 'folder'}])
        try: names = sorted(os.listdir(d))
        except OSError as e:
            return self._folder_result(generation, [{'id': 'folder', 'name': 'sync folder', 'via': 'folder', 'error': 'cannot read sync folder: %s — allow "StickySites Peer" (or python3) under System Settings → Privacy & Security → Files and Folders, or pick a folder outside ~/Library/CloudStorage (e.g. an SMB share)' % e}])
        for fn in names:
            if not fn.startswith(self.FOLDER_PREFIX) or not fn.endswith('.json') or fn == own: continue
            path = os.path.join(d, fn)
            try:
                before = os.lstat(path)
                if stat.S_ISLNK(before.st_mode): raise ValueError('folder entry must not be a symlink')
                if not stat.S_ISREG(before.st_mode): raise ValueError('folder entry must be a regular file')
                flags = os.O_RDONLY | os.O_NONBLOCK | getattr(os, 'O_NOFOLLOW', 0)
                descriptor = os.open(path, flags)
                try:
                    st = os.fstat(descriptor)
                    if not stat.S_ISREG(st.st_mode): raise ValueError('folder entry must be a regular file')
                    if (before.st_dev, before.st_ino) != (st.st_dev, st.st_ino): raise ValueError('folder entry changed while opening')
                    if st.st_size > MAX_FOLDER_BYTES: raise ValueError('folder file too large')
                    key = (st.st_dev, st.st_ino, st.st_mtime_ns, st.st_ctime_ns, st.st_size)
                    with self.config_lock:
                        self._check_generation(generation)
                        cached = self.folder_cache.get(fn)
                    if cached and cached['key'] == key: doc = cached['doc']
                    else:
                        with os.fdopen(descriptor, 'rb', closefd=False) as stream: body = stream.read(MAX_FOLDER_BYTES + 1)
                        if len(body) > MAX_FOLDER_BYTES: raise ValueError('folder file too large')
                        doc = load_json(body.decode())
                        if not isinstance(doc, dict): raise ValueError('folder document must be an object')
                        with self.config_lock:
                            self._check_generation(generation)
                            self.folder_cache[fn] = {'key': key, 'doc': doc}
                finally:
                    os.close(descriptor)
                pid, name, ts = str(doc.get('id')), str(doc.get('name', ''))[:64], doc.get('ts')
                expected = self.folder_sig(pid, name, ts, doc.get('snapshot'), pair_key=pair_key)
                age = int(time.time() - st.st_mtime)
                if not hmac.compare_digest(expected, str(doc.get('sig', ''))):
                    out.append({'id': pid, 'name': name or fn, 'error': 'signature mismatch — that laptop uses a different pairing key', 'via': 'folder', 'age': age}); continue
                if pid == own_id: continue
                out.append({'id': pid, 'name': name or pid, 'snapshot': doc.get('snapshot'), 'via': 'folder', 'age': age})
            except ConfigurationChanged:
                return self._folder_result(generation, out)
            except (OSError, ValueError, RecursionError) as e:
                out.append({'id': fn, 'name': fn, 'error': 'unreadable: %s' % e, 'via': 'folder'})
        return self._folder_result(generation, out)

    def folder_status(self):
        d = self.sync_dir()
        if not d: return {'dir': '', 'configured': False}
        info = {'dir': d, 'configured': True, 'exists': os.path.isdir(d), 'writable': os.access(d, os.W_OK) if os.path.isdir(d) else False}
        try: os.listdir(d) if os.path.isdir(d) else None
        except OSError as e: info['writable'] = False; info['error'] = 'cannot read sync folder: %s (grant Files and Folders access to StickySites Peer, or use a folder outside ~/Library/CloudStorage)' % e
        try:
            st = os.stat(self.own_folder_file()); info['ownFileAge'] = int(time.time() - st.st_mtime)
        except OSError: info['ownFileAge'] = None
        info['peers'] = [{'id': p['id'], 'name': p['name'], 'age': p.get('age'), 'ok': 'snapshot' in p, 'error': p.get('error')} for p in self.folder_peers()]
        return info

    def peers_snapshots(self):
        with self.config_lock: generation = self.config_generation
        try:
            self.write_folder_snapshot()
        except Exception as e:
            log('sync folder write failed: %s' % e)
        folder = {f['id']: f for f in self.folder_peers(generation=generation)}
        with self.config_lock:
            if generation != self.config_generation: return []
            peers = list(self.peers.live().values())
        out = []
        for p in peers:
            try:
                snap = self.fetch_peer(p, generation=generation)
                entry = {'id': p['id'], 'name': p['name'], 'snapshot': snap}
            except Exception as e:
                log('fetch from %s failed: %s' % (p['name'], e))
                entry = {'id': p['id'], 'name': p['name'], 'error': str(e)}
            # same laptop also present in the sync folder: LAN result wins only if it actually fetched
            ff = folder.pop(p['id'], None)
            if ff is not None:
                if 'snapshot' not in ff: entry['folderError'] = ff.get('error')
                elif 'snapshot' in entry: entry['alsoVia'] = 'folder'
                else: entry = dict(ff, lanError=entry.get('error'))
            out.append(entry)
        out.extend(folder.values())  # folder-only peers (and signature/unreadable reports)
        with self.config_lock:
            return out if generation == self.config_generation else []

    # Loopback-only config view/update (popup Settings). Mutates self.cfg in place so the announce,
    # listen and fetch loops pick the new pairing key / static peers up on their next iteration.
    def get_config(self):
        return {'id': self.cfg['id'], 'name': self.cfg['name'], 'pairKey': self.cfg['pair_key'],
                'staticPeers': list(self.cfg.get('static_peers', [])), 'lanPort': self.cfg['lan_port'],
                'discoveryPort': self.cfg['mcast_port'], 'addrs': local_ipv4s(), 'syncDir': str(self.cfg.get('sync_dir') or '')}

    def update_config(self, body):
        with self.config_lock, self.folder_lock:
            candidate = dict(self.cfg)
            changed = []
            if 'pairKey' in body:
                key = str(body['pairKey']).strip()
                if len(key) < 8 or len(key) > 128 or any(c.isspace() for c in key): raise ValueError('pairKey must be 8-128 characters without spaces')
                if key != candidate['pair_key']: candidate['pair_key'] = key; changed.append('pairKey')
            if 'staticPeers' in body:
                raw = body['staticPeers']
                if isinstance(raw, str): raw = raw.split(',')
                if not isinstance(raw, list): raise ValueError('staticPeers must be a list or a comma-separated string')
                peers = []
                for p in raw:
                    p = str(p).strip()
                    if not p: continue
                    host, dport = split_host_port(p)
                    if ':' in host: raise ValueError('use IP or IP:port, e.g. 192.168.1.20 or 192.168.1.20:%d: %s' % (candidate['mcast_port'], p))
                    try: socket.inet_aton(host)
                    except OSError:
                        try: socket.getaddrinfo(host, None, socket.AF_INET)
                        except OSError: raise ValueError('not an IPv4 address or resolvable host: %s' % host)
                    if p not in peers: peers.append(p)
                if len(peers) > 32: raise ValueError('at most 32 static peers')
                if peers != list(candidate.get('static_peers', [])): candidate['static_peers'] = peers; changed.append('staticPeers')
            if 'name' in body:
                name = str(body['name']).strip()[:64]
                if name and name != candidate['name']: candidate['name'] = name; changed.append('name')
            if 'syncDir' in body:
                d = str(body['syncDir']).strip()
                if len(d) > 1024: raise ValueError('syncDir too long')
                if d and not os.path.isdir(os.path.expanduser(d)): raise ValueError('sync folder does not exist: %s' % d)
                if d != str(candidate.get('sync_dir') or ''):
                    candidate['sync_dir'] = d; changed.append('syncDir')
            if changed:
                save_config(candidate)
                self.cfg.update(candidate)
                self.config_generation += 1
                if any(field in changed for field in ('pairKey', 'syncDir', 'name')):
                    self._folder_written_etag = None
                    self.folder_cache.clear()
                if 'pairKey' in changed:
                    with self.peers.lock: self.peers.peers.clear()   # peers seen under the old key are no longer trusted
                    self.cache.clear()
                log('config updated via loopback: %s' % ', '.join(changed))
            return changed

    # Definitive connectivity test to one peer address: TCP → TLS (cert fingerprint) → GET /hello with
    # the bearer token. Each step reports ok/fail + elapsed ms; the first failing step names the cause.
    def test_peer(self, target):
        with self.config_lock:
            generation = self.config_generation; pair_key = self.cfg['pair_key']
            trusted = list(self.peers.live().values())
        host, dport = split_host_port(str(target))
        port = dport if dport and dport != self.cfg['mcast_port'] else self.cfg['lan_port']
        res = {'target': str(target), 'host': host, 'port': port, 'steps': [], 'ok': False}
        t0 = time.time()
        def step(name, ok, detail=''):
            res['steps'].append({'step': name, 'ok': ok, 'ms': int((time.time() - t0) * 1000), 'detail': detail})
        ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
        conn = http.client.HTTPSConnection(host, port, timeout=4, context=ctx)
        try:
            try: conn.connect()
            except OSError as e:
                hint = ''
                if getattr(e, 'errno', None) in (errno.EHOSTUNREACH, errno.ENETUNREACH):
                    hint = (' — this Mac refused to send on the local network. Usually a VPN forcing all apps into its tunnel: add "StickySites Peer" (in ~/Applications) to its bypass / split-tunnel list '
                            '(Surfshark: Settings → VPN settings → Bypasser → Bypass VPN → add app), or allow it under System Settings → Privacy & Security → Local Network, then run `launchctl kickstart -k gui/$(id -u)/com.stickysites.peer`')
                elif isinstance(e, socket.timeout) or 'timed out' in str(e):
                    hint = ' — no answer: wrong IP, helper not running there, or a firewall blocking TCP %d' % port
                elif getattr(e, 'errno', None) == errno.ECONNREFUSED:
                    hint = ' — port closed: the helper is not running on that machine (or a different lan_port)'
                step('tcp', False, '%s%s' % (e, hint)); return res
            step('tcp', True, 'connected')
            fp = hashlib.sha256(conn.sock.getpeercert(binary_form=True)).hexdigest()
            known = [q for q in trusted if q.get('fp') == fp]
            if not known:
                step('tls', False, 'cert %s is not authenticated by signed discovery; verify the pairing key and wait for an announcement' % fp[:12])
                return res
            with self.config_lock: self._check_generation(generation)
            step('tls', True, 'cert %s (matches announced peer %s)' % (fp[:12], known[0]['name']))
            conn.request('GET', '/hello', headers={'Authorization': 'Bearer ' + bearer(pair_key)})
            r = conn.getresponse(); body = r.read()
            with self.config_lock: self._check_generation(generation)
            if r.status == 401:
                step('pairing', False, 'HTTP 401 — the other laptop has a DIFFERENT pairing key'); return res
            if r.status != 200:
                step('pairing', False, 'HTTP %s' % r.status); return res
            try: hello = load_json(body.decode())
            except ValueError: hello = {}
            if not isinstance(hello, dict): hello = {}
            with self.config_lock:
                self._check_generation(generation)
                step('pairing', True, 'key accepted by %s' % hello.get('name', host))
                res.update({'ok': True, 'peerName': hello.get('name'), 'peerId': hello.get('id'), 'peerVersion': hello.get('version')})
                heard = next((q for q in self.peers.live().values() if q.get('id') == hello.get('id')), None)
                res['heardFrom'] = int(time.time() - heard['lastSeen']) if heard else None
                return res
        except ConfigurationChanged as e:
            step('pairing', False, str(e)); return res
        finally:
            try: conn.close()
            except Exception: pass

    def status(self):
        return {'version': VERSION, 'id': self.cfg['id'], 'name': self.cfg['name'], 'lanPort': self.cfg['lan_port'],
                'staticPeers': list(self.cfg.get('static_peers', [])),
                'folder': self.folder_status(),
                'hasSnapshot': bool(self.store.get()[0]),
                'peers': [{'id': p['id'], 'name': p['name'], 'addr': p['addr'], 'port': p['port'], 'lastSeen': int(time.time() - p['lastSeen'])} for p in self.peers.live().values()]}

def make_handlers(d):
    class LoopHandler(BaseHTTPRequestHandler):
        """Loopback API for the extension. CORS-open to chrome-extension:// origins only."""
        def log_message(self, *a): pass
        @staticmethod
        def _extension_origin(origin):
            try:
                parsed = urlsplit(origin)
                return (parsed.scheme in ('chrome-extension', 'moz-extension') and bool(parsed.hostname)
                        and parsed.netloc == parsed.hostname and not parsed.path and not parsed.query and not parsed.fragment)
            except ValueError: return False
        def _allowed(self):
            # A DNS-rebound web page must not read secrets or trigger diagnostic connections.
            try:
                hosts = self.headers.get_all('Host', [])
                host = urlsplit('http://' + hosts[0]) if len(hosts) == 1 else None
                valid_host = (host is not None and host.hostname in ('127.0.0.1', 'localhost', '::1')
                              and host.username is None and host.password is None and not host.path
                              and not host.query and not host.fragment and host.port in (None, self.server.server_port))
            except ValueError: valid_host = False
            origins = self.headers.get_all('Origin', [])
            valid_origin = (not origins or (len(origins) == 1 and self._extension_origin(origins[0])))
            browser_get = (not origins and (self.headers.get('Sec-Fetch-Site') in ('cross-site', 'same-site')
                                           or self.headers.get('Sec-Fetch-Mode') == 'navigate'))
            if valid_host and valid_origin and not browser_get: return True
            self._json(403, {'error': 'loopback Host and extension Origin required'})
            return False
        def _cors(self):
            origin = self.headers.get('Origin', '')
            if self._extension_origin(origin):
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'content-type')
            self.send_header('Access-Control-Max-Age', '600')
        def _json(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code); self._cors(); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
        def _read_body(self, limit):
            lengths = self.headers.get_all('Content-Length', [])
            if self.headers.get('Transfer-Encoding') is not None or len(lengths) > 1:
                self._json(400, {'error': 'ambiguous request length'}); return None
            if not lengths:
                self._json(411, {'error': 'Content-Length required'}); return None
            value = lengths[0].strip()
            if not value or any(c not in '0123456789' for c in value):
                self._json(400, {'error': 'invalid Content-Length'}); return None
            try: n = int(value)
            except ValueError:
                self._json(400, {'error': 'invalid Content-Length'}); return None
            if n > limit:
                self._json(413, {'error': 'too large'}); return None
            try: body = self.rfile.read(n)
            except socket.timeout:
                self._json(408, {'error': 'request body timed out'}); return None
            if len(body) != n:
                self._json(400, {'error': 'incomplete request body'}); return None
            return body
        def do_OPTIONS(self):
            if not self._allowed(): return
            self.send_response(204); self._cors(); self.end_headers()
        def do_GET(self):
            if not self._allowed(): return
            if self.path == '/status': return self._json(200, d.status())
            if self.path == '/config': return self._json(200, d.get_config())
            if self.path.startswith('/test'):
                # /test?peer=IP[:port] (repeatable) — default: every static peer and every announced peer
                from urllib.parse import urlparse, parse_qs
                q = parse_qs(urlparse(self.path).query)
                targets = q.get('peer') or list(d.cfg.get('static_peers', [])) + ['%s:%s' % (p['addr'], p['port']) for p in d.peers.live().values()]
                seen = []; results = []
                for t in targets:
                    if t in seen: continue
                    seen.append(t); results.append(d.test_peer(t))
                try: d.write_folder_snapshot()
                except Exception as e: log('sync folder write failed: %s' % e)
                return self._json(200, {'results': results, 'folder': d.folder_status(),
                                        'heard': [{'name': p['name'], 'addr': p['addr'], 'lastSeen': int(time.time() - p['lastSeen'])} for p in d.peers.live().values()]})
            if self.path == '/peers/snapshots': return self._json(200, {'peers': d.peers_snapshots()})
            self._json(404, {'error': 'not found'})
        def do_PUT(self):
            if not self._allowed(): return
            if self.path == '/config':
                raw = self._read_body(16 * 1024)
                if raw is None: return
                try:
                    body = load_json(raw.decode())
                    if not isinstance(body, dict): raise ValueError('body must be an object')
                    changed = d.update_config(body)
                except ValueError as e: return self._json(400, {'error': str(e)})
                except OSError as e:
                    log('config persistence failed: %s' % e)
                    return self._json(500, {'error': 'could not save configuration'})
                return self._json(200, {'ok': True, 'changed': changed, 'config': d.get_config()})
            if self.path != '/snapshot': return self._json(404, {'error': 'not found'})
            body = self._read_body(64 * 1024 * 1024)
            if body is None: return
            try:
                snap = load_json(body.decode())
                if not isinstance(snap, dict) or snap.get('version') != 1 or 'notes' not in snap: raise ValueError('bad snapshot')
            except ValueError as e: return self._json(400, {'error': str(e)})
            try: d.store.put(body)
            except OSError as e:
                log('snapshot persistence failed: %s' % e)
                return self._json(500, {'error': 'could not save snapshot'})
            try: d.write_folder_snapshot()
            except Exception as e: log('sync folder write failed: %s' % e)
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

class PeerHTTPServer(ThreadingHTTPServer):
    """Accept promptly; perform each bounded TLS handshake in its request worker."""
    daemon_threads = True
    def __init__(self, *args, tls_context=None, **kwargs):
        self.tls_context = tls_context
        super().__init__(*args, **kwargs)
    def get_request(self):
        request, address = super().get_request()
        request.settimeout(REQUEST_TIMEOUT)
        return request, address
    def handle_error(self, request, address):
        if isinstance(sys.exc_info()[1], (ConnectionResetError, BrokenPipeError)): return
        super().handle_error(request, address)
    def process_request_thread(self, request, address):
        if self.tls_context is not None:
            try: request = self.tls_context.wrap_socket(request, server_side=True)
            except OSError:
                self.shutdown_request(request)
                return
        super().process_request_thread(request, address)

def make_servers(d, lan_host='0.0.0.0'):
    cfg = d.cfg
    LoopHandler, LanHandler = make_handlers(d)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(CERT, KEY)
    loop = PeerHTTPServer(('127.0.0.1', cfg['loop_port']), LoopHandler)
    try: lan = PeerHTTPServer((lan_host, cfg['lan_port']), LanHandler, tls_context=ctx)
    except BaseException:
        loop.server_close()
        raise
    return loop, lan

def run(cfg):
    ensure_cert()
    d = Daemon(cfg)
    loop, lan = make_servers(d)
    for target in (d.announce_loop, d.listen_loop, loop.serve_forever, lan.serve_forever):
        threading.Thread(target=target, daemon=True).start()
    log('stickysites-peer %s "%s" up: loopback http://127.0.0.1:%d, lan https://0.0.0.0:%d, mcast %s:%d' % (VERSION, cfg['name'], cfg['loop_port'], cfg['lan_port'], MCAST_GROUP, cfg['mcast_port']))
    log('interpreter %s' % sys.executable)
    try:
        while True: time.sleep(3600)
    except KeyboardInterrupt:
        pass
    finally:
        d.stop.set(); loop.shutdown(); lan.shutdown(); loop.server_close(); lan.server_close()

# ── install ──────────────────────────────────────────────────────────────────
APP_DIR = os.path.expanduser('~/Applications/StickySites Peer.app')

APPLE_PYTHON = '/usr/bin/python3'

def daemon_interpreter(override=None):
    """Interpreter the launchd job runs the daemon with.

    macOS Local Network privacy attributes a launchd job's LAN traffic to the code identity of the
    process that sends, i.e. the *interpreter* after our wrapper execs it — not to the wrapper
    bundle. Homebrew's python3 is itself an app bundle (Python.app): a background job never gets
    its "Allow" prompt, so every LAN unicast/multicast send fails with EHOSTUNREACH ("No route to
    host") while `nc`/`curl`/Apple's python3 from the same shell succeed. Apple's /usr/bin/python3
    (Command Line Tools, 3.9+) is a system binary and is allowed, so prefer it when installed.
    It is only probed when the CLT are present: bare /usr/bin/python3 without them opens the
    installer dialog."""
    if override: return override
    if sys.platform == 'darwin' and os.path.exists('/Library/Developer/CommandLineTools/usr/bin/python3') and os.path.exists(APPLE_PYTHON):
        try:
            ok = subprocess.run([APPLE_PYTHON, '-c', 'import sys; print(sys.version_info >= (3, 9))'], capture_output=True, text=True, timeout=15).stdout.strip()
            if ok == 'True': return APPLE_PYTHON
        except (OSError, subprocess.SubprocessError): pass
    return sys.executable

def build_app_bundle(interpreter=None):
    """Wrap the daemon in a minimal, ad-hoc-signed .app so macOS attributes its LAN traffic to a
    named app: recent macOS (Local Network privacy) silently refuses multicast/broadcast/unicast
    sends (EHOSTUNREACH, "No route to host") from bare background executables, but shows an
    "Allow" prompt for an app bundle and remembers the answer. The bundle only execs this script
    with `daemon_interpreter()` (Apple's python3 when available — see there for why)."""
    interpreter = interpreter or daemon_interpreter()
    macos = os.path.join(APP_DIR, 'Contents', 'MacOS'); os.makedirs(macos, exist_ok=True)
    exe = os.path.join(macos, 'stickysites-peer')
    with open(exe, 'w') as f:
        f.write('#!/bin/sh\n# launchd runs this with no args (daemon); `open -a "StickySites Peer" --args probe` runs one LAN send to trigger the macOS Local Network prompt.\nexec "%s" "%s" "${1:-run}"\n' % (interpreter, os.path.abspath(__file__)))
    os.chmod(exe, 0o755)
    with open(os.path.join(APP_DIR, 'Contents', 'Info.plist'), 'w') as f:
        f.write('''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>%s</string>
  <key>CFBundleName</key><string>StickySites Peer</string>
  <key>CFBundleDisplayName</key><string>StickySites Peer</string>
  <key>CFBundleExecutable</key><string>stickysites-peer</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>%s</string>
  <key>CFBundleVersion</key><string>%s</string>
  <key>LSUIElement</key><true/>
  <key>LSBackgroundOnly</key><true/>
  <key>NSLocalNetworkUsageDescription</key><string>StickySites Peer finds your other laptops on the local network and syncs your notes with them. Nothing leaves your network.</string>
</dict></plist>
''' % (LAUNCHD_LABEL, VERSION, VERSION))
    subprocess.run(['codesign', '--force', '--sign', '-', APP_DIR], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return exe

def launchd_plist(cfg, program):
    return '''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>%s</string>
  <key>ProgramArguments</key><array><string>%s</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>%s</string>
  <key>StandardErrorPath</key><string>%s</string>
</dict></plist>
''' % (LAUNCHD_LABEL, program, LOG, LOG)

def cmd_install(a):
    cfg = ensure_config(a.pair_key, a.name, peers=a.peer); ensure_cert()
    if sys.platform == 'darwin' and not a.no_launchd:
        plist = os.path.expanduser('~/Library/LaunchAgents/%s.plist' % LAUNCHD_LABEL)
        os.makedirs(os.path.dirname(plist), exist_ok=True)
        subprocess.run(['launchctl', 'unload', plist], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        interpreter = daemon_interpreter(a.python)
        program = build_app_bundle(interpreter)
        open(plist, 'w').write(launchd_plist(cfg, program))
        subprocess.run(['launchctl', 'load', plist], check=True)
        print('launchd job %s loaded (%s) running %s with %s' % (LAUNCHD_LABEL, plist, APP_DIR, interpreter))
        # A LaunchServices launch of the bundle is what reliably triggers the Local Network prompt.
        subprocess.run(['open', '-a', APP_DIR, '--args', 'probe'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print('If macOS asks whether "StickySites Peer" may find and connect to devices on your local network, click Allow.')
        print('(Later: System Settings > Privacy & Security > Local Network > StickySites Peer)')
    elif not a.no_launchd:
        print('Non-macOS: run `%s %s run` under your service manager (systemd unit example in peer/README.md).' % (sys.executable, os.path.abspath(__file__)))
    print('peer "%s" ready. Pairing key (use it on your other laptops):\n\n  %s\n' % (cfg['name'], cfg['pair_key']))
    print('On another laptop:  python3 peer/stickysites-peer.py install --pair-key %s' % cfg['pair_key'])

def _ifname_for(ip):
    """Interface name carrying `ip` (macOS/BSD ifconfig parse; Linux ip addr)."""
    try:
        if sys.platform.startswith('linux'):
            for line in subprocess.run(['ip', '-4', '-o', 'addr'], capture_output=True, text=True, timeout=3).stdout.splitlines():
                parts = line.split()
                if 'inet' in parts and parts[parts.index('inet') + 1].split('/')[0] == ip: return parts[1]
        else:
            name = ''
            for line in subprocess.run(['ifconfig'], capture_output=True, text=True, timeout=3).stdout.splitlines():
                if line and not line[0].isspace(): name = line.split(':', 1)[0]
                parts = line.split()
                if parts and parts[0] == 'inet' and parts[1] == ip: return name
    except (OSError, subprocess.SubprocessError): pass
    return ''

def cmd_probe(a):
    """Send one signed announcement (multicast + broadcast + static peers) and exit. Launched through
    the app bundle by `open`, this is what makes macOS show the Local Network permission prompt."""
    cfg = load_config() if os.path.exists(CONFIG) else ensure_config(); ensure_cert()
    d = Daemon(cfg); d.stop.set()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    ts = int(time.time()); addrs = local_ipv4s()
    msg = {'v': 1, 'id': cfg['id'], 'name': cfg['name'], 'port': cfg['lan_port'], 'fp': d.fp, 'ts': ts, 'addrs': addrs}
    msg['sig'] = sign(cfg['pair_key'], msg['id'], msg['name'], msg['port'], msg['fp'], ts, ','.join(addrs))
    data = json.dumps(msg).encode(); results = []
    targets = [(MCAST_GROUP, cfg['mcast_port'])] + [(b, cfg['mcast_port']) for b in broadcast_targets()] + [split_host_port(str(p))[0:1] + (split_host_port(str(p))[1] or cfg['mcast_port'],) for p in cfg.get('static_peers', [])]
    for host, port in targets:
        try: sock.sendto(data, (host, port)); results.append('%s ok' % host)
        except OSError as e: results.append('%s FAIL %s' % (host, e))
    # diagnostic variants: source-bound and interface-bound sockets (a VPN tunnel that captures the
    # default route can be bypassed by binding to the physical interface)
    for ip, _p2p, _b in [t for t in _iface_table() if not t[1]][:2]:
        for label, setup in (('bind-src', lambda so: so.bind((ip, 0))), ('bound-if', lambda so: so.setsockopt(socket.IPPROTO_IP, 25, socket.if_nametoindex(_ifname_for(ip))))):
            so = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
            try:
                setup(so)
                for host, port in targets:
                    try: so.sendto(data, (host, port)); results.append('%s@%s(%s) ok' % (host, ip, label))
                    except OSError as e: results.append('%s@%s(%s) FAIL %s' % (host, ip, label, e))
            except Exception as e: results.append('%s(%s) setup FAIL %s' % (ip, label, e))
            finally: so.close()
    log('probe: ' + '; '.join(results))
    print('\n'.join(results))

def cmd_folder(a):
    cfg = load_config() if os.path.exists(CONFIG) else ensure_config()
    if a.clear or a.dir is not None:
        d = '' if a.clear else os.path.abspath(os.path.expanduser(a.dir))
        if d and not os.path.isdir(d): print('not a directory: %s' % d); sys.exit(1)
        try:
            req = urllib.request.Request('http://127.0.0.1:%d/config' % cfg['loop_port'], data=json.dumps({'syncDir': d}).encode(), method='PUT', headers={'Content-Type': 'application/json', 'Origin': 'chrome-extension://cli'})
            with urllib.request.urlopen(req, timeout=5) as r: print(json.dumps(json.load(r), indent=2)); return
        except Exception:
            cfg['sync_dir'] = d; save_config(cfg); print('daemon not running; saved to %s (takes effect on start)' % CONFIG); return
    print(cfg.get('sync_dir') or '(no sync folder set)')

def cmd_uninstall(a):
    plist = os.path.expanduser('~/Library/LaunchAgents/%s.plist' % LAUNCHD_LABEL)
    if os.path.exists(plist):
        subprocess.run(['launchctl', 'unload', plist], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); os.remove(plist)
        print('launchd job removed')
    if os.path.isdir(APP_DIR):
        import shutil; shutil.rmtree(APP_DIR, ignore_errors=True); print('app bundle removed')
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
    p = sub.add_parser('install'); p.add_argument('--pair-key'); p.add_argument('--name'); p.add_argument('--peer', action='append', metavar='IP', help='static peer address (repeatable) for networks that drop multicast/broadcast'); p.add_argument('--python', metavar='PATH', help='interpreter for the launchd job (default: Apple /usr/bin/python3 when the Command Line Tools are installed, else this one)'); p.add_argument('--no-launchd', action='store_true'); p.set_defaults(fn=cmd_install)
    p = sub.add_parser('init'); p.add_argument('--pair-key'); p.add_argument('--name'); p.add_argument('--loop-port'); p.add_argument('--lan-port'); p.add_argument('--mcast-port'); p.add_argument('--peer', action='append', metavar='IP')
    p.set_defaults(fn=lambda a: (ensure_config(a.pair_key, a.name, a.loop_port, a.lan_port, a.mcast_port, a.peer), ensure_cert(), print('initialised %s' % HOME)))
    sub.add_parser('uninstall').set_defaults(fn=cmd_uninstall)
    sub.add_parser('run').set_defaults(fn=lambda a: run(load_config() if os.path.exists(CONFIG) else ensure_config()))
    sub.add_parser('status').set_defaults(fn=cmd_status)
    sub.add_parser('probe').set_defaults(fn=cmd_probe)
    p = sub.add_parser('folder'); p.add_argument('dir', nargs='?'); p.add_argument('--clear', action='store_true'); p.set_defaults(fn=cmd_folder)
    p = sub.add_parser('pair'); p.add_argument('key', nargs='?'); p.set_defaults(fn=cmd_pair)
    a = ap.parse_args(argv); a.fn(a)

if __name__ == '__main__':
    main()
