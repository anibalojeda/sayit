#!/usr/bin/env python3
"""Serve Say it locally and proxy speech requests through the configured AWS CLI."""

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


SITE_DIR = Path(__file__).resolve().parent / "site"
MAX_BODY_BYTES = 20_000
VOICES = {"Joanna", "Matthew"}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE_DIR), **kwargs)

    def json_error(self, status, message):
        body = json.dumps({"message": message}).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/api/synthesize":
            self.json_error(404, "Unknown endpoint.")
            return
        host = self.headers.get("Host", "")
        expected_hosts = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
        origin = self.headers.get("Origin")
        if host not in expected_hosts or (origin and origin != f"http://{host}"):
            self.json_error(403, "Requests must come from the local site.")
            return
        if self.headers.get_content_type() != "application/json":
            self.json_error(415, "Content-Type must be application/json.")
            return
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self.json_error(411, "A valid Content-Length is required.")
            return
        if length < 1 or length > MAX_BODY_BYTES:
            self.json_error(413, "Request is too large or empty.")
            return
        try:
            request = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(request, dict):
                raise ValueError("Expected an object")
            text = request.get("text")
            voice = request.get("voice")
            if not isinstance(text, str) or not text.strip() or not isinstance(voice, str) or voice not in VOICES:
                raise ValueError("Invalid text or voice")
            if len(text.encode("utf-16-le")) // 2 > 3000:
                raise ValueError("Text exceeds 3,000 characters")
            text.encode("utf-8")
        except (UnicodeError, ValueError, json.JSONDecodeError):
            self.json_error(400, "Provide valid text of up to 3,000 characters and a supported voice.")
            return

        with tempfile.TemporaryDirectory(prefix="say-it-polly-") as directory:
            request_file = Path(directory) / "text.txt"
            audio_file = Path(directory) / "speech.mp3"
            request_file.write_text(text, encoding="utf-8")
            command = [
                self.server.aws_cli, "polly", "synthesize-speech",
                "--region", self.server.aws_region,
                "--engine", "neural", "--output-format", "mp3",
                "--text-type", "text", "--text", request_file.as_uri(), "--voice-id", voice,
                "--no-cli-pager", "--no-cli-auto-prompt", str(audio_file),
            ]
            try:
                result = subprocess.run(command, capture_output=True, text=True, timeout=40, check=False)
                if result.returncode:
                    print(f"AWS Polly request failed: {result.stderr.strip()}", file=sys.stderr, flush=True)
                    self.json_error(502, "Polly request failed. Check the local server terminal for AWS credential, region, or permission errors.")
                    return
                audio = audio_file.read_bytes()
                if not audio:
                    raise OSError("AWS CLI returned an empty audio file")
            except (OSError, subprocess.TimeoutExpired) as error:
                print(f"Could not run AWS Polly: {error}", file=sys.stderr, flush=True)
                self.json_error(502, "Could not generate audio. Check the local server terminal.")
                return

        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(audio)))
        self.end_headers()
        self.wfile.write(audio)


def main():
    parser = argparse.ArgumentParser(description="Run the Say it app with local Amazon Polly support.")
    parser.add_argument("--port", type=int, default=8099)
    parser.add_argument("--region", default=os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1")
    args = parser.parse_args()
    aws_cli = shutil.which("aws")
    if not aws_cli:
        parser.exit(1, "AWS CLI not found. Install and configure it before starting the local server.\n")
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError as error:
        parser.exit(1, f"Could not start the local server: {error}\n")
    server.aws_cli = aws_cli
    server.aws_region = args.region
    print(f"Say it is available at http://127.0.0.1:{server.server_port}/ (Polly region: {args.region})", flush=True)
    print("Neural voices use your configured AWS credentials and may incur charges. Press Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping local server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
