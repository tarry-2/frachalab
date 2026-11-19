import './theme.js';

const element = id => document.getElementById('mlm-' + id);
const number = new Intl.NumberFormat('ko-KR');
const pageSize = 20;
let catalog, rows = [], matches = [], page = 0;
const make = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const format = (value, unit) => value == null ? '미공개' : number.format(value) + unit;
const lookup = value => String(value).normalize('NFKC').toLowerCase().replace(/\s+/g,'');
const groups = [
  ['회사와 등록', [[1,'대표이사'],[2,'등록번호'],[3,'등록일','date'],[4,'본사 소재지'],[5,'본사 전화']]],
  ['매출과 판매원', [[11,'다단계판매 매출 · 부가세 포함','원'],[12,'재무제표상 매출','원'],[23,'후원수당 총액','원'],[24,'매출 대비 후원수당','%'],[31,'등록 판매원','명'],[32,'후원수당을 받은 판매원','명']]],
  ['재무와 소비자 보호', [[33,'당기순이익','원'],[34,'대손충당금','원'],[35,'자산','원'],[36,'부채','원'],[37,'자본금','원'],[38,'소비자피해보상 가입기관'],[39,'소비자피해보상 준비금','원'],[40,'신용등급'],[41,'신용평가기관']]],
  ['반품·환불', [[25,'요청 건수','건'],[26,'처리 건수','건'],[27,'요청 금액','원'],[28,'처리 금액','원'],[29,'담당 부서'],[30,'부서 연락처']]],
  ['최근 3년 변경 사항', [[6,'대표이사'],[7,'상호'],[8,'등기이사'],[9,'본사 소재지'],[10,'영업 양도·양수·합병']]],
  ['공시된 시정조치 내역', [[42,'의결·문서번호'],[43,'조치기관·조치일자'],[44,'위반내용'],[45,'조치내용'],[46,'비고']]],
];
function rawValue(row, index, unit) {
  const raw = String(row.details[index - 1] ?? '').trim();
  if (!raw) return '미기재';
  if (unit === 'date') return /^\d{8}$/.test(raw) ? raw.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') : raw;
  const numeric = raw.replace(/,/g,'');
  return unit && /^-?\d+(?:\.\d+)?$/.test(numeric) ? format(Number(numeric),unit) : raw;
}
function facts(row, fields) {
  const list = make('dl',undefined,'detail-grid');
  for (const [index,label,unit] of fields) {
    const box = make('div');
    box.append(make('dt',label),make('dd',rawValue(row,index,unit)));
    list.append(box);
  }
  return list;
}
function detailTable(headers, values) {
  const frame = make('div',undefined,'table-frame');
  frame.tabIndex = 0;
  const table = make('table');
  const head = table.createTHead().insertRow();
  for (const label of headers) {
    const cell = make('th',label);
    cell.scope = 'col';
    head.append(cell);
  }
  const body = table.createTBody();
  for (const valuesRow of values) {
    const row = body.insertRow();
    for (const entry of valuesRow) row.append(make('td',entry));
  }
  frame.append(table);
  return frame;
}
function distribution(row, start) {
  const labels = ['상위 1% 미만','상위 1~6% 미만','상위 6~30% 미만','상위 30~60% 미만','상위 60~100% 미만','공시 합계'];
  return detailTable(['수당 구간','총 지급액','1인당 평균'],labels.map((label,i) => [
    label, rawValue(row,start + i * 2,'원'),rawValue(row,start + i * 2 + 1,'원'),
  ]));
}
function openCompany(row) {
  const body = element('panel-body');
  const year = element('year').value;
  element('panel-title').textContent = row.name;
  body.replaceChildren(make('p',year + '년 실적 · 다단계판매 매출 ' + number.format(row.rank) + '위','detail-note'));
  for (const [heading,fields] of groups) {
    body.append(make('h3',heading),facts(row,fields));
    if (heading === '매출과 판매원') {
      const products = Array.from({length:5},(_,i) => [rawValue(row,14+i*2),rawValue(row,13+i*2,'원')]).filter(([name,amount]) => name !== '미기재' || amount !== '미기재');
      if (products.length) body.append(make('h4','매출 상위 품목'),detailTable(['품목','매출액'],products));
    }
  }
  body.append(make('h3','후원수당 지급 분포'),make('h4','후원수당을 받은 판매원 기준'),distribution(row,47),make('h4','전체 등록 판매원 기준'),distribution(row,59));
  element('panel').showModal();
}
function render() {
  const fragment = document.createDocumentFragment();
  for (const row of matches.slice(page * pageSize,(page + 1) * pageSize)) {
    const tr = make('tr');
    const name = make('button',row.name,'name-button');
    name.type = 'button';
    name.addEventListener('click',() => openCompany(row));
    const company = make('td');
    company.append(name,make('small',row.registration,'registration'));
    tr.append(make('td',number.format(row.rank)),company,make('td',format(row.sales,'원'),'metric'),make('td',format(row.sellers,'명'),'metric'),make('td',format(row.commissions,'원'),'metric'));
    fragment.append(tr);
  }
  if (!matches.length) {
    const empty = make('td','검색 결과가 없어. 회사명이나 등록번호를 다시 확인해 봐.','empty');
    empty.colSpan = 5;
    const row = make('tr');
    row.append(empty);
    fragment.append(row);
  }
  element('results').replaceChildren(fragment);
  const pages = Math.max(1,Math.ceil(matches.length/pageSize));
  element('results-count').textContent = number.format(matches.length) + '개 업체';
  element('page').textContent = (page + 1) + ' / ' + pages;
  element('prev').disabled = page === 0;
  element('next').disabled = page + 1 >= pages;
}
function search() {
  const query = lookup(element('query').value);
  matches = rows.filter(row => [row.name,row.registration].some(value => lookup(value).includes(query)));
  page = 0;
  render();
}
function changeYear() {
  const year = element('year').value;
  const dataset = catalog.years[year];
  let rank = 0;
  rows = dataset.companies.map((row,index,list) => {
    if (row.sales !== list[index - 1]?.sales) rank = index + 1;
    return {...row,rank};
  });
  element('reference').textContent = year + '년';
  element('company-count').textContent = format(rows.length,'개');
  element('total').textContent = format(rows.reduce((sum,row) => sum + row.sales,0),'원');
  element('download').href = dataset.download;
  element('download').hidden = false;
  search();
}
element('prev').addEventListener('click',() => { page--; render(); });
element('next').addEventListener('click',() => { page++; render(); });
try {
  const response = await fetch('/mlm.json');
  if (!response.ok) throw new Error('자료 응답 오류');
  catalog = await response.json();
  for (const year of Object.keys(catalog.years).sort().reverse()) {
    const option = make('option',year + '년');
    option.value = year;
    element('year').append(option);
  }
  element('status').textContent = '공정거래위원회 다단계판매사업자 정보공개 · 마지막 확인 ' + catalog.checked;
  element('query').addEventListener('input',search);
  element('year').addEventListener('change',changeYear);
  changeYear();
} catch (error) {
  element('status').textContent = '공시 자료를 읽지 못했어. 잠시 뒤 다시 열어 봐.';
  console.error(error);
}
