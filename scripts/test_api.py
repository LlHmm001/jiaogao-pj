"""Quick test for the web API — sends two images to /api/compare."""
import base64, json, sys, urllib.request, urllib.error

def main():
    baseline = base64.b64encode(open("examples/baseline.png", "rb").read()).decode()
    current = base64.b64encode(open("examples/current.png", "rb").read()).decode()

    payload = json.dumps({
        "baselineBase64": baseline,
        "currentBase64": current,
        "ocrEndpoint": "http://localhost:8866",
        "ocrTimeout": 30000,
        "baselineName": "baseline.png",
        "currentName": "current.png",
    }).encode()

    req = urllib.request.Request(
        "http://localhost:3100/api/compare",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        print("ok:", data.get("ok"))
        print("diffPercent:", data["summary"]["diffPercent"], "%")
        print("diffPixels:", data["summary"]["diffPixels"])
        print("totalIssues:", data["summary"]["totalIssues"])
        print("ocrSuccess:", data["summary"]["ocrSuccess"])
        print("reportUrl:", data.get("reportUrl"))
        if data.get("issues"):
            for iss in data["issues"][:5]:
                print(f"  [{iss['category']}] {iss['severity']}: {iss['description']}")
        return 0
    except urllib.error.HTTPError as e:
        print("HTTP error:", e.code, e.reason)
        print(e.read().decode()[:500])
        return 1
    except urllib.error.URLError as e:
        print("Connection error:", e.reason)
        return 1

if __name__ == "__main__":
    sys.exit(main())
