"""Serve the bundled installer files on IPv4 loopback; no device or proxy API."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import unquote, urlsplit


WEB_ROOT = Path(__file__).resolve().parent / "web"
CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self'; "
    "connect-src 'self'; object-src 'none'; base-uri 'none'; "
    "frame-ancestors 'none'; form-action 'self'"
)


class InstallerHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".json": "application/json",
        ".wasm": "application/wasm",
    }

    def end_headers(self):
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("Permissions-Policy", "usb=(self), hid=(self)")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def allowed_request(self):
        port = self.server.server_address[1]
        allowed_hosts = {"127.0.0.1:%d" % port}
        if port == 80:
            allowed_hosts.add("127.0.0.1")
        hosts = self.headers.get_all("Host", [])
        if len(hosts) != 1 or hosts[0] not in allowed_hosts:
            self.send_error(403, "Use the printed local installer URL")
            return False
        try:
            url = urlsplit(self.path)
            path = unquote(url.path, errors="strict")
            if (url.scheme or url.netloc or not path.startswith("/")
                    or "\\" in path or "\0" in path):
                raise ValueError("Invalid path")
            parts = path.split("/")
            if ".." in parts:
                raise ValueError("Parent path")
            root = Path(self.directory).resolve()
            target = root
            for part in parts:
                if not part or part == ".":
                    continue
                # Colons can address Windows drives or NTFS alternate streams.
                if ":" in part:
                    raise ValueError("Invalid component")
                target = target / part
                if target.is_symlink() or getattr(target, "is_junction", lambda: False)():
                    raise ValueError("Linked path")
            target.resolve().relative_to(root)
            if target.is_dir():
                for name in ("index.html", "index.htm"):
                    index = target / name
                    if index.is_symlink():
                        raise ValueError("Linked index")
        except (ValueError, UnicodeError, OSError, RuntimeError):
            self.send_error(403, "Path is outside the served files")
            return False
        return True

    def do_GET(self):
        if self.allowed_request():
            super().do_GET()

    def do_HEAD(self):
        if self.allowed_request():
            super().do_HEAD()

    def list_directory(self, path):
        self.send_error(404, "Directory listing is disabled")
        return None


def chrome_path():
    for variable in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
        base = os.environ.get(variable)
        if base:
            candidate = Path(base) / "Google/Chrome/Application/chrome.exe"
            if candidate.is_file():
                return str(candidate)
    return shutil.which("chrome.exe")


def port_number(value):
    value = int(value)
    if not 0 <= value <= 65535:
        raise argparse.ArgumentTypeError("port must be between 0 and 65535")
    return value


def main():
    parser = argparse.ArgumentParser(description="RayNeo GT local firmware installer")
    parser.add_argument("--port", type=port_number, default=0,
                        help="local port; 0 selects an available port (default)")
    parser.add_argument("--no-browser", action="store_true",
                        help="print the URL without opening Chrome")
    args = parser.parse_args()
    if not WEB_ROOT.is_dir():
        parser.error("web directory is missing")
    try:
        server = ThreadingHTTPServer(
            ("127.0.0.1", args.port),
            partial(InstallerHandler, directory=str(WEB_ROOT)),
        )
    except OSError as exc:
        parser.exit(1, "Cannot start local server: %s\n" % exc)
    url = "http://127.0.0.1:%d/" % server.server_address[1]
    print("RayNeo GT installer: " + url, flush=True)
    print("Keep this window open. Press Ctrl+C to stop.", flush=True)
    if not args.no_browser:
        chrome = chrome_path()
        if chrome:
            try:
                subprocess.Popen([chrome, url], stdout=subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL)
            except OSError:
                print("Could not open Chrome. Open the URL above in Chrome.", flush=True)
        else:
            print("Chrome was not found. Open the URL above in Chrome.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
