"""只读调用两版服务，学习 dict、循环、标准库 HTTP 与异常处理。"""
import json
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

path = "/api/welds/WW-08001-80-QHA/1"
for label, base in [("Node.js", "http://127.0.0.1:3001"), ("Python", "http://127.0.0.1:3002")]:
    try:
        with urlopen(base + path, timeout=10) as response:
            weld = json.load(response)
        print(label, weld["line_no"], weld["weld_no"], weld["welded_on"])
    except HTTPError as error:
        print(label, "HTTP", error.code, error.read().decode("utf-8"))
    except URLError as error:
        print(label, "请先启动服务：", str(error.reason))
