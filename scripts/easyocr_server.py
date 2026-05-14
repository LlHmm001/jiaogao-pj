"""
EasyOCR HTTP service — PaddleOCR-compatible API.

Usage:
  python scripts/easyocr_server.py [--port 8866] [--lang ch_sim,en]

The server exposes:
  POST /ocr/predict
    Body: { "images": ["<base64>"] }
    Response: { "results": [[ { "text": "...", "confidence": 0.95, "text_region": [x1,y1,x2,y2] } ]] }

This is a drop-in replacement for PaddleOCR hub serving, so the visual-proofreader
OCR client (src/ocr/client.ts) works without modification.
"""

import argparse
import base64
import io
import json
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

import numpy as np
from PIL import Image

reader = None

def init_reader(lang_list, gpu=True):
    global reader
    print(f"正在加载 EasyOCR 模型... (语言: {lang_list}, GPU: {gpu})")
    import easyocr
    reader = easyocr.Reader(lang_list, gpu=gpu)
    print("EasyOCR 模型加载完成")


def ocr_predict(images_base64, lang_list):
    global reader
    r = reader
    results = []
    for b64_str in images_base64:
        if not b64_str:
            results.append([])
            continue
        try:
            img_bytes = base64.b64decode(b64_str)
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            arr = np.array(img)
            raw = r.readtext(arr)
        except Exception:
            results.append([])
            continue

        blocks = []
        for bbox, text, confidence in raw:
            # bbox: [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
            x1 = int(min(p[0] for p in bbox))
            y1 = int(min(p[1] for p in bbox))
            x2 = int(max(p[0] for p in bbox))
            y2 = int(max(p[1] for p in bbox))
            blocks.append({
                "text": text,
                "confidence": round(float(confidence), 4),
                "text_region": [x1, y1, x2, y2],
            })
        results.append(blocks)
    return {"results": results}


class Handler(BaseHTTPRequestHandler):
    lang_list = ["ch_sim", "en"]

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_POST(self):
        if self.path != "/ocr/predict":
            self.send_error(404)
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
        except Exception:
            self.send_error(400, "Failed to read request body")
            return

        try:
            data = json.loads(body)
            images = data.get("images", [])
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_error(400, "Invalid JSON")
            return

        try:
            result = ocr_predict(images, self.lang_list)
        except Exception as e:
            self.send_error(500, str(e))
            return

        resp = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(resp)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(resp)

    def do_GET(self):
        if self.path == "/health" or self.path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "service": "easyocr"}).encode())
        else:
            self.send_error(404)

    def log_message(self, format, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), args[0]))


def main():
    parser = argparse.ArgumentParser(description="EasyOCR HTTP Service")
    parser.add_argument("--port", type=int, default=8866, help="Listen port (default: 8866)")
    parser.add_argument("--lang", type=str, default="ch_sim,en", help="Languages for EasyOCR (default: ch_sim,en)")
    parser.add_argument("--gpu", action="store_true", default=True, help="Use GPU (default)")
    parser.add_argument("--cpu", action="store_true", help="Force CPU mode")
    args = parser.parse_args()

    Handler.lang_list = [x.strip() for x in args.lang.split(",") if x.strip()]
    use_gpu = not args.cpu

    # Preload model at startup
    init_reader(Handler.lang_list, gpu=use_gpu)

    print(f"\nEasyOCR HTTP 服务启动")
    print(f"  地址: http://localhost:{args.port}")
    print(f"  语言: {Handler.lang_list}")
    print(f"  OCR 接口: POST http://localhost:{args.port}/ocr/predict")
    print(f"  健康检查: GET  http://localhost:{args.port}/health\n")

    server = HTTPServer(("0.0.0.0", args.port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
        server.shutdown()


if __name__ == "__main__":
    main()
