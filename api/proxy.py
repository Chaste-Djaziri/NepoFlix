import json
import requests
import cloudscraper
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter
from http import HTTPStatus

session = requests.Session()
retry = Retry(total=3,
              status_forcelist=[429, 500, 502, 503, 504],
              allowed_methods=["GET", "HEAD", "OPTIONS", "POST"],
              backoff_factor=1)
adapter = HTTPAdapter(max_retries=retry)
session.mount("http://", adapter)
session.mount("https://", adapter)

def handler(request):
    try:
        data = request.json()
        url = data.get("url")
        method = data.get("method", "GET").upper()
        headers = data.get("headers", {})
        use_cf = data.get("cf", False)
        timeout = data.get("timeout", 30)

        if not url or method not in {"GET", "POST"}:
            body = json.dumps({"error": "Invalid request"})
            return body, HTTPStatus.BAD_REQUEST, {"content-type": "application/json"}

        sess = cloudscraper.create_scraper() if use_cf else session
        if method == "GET":
            resp = sess.get(url, headers=headers, timeout=timeout)
        else:
            resp = sess.post(url, headers=headers,
                             data=data.get("form_data", {}), timeout=timeout)
        return resp.content, resp.status_code, dict(resp.headers)
    except Exception as exc:
        body = json.dumps({"error": str(exc)})
        return body, HTTPStatus.INTERNAL_SERVER_ERROR, {"content-type": "application/json"}
