import './theme.js';

const pages = {
  companies: ['기업 한눈에 보기', '브랜드와 회사의 연도별 실적, 본사 소재지, 대표 연락처와 등록 변동을 찾아봐.'],
  sectors: ['프랜차이즈 업종 비교', '업종의 규모와 가맹점 변화를 연도별로 비교하고, 브랜드 순위를 확인해 봐.'],
  markets: ['전국 상권 비교', '같은 업종이 시군구별로 얼마나 모여 있는지 점포 수와 전체 점포 대비 비율로 비교해 봐.'],
  finance: ['본사 재무공시', '공정거래위원회 다단계판매업체 공시의 재무제표 수치를 회사별·연도별로 비교해 봐.'],
  insurance: ['보험사·GA 공시', '생명보험사, 손해보험사와 법인보험대리점의 공식 공시를 찾아봐.'],
};
const byId = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const view = Object.hasOwn(pages, params.get('view')) ? params.get('view') : 'companies';
const root = byId('research-results');
const [title, lead] = pages[view];
const ftc = 'https://franchise.ftc.go.kr/';
const dart = 'https://dart.fss.or.kr/dsab001/main.do';
const format = new Intl.NumberFormat('ko-KR');
const alphabetical = new Intl.Collator('ko-KR');
const missing = '미공개';
const numeric = raw => {
  if (raw == null || String(raw).trim() === '') return null;
  const value = Number(String(raw).replaceAll(',', ''));
  return Number.isFinite(value) ? value : null;
};
const amount = raw => numeric(raw) === null ? missing : format.format(numeric(raw));
const text = raw => raw == null || !String(raw).trim() ? missing : String(raw).trim();
const normalize = raw => String(raw ?? '').normalize('NFKC').replace(/\s/g, '').toLowerCase();
const registrationKey = raw => normalize(raw).replace(/[-–—]/g, '').replace(/제(?=\d)/g, '');
const dateText = raw => text(raw).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
const order = items => [...items].sort(alphabetical.compare);
const years = source => Object.keys(source).sort((a, b) => b - a);
const node = (tag, value, className) => {
  const result = document.createElement(tag);
  if (value !== undefined) result.textContent = value;
  if (className) result.className = className;
  return result;
};
function link(label, url) {
  const anchor = node('a', label);
  anchor.href = url;
  return anchor;
}
function source(label, url) {
  const paragraph = node('p', undefined, 'research-sources');
  paragraph.append(link(label, url));
  return paragraph;
}
function table(headers, rows) {
  const frame = node('div', undefined, 'table-frame');
  const grid = node('table');
  const header = grid.createTHead().insertRow();
  for (const label of headers) {
    const cell = node('th', label);
    cell.scope = 'col';
    header.append(cell);
  }
  const body = grid.createTBody();
  for (const values of rows) {
    const row = body.insertRow();
    for (const value of values) {
      const cell = row.insertCell();
      if (value instanceof Node) cell.append(value);
      else cell.textContent = value;
    }
  }
  frame.append(grid);
  return frame;
}
function field(label, input, options) {
  const wrapper = node('label', label);
  if (options) for (const [value, name] of options) input.add(new Option(name, value));
  wrapper.append(input);
  return wrapper;
}
function setParams(values) {
  params.set('view', view);
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  history.replaceState(null, '', '?' + params);
}
async function get(name) {
  const response = await fetch('/' + name + '.json');
  if (!response.ok) throw new Error(name);
  return response.json();
}
function selectOption(input, value) {
  if ([...input.options].some(option => option.value === value)) input.value = value;
}
function contact(raw) {
  const phone = text(raw);
  return /^\+?[\d ()-]{7,25}$/.test(phone) && phone.replace(/\D/g, '').length >= 7
    ? link(phone, 'tel:' + phone.replace(/[^+\d]/g, '')) : phone;
}
function details(rows) {
  const list = node('dl', undefined, 'detail-grid');
  for (const [label, value] of rows) {
    const pair = node('div');
    const description = node('dd');
    description.append(value);
    pair.append(node('dt', label), description);
    list.append(pair);
  }
  return list;
}
async function companies() {
  const [franchise, mlm, changes] = await Promise.all([get('catalog'), get('mlm'), get('mlm-changes')]);
  const grouped = new Map();
  function add(key, type, year, row, download) {
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({type, year, row, download});
  }
  for (const year of years(franchise.years)) {
    for (const row of franchise.years[year]) add('f-' + row.id, '프랜차이즈', year, row, ftc);
  }
  for (const year of years(mlm.years)) {
    const period = mlm.years[year];
    for (const row of period.companies) {
      const key = row.registration ? 'm-' + registrationKey(row.registration) : 'm-' + normalize(row.name);
      add(key, '다단계판매', year, row, period.download || mlm.source);
    }
  }
  const form = node('form', undefined, 'filters');
  const query = node('input');
  query.type = 'search';
  query.placeholder = '예: 애터미, 힐리빙, 메가커피';
  query.value = params.get('q') || '';
  const button = node('button', '검색', 'compare-btn');
  const picker = node('select');
  const output = node('section');
  const pickerField = field('업체 선택', picker);
  form.append(field('회사명·브랜드·등록번호', query), button, pickerField);
  root.append(form, output);
  function show() {
    const history = grouped.get(picker.value);
    setParams({q: query.value.trim(), id: picker.value});
    output.replaceChildren();
    if (!history) {
      output.append(node('p', query.value.trim() ? '검색 결과가 없어.' : '회사명이나 브랜드를 입력해 봐.'));
      return;
    }
    const {row, type, download, year} = history[0];
    const isMlm = type === '다단계판매';
    output.append(node('h2', row.name), node('p', year + '년 기준 · ' + type));
    output.append(details([
      ['가맹본부·회사', text(row.company || row.name)],
      ['본사 소재지', isMlm ? text(row.details?.[3]) : text(row.address)],
      ['대표 연락처', contact(isMlm ? row.details?.[4] : row.phone)],
      [isMlm ? '등록번호' : '가맹사업 개시일', text(isMlm ? row.registration : row.started)],
      ...(isMlm ? [['등록일', dateText(row.details?.[2])]] : []),
    ]));
    if (download) output.append(source(isMlm ? '공시 원문 확인' : '가맹사업거래에서 정보공개서 검색', download));
    if (!isMlm && (!row.address || !row.phone)) output.append(node('p', '가맹본부 주소와 전화번호는 정보공개서 원문에서 확인해 줘.', 'research-sources'));
    output.append(node('h3', '연도별 실적'), isMlm
      ? table(['기준 연도', '다단계판매 매출 (원)', '등록 판매원', '후원수당 (원)'],
        history.map(item => [item.year, amount(item.row.sales), amount(item.row.sellers), amount(item.row.commissions)]))
      : table(['기준 연도', '가맹점 수', '점포당 연매출 (원)', '공개 창업비용 (원)'],
        history.map(item => [item.year, amount(item.row.stores), amount(item.row.revenue), amount(item.row.cost)])));
    if (!isMlm || !row.registration) return;
    const events = Object.values(changes.quarters).flatMap(quarter => quarter.events
      .filter(event => event.registration && registrationKey(event.registration) === registrationKey(row.registration))
      .map(event => [event.date, event.category, event.region, link('공시 원문', quarter.source)]));
    events.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    output.append(node('h3', '등록 변동'), events.length
      ? table(['일자', '구분', '지역', '출처'], events)
      : node('p', '등록번호가 일치하는 공시 내역이 없어.'));
  }
  function find(selected) {
    const keyword = normalize(query.value);
    const matches = keyword ? [...grouped].filter(([, rows]) => rows.some(({row}) =>
      [row.name, row.company, row.registration].some(value => normalize(value).includes(keyword)))) : [];
    if (selected && grouped.has(selected) && !matches.some(([key]) => key === selected)) {
      matches.unshift([selected, grouped.get(selected)]);
    }
    matches.sort((a, b) => alphabetical.compare(a[1][0].row.name, b[1][0].row.name));
    picker.replaceChildren();
    for (const [key, history] of matches) {
      const {row, type} = history[0];
      picker.add(new Option(row.name + ' · ' + (row.company || row.registration || type), key));
    }
    selectOption(picker, selected);
    pickerField.hidden = !matches.length;
    show();
  }
  form.addEventListener('submit', event => { event.preventDefault(); find(); });
  picker.addEventListener('change', show);
  find(params.get('id'));
}
function sum(rows, key) {
  const known = rows.map(row => numeric(row[key])).filter(value => value !== null);
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
}
async function sectors() {
  const data = await get('catalog');
  const periods = years(data.years);
  const categories = order(new Set(Object.values(data.years).flat().map(row => row.category).filter(Boolean)));
  const category = node('select');
  const year = node('select');
  const metric = node('select');
  const metrics = [['stores', '가맹점 수'], ['revenue', '점포당 연매출'], ['cost', '공개 창업비용']];
  const filters = node('div', undefined, 'filters');
  filters.append(field('업종', category, [['all', '전 업종'], ...categories.map(name => [name, name])]),
    field('순위 기준 연도', year, periods.map(value => [value, value])), field('순위 기준', metric, metrics));
  const output = node('section');
  root.append(filters, output);
  selectOption(category, params.get('category'));
  selectOption(year, params.get('year'));
  selectOption(metric, params.get('metric'));
  function render() {
    const pick = period => data.years[period].filter(row => category.value === 'all' || row.category === category.value);
    const trend = periods.map(period => {
      const rows = pick(period);
      return [period, amount(rows.length), ...['stores', 'opened', 'ended', 'cancelled'].map(key => amount(sum(rows, key)))];
    });
    const leaders = pick(year.value).filter(row => numeric(row[metric.value]) !== null)
      .sort((a, b) => numeric(b[metric.value]) - numeric(a[metric.value])).slice(0, 20);
    output.replaceChildren(node('h2', '연도별 규모와 변동'),
      table(['기준 연도', '공시 브랜드 수', '가맹점 수', '신규 등록', '계약 종료', '계약 해지'], trend),
      node('h2', year.value + '년 브랜드 상위 20위'),
      leaders.length ? table(['순위', '브랜드', '가맹점 수', '점포당 연매출 (원)', '공개 창업비용 (원)'],
        leaders.map((row, index) => [index + 1, link(row.name, '/research.html?view=companies&id=' + encodeURIComponent('f-' + row.id)),
          amount(row.stores), amount(row.revenue), amount(row.cost)])) : node('p', '공개된 순위 자료가 없어.'),
      source('공정거래위원회 가맹사업거래', ftc));
    setParams({category: category.value, year: year.value, metric: metric.value});
  }
  filters.addEventListener('change', render);
  render();
}
async function markets() {
  const data = await get('markets');
  const provinces = order(Object.keys(data.regions));
  const comparison = node('div', undefined, 'filters');
  const industry = node('select');
  const options = Object.entries(data.industries).sort((a, b) => alphabetical.compare(a[1], b[1]));
  comparison.append(field('상권 업종', industry, [['all', '전체 업종'], ...options]));
  selectOption(industry, params.get('industry'));
  const areas = ['a', 'b'].map((key, index) => {
    const province = node('select');
    const district = node('select');
    comparison.append(field('시도 ' + (index + 1), province, provinces.map(name => [name, name])),
      field('시군구 ' + (index + 1), district));
    selectOption(province, params.get(key + 'Province') || ['서울특별시', '부산광역시'][index]);
    function districts(value) {
      district.replaceChildren(new Option('시도 전체', 'all'));
      for (const name of order(Object.keys(data.regions[province.value]))) district.add(new Option(name, name));
      selectOption(district, value);
    }
    districts(params.get(key + 'District'));
    province.addEventListener('change', () => districts());
    return {key, province, district};
  });
  const output = node('section');
  root.append(node('p', data.date + ' 기준 · 소상공인시장진흥공단 상가정보 · 행정구역은 공시 원본 표기', 'data-status'),
    comparison, output, source('공공데이터포털 상가정보 원문', data.source));
  function render() {
    const saved = {industry: industry.value};
    const rows = areas.map(({key, province, district}) => {
      const districts = data.regions[province.value];
      const groups = district.value === 'all' ? Object.values(districts) : [districts[district.value]];
      const total = groups.reduce((n, group) => n + Object.values(group).reduce((a, b) => a + b, 0), 0);
      const count = industry.value === 'all' ? total : groups.reduce((n, group) => n + (group[industry.value] || 0), 0);
      saved[key + 'Province'] = province.value;
      saved[key + 'District'] = district.value;
      return [province.value + ' ' + district.selectedOptions[0].text, amount(count), amount(total),
        total ? (100 * count / total).toLocaleString('ko-KR', {maximumFractionDigits: 2}) + '%' : '—'];
    });
    setParams(saved);
    output.replaceChildren(node('h2', industry.selectedOptions[0].text + ' 점포 비교'),
      table(['지역', '선택 업종 점포 수', '전체 점포 수', '전체 대비 비율'], rows));
  }
  comparison.addEventListener('change', render);
  render();
}
async function finance() {
  const data = await get('mlm');
  const periods = years(data.years);
  const year = node('select');
  const query = node('input');
  query.type = 'search';
  query.value = params.get('q') || '';
  const filters = node('div', undefined, 'filters');
  filters.append(field('재무 기준 연도', year, periods.map(value => [value, value])), field('회사명', query));
  selectOption(year, params.get('year'));
  const output = node('section');
  root.append(node('p', '공정거래위원회 다단계판매업체 연간 공시의 재무제표 항목이야. 금액 단위는 원이야.', 'data-status'),
    filters, output, source('금융감독원 DART에서 다른 기업의 공시 검색', dart));
  function render() {
    const period = data.years[year.value];
    const keyword = normalize(query.value);
    const rows = period.companies.filter(row => normalize(row.name).includes(keyword))
      .sort((a, b) => (numeric(b.details?.[11]) ?? -Infinity) - (numeric(a.details?.[11]) ?? -Infinity));
    output.replaceChildren(node('h2', year.value + '년 재무 자료'),
      rows.length ? table(['회사', '재무제표상 매출', '당기순이익', '자산', '부채', '자본금'],
        rows.map(row => [link(row.name, '/research.html?view=companies&id=' + encodeURIComponent('m-' + (row.registration ? registrationKey(row.registration) : normalize(row.name)))),
          ...[11, 32, 34, 35, 36].map(index => amount(row.details?.[index]))])) : node('p', '검색 결과가 없어.'));
    if (period.download || data.source) output.append(source('공정거래위원회 공시 원문', period.download || data.source));
    setParams({q: query.value, year: year.value});
  }
  filters.addEventListener('input', render);
  render();
}
async function insurance() {
  const categories = [
    ['손해보험 원수사', '원수보험료와 회사별 경영공시', '손해보험협회 공시실', 'https://kpub.knia.or.kr/'],
    ['법인보험대리점(GA)', '등록 현황, 소속 설계사 수, 계약 유지율 등 공시 항목', '이클린보험서비스 GA 공시', 'https://eclean.knia.or.kr/eclean/main010m'],
  ];
  const life = await get('insurance-life');
  const ranking = [...life.companies].sort((a, b) => b.premiums - a.premiums);
  root.append(node('h2', '생명보험 원수사 순위'),
    node('p', life.year + '년 생명보험협회 통계연보 · 수입보험료 합계 기준 · 단위 백만원', 'data-status'),
    table(['순위', '보험사', '수입보험료 합계', '일반계정', '특별계정'],
      ranking.map((row, i) => [i + 1, row.name, amount(row.premiums), amount(row.general), amount(row.separate)])),
    source('생명보험협회 통계연보', life.source), source('수입보험료 원본 엑셀', life.file));
  for (const [heading, description, label, url] of categories) {
    const section = node('section');
    section.append(node('h2', heading), node('p', description), source(label, url));
    root.append(section);
  }
}
document.body.dataset.view = view;
document.title = title + ' | 산업서가';
byId('research-title').textContent = title;
byId('research-lead').textContent = lead;
document.querySelector('.research-nav a[href$="view=' + view + '"]').setAttribute('aria-current', 'page');
const art = node('img');
art.alt = '';
art.width = 1200;
art.height = 800;
art.fetchPriority = 'high';
art.src = '/images/' + view + '.webp';
byId('research-art').append(art);
byId('research-share').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    byId('research-notice').textContent = '링크를 복사했어.';
  } catch {
    byId('research-notice').textContent = '주소창에서 링크를 복사해 줘.';
  }
});
byId('research-print').addEventListener('click', () => window.print());
root.replaceChildren();
Promise.resolve().then(() => ({companies, sectors, markets, finance, insurance})[view]())
  .catch(error => {
    console.error(error);
    root.replaceChildren(node('p', '자료를 불러오지 못했어. 새로고침해서 다시 시도해 줘.', 'data-status'));
  });
