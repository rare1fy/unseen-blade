import http.server, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # approximate the artifact sandbox: scripts inline only, no fetch/XHR to anywhere (data: included), media/img from self/data/blob
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'none'; worker-src blob:")
        super().end_headers()
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
