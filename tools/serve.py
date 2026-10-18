#!/usr/bin/env python3
"""Lokaler Server für die Browser-Version.

    python3 tools/serve.py [port]      ->  http://localhost:8766/web/
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


print(f'http://localhost:{PORT}/web/')
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
