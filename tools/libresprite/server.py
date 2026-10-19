"""
Kellogg's Land HD: MCP server that runs JavaScript inside LibreSprite (tool `run_script`).

Replacement for the relay of libresprite-mcp (https://github.com/Snehil-Shah/libresprite-mcp),
same protocol towards the LibreSprite script `mcp.js`, but robust:

- The relay never blocks: GET / answers at once with the next script or {"script": null}.
  (The original held GET requests open; when LibreSprite was restarted, the abandoned
  requests stayed waiting and later swallowed scripts that then never ran.)
- A script that gets no answer within the timeout is dropped and reported, so the next call works.
- The Claude app may start this server more than once. Only one instance can own port 64823;
  the others hand their scripts to it through POST /run.

Run:  uv run --no-project --with "mcp<2" server.py
"""

import json
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from mcp.server.fastmcp import FastMCP

PORT = 64823
TIMEOUT = 60  # seconds LibreSprite gets to fetch and run a script


class Relay:
    def __init__(self):
        self.cond = threading.Condition()
        self.next_id = 0
        self.queue = []          # [(id, script)] not yet fetched by LibreSprite
        self.running = None      # id of the script LibreSprite is running
        self.results = {}        # id -> output
        self.last_seen = 0.0     # last poll from LibreSprite

    def submit(self, script, timeout=TIMEOUT):
        with self.cond:
            self.next_id += 1
            sid = self.next_id
            self.queue.append((sid, script))
            self.cond.notify_all()
            end = time.time() + timeout
            while sid not in self.results:
                left = end - time.time()
                if left <= 0:
                    self.queue = [q for q in self.queue if q[0] != sid]
                    if self.running == sid:
                        self.running = None
                    seen = time.time() - self.last_seen
                    hint = ('LibreSprite fragt nicht ab: in LibreSprite "Scripts > mcp.js" starten und das Fenster offen lassen.'
                            if seen > 5 else 'LibreSprite hat das Skript abgeholt, aber keine Ausgabe geschickt.')
                    raise RuntimeError(f'Keine Antwort von LibreSprite nach {timeout} s. {hint}')
                self.cond.wait(left)
            return self.results.pop(sid)

    def fetch(self):
        with self.cond:
            self.last_seen = time.time()
            if self.running is None and self.queue:
                sid, script = self.queue.pop(0)
                self.running = sid
                return {'script': script, 'id': sid}
            return {'script': None}

    def post(self, output, sid=None):
        with self.cond:
            if self.running is None:
                return {'status': 'ignored'}
            if sid is not None and sid != self.running:
                return {'status': 'ignored'}
            self.results[self.running] = output if output is not None else ''
            self.running = None
            self.cond.notify_all()
            return {'status': 'success'}


relay = Relay()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(n) if n else b''
        try:
            return json.loads(raw.decode('utf-8') or 'null')
        except Exception:
            return None

    def do_GET(self):
        if self.path.startswith('/ping'):
            self._send({'status': 'pong'})
        else:
            self._send(relay.fetch())

    def do_POST(self):
        req = self._body()
        if self.path.startswith('/run'):
            # another instance of this server hands over a script
            try:
                out = relay.submit((req or {}).get('script', ''))
                self._send({'output': out})
            except Exception as e:
                self._send({'error': str(e)})
            return
        if not isinstance(req, dict):
            self._send({'status': 'invalid'})
            return
        self._send(relay.post(req.get('output'), req.get('id')))


def start_relay():
    try:
        srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    except OSError:
        return False  # port taken: another instance is the relay
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return True


OWN_RELAY = start_relay()
mcp = FastMCP('libresprite')


@mcp.tool()
def run_script(script: str) -> str:
    """
    Run a JavaScript script inside LibreSprite and return its console output.

    The script runs in LibreSprite's scripting engine (globals: app, storage, console, ColorMode, ...).
    Use console.log to return values. See LibreSprite's SCRIPTING.md for the API.

    Args:
        script: The script to execute
    """
    if OWN_RELAY:
        return relay.submit(script)
    # another instance owns the port: hand the script over
    data = json.dumps({'script': script}).encode()
    req = urllib.request.Request(f'http://127.0.0.1:{PORT}/run', data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=TIMEOUT + 10) as r:
        res = json.loads(r.read().decode('utf-8'))
    if 'error' in res:
        raise RuntimeError(res['error'])
    return res.get('output', '')


if __name__ == '__main__':
    print(f'libresprite relay on port {PORT}: {"own" if OWN_RELAY else "forwarding"}', file=sys.stderr)
    mcp.run(transport='stdio')
