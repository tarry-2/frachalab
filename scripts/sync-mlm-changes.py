"""Collect dated registration and closure events from public FTC quarterly notices."""
import html
import io
import os
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

BASE = "https://www.ftc.go.kr/www/"
OUTPUT = Path(__file__).resolve().parents[1] / "public/mlm-changes.json"
TERMS = (
    "다단계판매업자 주요정보", "다단계 판매업자 주요정보",
    "다단계판매업자의 주요 정보", "다단계판매업자의 주요정보", "3분기 다단계",
    "다단계판매업자 등록변경사항", "다단계 판매업자 등록변경사항",
)
LIMIT = 8_000_000


def get(url):
    with urlopen(Request(url, headers={"User-Agent": "Frachalab/1.0 FTC public notices reader"}), timeout=20) as response:
        if not response.geturl().startswith(BASE):
            raise ValueError("공정위 주소를 확인할 수 없습니다.")
        body = response.read(LIMIT + 1)
    if len(body) > LIMIT:
        raise ValueError("공정위 파일 크기가 예상 범위를 넘었습니다.")
    return body


def find_notices():
    notices = {}
    for term in TERMS:
        for page in (1, 2, 3):
            query = urlencode(dict(key=12, bordCd=3, searchCtgry="01,02", searchCnd="SJ", searchKrwd=term, pageIndex=page))
            body = html.unescape(get(BASE + "selectBbsNttList.do?" + query).decode("utf-8"))
            entries = re.findall(r'<a href="[^"]*selectBbsNttView\.do\?[^"]*?nttSn=(\d+)[^"]*">\s*<span class="p-table__text">([^<]+)</span>', body)
            if not entries:
                break
            for identifier, title in entries:
                match = re.search(r"(?<!\d)(20\d{2}|\d{2})\s*년(?:도)?\s*([1-4])\s*(?:/\s*4\s*)?분기\s*다단계\s*판매", title)
                if match:
                    year = int(match[1]) + (2000 if len(match[1]) == 2 else 0)
                    notices[(year, int(match[2]), int(identifier))] = BASE + f"selectBbsNttView.do?key=12&bordCd=3&nttSn={identifier}"
    if not notices:
        raise ValueError("공정위 분기 공지를 찾지 못했습니다.")
    return notices


def parse_notice(body, year, quarter):
    events = []
    categories = {"등록일자": "신규 등록", "등록일": "신규 등록", "폐업일자": "폐업", "폐업일": "폐업", "휴업일자": "휴업", "휴업일": "휴업", "등록취소일자": "등록취소", "취소일자": "등록취소"}
    with zipfile.ZipFile(io.BytesIO(body)) as document:
        sections = [item for item in document.infolist() if re.fullmatch(r"Contents/section\d+\.xml", item.filename)]
        for section in sections:
            if section.file_size > LIMIT:
                raise ValueError("공시 표 크기가 예상 범위를 넘었습니다.")
            root = ET.fromstring(document.read(section))
            for table in root.findall(".//{*}tbl"):
                rows = [[" ".join("".join(p.itertext()).strip() for p in cell.findall("./{*}subList/{*}p")).strip()
                         for cell in row.findall("./{*}tc")] for row in table.findall("./{*}tr")]
                if not rows:
                    continue
                header = [re.sub(r"\s+", "", text) for text in rows[0]]
                header = [{"회사명":"상호","업체명":"상호","다단계판매업등록번호":"등록번호"}.get(field,field) for field in header]
                if "등록번호" not in header or "상호" not in header:
                    continue
                date_col = next((i for i, field in enumerate(header) if field in categories or field == "신고사항"), None)
                if date_col is None:
                    continue
                for row in rows[1:]:
                    required = [date_col, header.index("상호"), header.index("등록번호")]
                    if not row or len(row) <= max(required) or ("연번" in header and not row[header.index("연번")].isdigit()):
                        continue
                    name, registration = row[header.index("상호")], row[header.index("등록번호")]
                    if not name or not registration:
                        continue
                    status = categories.get(header[date_col])
                    raw_date = row[date_col]
                    if header[date_col] == "신고사항":
                        status = {"폐업":"폐업","폐업신고":"폐업","등록취소":"등록취소","휴업":"휴업"}.get(re.sub(r"\s+", "", raw_date))
                        if status is None:
                            continue
                        raw_date = row[date_col + 1] if len(row) > date_col + 1 else ""
                    found = re.search(r"(\d{2,4})\D+(\d{1,2})\D+(\d{1,2})", raw_date)
                    if not name or not registration or not found:
                        raise ValueError("공시에 기재된 업체 또는 변동일을 해석하지 못했습니다.")
                    yyyy, month, day = map(int, found.groups())
                    when = date(yyyy + (2000 if yyyy < 100 else 0), month, day)
                    if when.year != year or (when.month - 1) // 3 + 1 != quarter:
                        raise ValueError("공시 분기와 변동 날짜가 일치하지 않습니다.")
                    events.append(dict(name=name, registration=registration, region=row[header.index("지역")] if "지역" in header else "",
                                       date=when.isoformat(), category=status))
    return events


def main():
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {"quarters": {}}
    quarters = dict(previous["quarters"])
    today = datetime.now(ZoneInfo("Asia/Seoul")).date()
    for (year, quarter, identifier), source in sorted(find_notices().items()):
        key = f"{year}-{quarter}"
        current_id = quarters.get(key, {}).get("id", 0)
        if current_id > identifier or (current_id == identifier and year < today.year - 1 and not os.getenv("FTC_REPARSE_HISTORY")):
            continue
        page = html.unescape(get(source).decode("utf-8"))
        attachment = re.search(r'href="\./downloadBbsFile\.do\?atchmnflNo=(\d+)"[^>]*>[^<]*\.hwpx', page, re.I)
        if not attachment:
            print(f"{key}: 구조화된 첨부를 찾지 못했습니다. 기존 분류를 유지합니다.")
            continue
        try:
            events = parse_notice(get(BASE + "downloadBbsFile.do?atchmnflNo=" + attachment[1]), year, quarter)
        except (ValueError, IndexError, ET.ParseError, zipfile.BadZipFile) as error:
            print(f"{key}: {error} 기존 분류를 유지합니다.")
            continue
        if not events:
            print(f"{key}: 확인 가능한 변동 표가 없습니다. 기존 분류를 유지합니다.")
            continue
        unique = {(event["registration"], event["date"], event["category"]): event for event in events}
        quarters[key] = dict(id=identifier, source=source, events=list(unique.values()))
    if not quarters:
        raise ValueError("확인된 분기 자료가 없습니다.")
    result = dict(checked=today.isoformat(), quarters=quarters)
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    temporary.replace(OUTPUT)
    for key, item in sorted(quarters.items()):
        print(key, len(item["events"]))


if __name__ == "__main__":
    main()
