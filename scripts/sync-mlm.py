"""Read the FTC's annual public direct-selling disclosures."""
import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import xlrd

BASE = "https://www.ftc.go.kr/www/"
LIST = BASE + "selectBizMtlvlOpenList.do?key=226"
OUTPUT = Path(__file__).resolve().parents[1] / "public/mlm.json"
LIMIT = 10 * 1024 * 1024


def fetch(url):
    request = Request(url, headers={"User-Agent": "Frachalab/1.0 FTC public disclosure reader"})
    with urlopen(request, timeout=30) as response:
        if not response.geturl().startswith(BASE):
            raise ValueError("공식 다운로드 주소가 변경됐습니다.")
        body = response.read(LIMIT + 1)
    if len(body) > LIMIT:
        raise ValueError("공시 다운로드 크기가 예상 범위를 넘었습니다.")
    return body


def amount(value):
    if isinstance(value, float) and value.is_integer():
        return int(value)
    raw = str(value).strip().replace(",", "")
    return int(raw) if re.fullmatch(r"-?\d+", raw) else None


def parse_sheet(body, year):
    workbook = xlrd.open_workbook(file_contents=body)
    sheet = workbook.sheet_by_index(0)
    expected = {
        (3, 0): "회사명", (3, 2): "다단계판매업등록번호",
        (4, 11): "부가가치세 포함 매출액", (4, 12): "재무제표상 매출액",
        (4, 23): "후원수당총액", (4, 31): "전년도 등록 총판매원수",
        (4, 33): "전년도 당기순이익", (4, 60): "1인당후원수당평균지급액",
    }
    if sheet.ncols != 71 or any(sheet.cell_value(*pos).strip() != label for pos, label in expected.items()):
        raise ValueError(f"{year}년 공시 엑셀 열 구조가 달라졌습니다.")
    rows = []
    for cells in (sheet.row_values(i) for i in range(5, sheet.nrows)):
        if not any(str(value).strip() for value in cells):
            continue
        name, registration = str(cells[0]).strip(), str(cells[2]).strip()
        sales = amount(cells[11])
        if not name or not registration or sales is None or sales < 0:
            raise ValueError(f"{year}년 공시에서 회사명·등록번호·매출을 읽지 못했습니다.")
        rows.append({
            "name": name,
            "registration": registration,
            "sales": sales,
            "sellers": amount(cells[31]),
            "commissions": amount(cells[23]),
            "details": [value.strip() if isinstance(value, str) else value for value in cells[1:]],
        })
    if not rows or len({row["registration"] for row in rows}) != len(rows):
        raise ValueError(f"{year}년 공시 건수 또는 업체 등록번호를 확인하세요.")
    rows.sort(key=lambda row: (-row["sales"], row["registration"]))
    return rows


def main():
    page = fetch(LIST).decode("utf-8")
    years = sorted({int(published) for published, year in re.findall(
        r'<option\s+value="(\d{4})"[^>]*>\s*\d{4}년\s*정보공개\((\d{4})년도분\)', page
    ) if int(published) == int(year) + 1 and int(year) >= 2024}, reverse=True)
    if not years:
        raise ValueError("공정위 목록에서 공시 연도를 찾지 못했습니다.")
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {"years": {}}
    if previous["years"] and years[0] - 1 < max(map(int, previous["years"])):
        raise ValueError("공식 목록에서 최신 공시 연도가 사라졌습니다.")
    datasets = dict(previous["years"])
    for publication in years[:2]:
        query = urlencode(dict(pageUnit=10, pageIndex=1, searchCnd="all", key=226, searchYr=publication))
        url = BASE + "downloadBizMtlvlOpenExcel.do?" + query
        year = publication - 1
        rows = parse_sheet(fetch(url), year)
        old_count = len(datasets.get(str(year), {}).get("companies", []))
        if old_count and len(rows) < old_count * 0.85:
            raise ValueError(f"{year}년 업체 수가 직전 수집보다 크게 줄었습니다.")
        datasets[str(year)] = {"download": url, "companies": rows}
        print(f"{year}년 {len(rows)}개 업체 · 매출 합계 {sum(row['sales'] for row in rows):,}원")
    result = {
        "source": LIST,
        "checked": datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat(),
        "years": datasets,
    }
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    temporary.replace(OUTPUT)


if __name__ == "__main__":
    main()
