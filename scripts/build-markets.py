"""Aggregate a public SEMAS nationwide ZIP into district and industry counts."""
import csv
import io
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from zipfile import ZipFile

archive, date, output = sys.argv[1:]
industries = {}
files = 0
regions = defaultdict(lambda: defaultdict(Counter))
with ZipFile(archive) as source:
    for member in source.infolist():
        if not member.filename.endswith(".csv"):
            continue
        files += 1
        with io.TextIOWrapper(source.open(member), encoding="utf-8-sig", newline="") as stream:
            rows = csv.reader(stream)
            header = next(rows)
            columns = [header.index(name) for name in (
                "시도명", "시군구명", "상권업종소분류코드", "상권업종소분류명"
            )]
            for row in rows:
                province, district, code, category = (row[index] for index in columns)
                if province and code:
                    industries[code] = category
                    regions[province][district or province][code] += 1

if files < 16 or len(regions) < 16:
    raise ValueError("전국 시도 자료가 필요합니다.")
result = {
    "date": date,
    "source": "https://www.data.go.kr/data/15083033/fileData.do",
    "industries": industries,
    "regions": regions,
}
Path(output).write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n")
