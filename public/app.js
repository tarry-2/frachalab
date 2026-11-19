const element = id => document.getElementById(id);
const theme = element('theme-toggle');
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
const root = document.documentElement;

function updateThemeButton() {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : systemTheme.matches;
  theme.setAttribute('aria-pressed', String(dark));
  theme.textContent = dark ? '라이트' : '다크';
  theme.title = dark ? '라이트 모드로 전환' : '다크 모드로 전환';
}
theme.addEventListener('click', () => {
  const next = theme.getAttribute('aria-pressed') === 'true' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('frachalab-theme', next); } catch {}
  updateThemeButton();
});
systemTheme.addEventListener('change', updateThemeButton);
updateThemeButton();

const number = new Intl.NumberFormat('ko-KR');
const collator = new Intl.Collator('ko');
const pageSize = 20;
const selected = new Set();
let catalog, page = 0, rows = [], shown = [];
const metrics = {stores:'가맹점 수', revenue:'점포당 연매출', cost:'공개 창업비용'};
const details = [['stores','가맹점 수'],['revenue','점포당 연매출'],['cost','공개 창업비용'],['fee','가맹비'],['education','교육비'],['deposit','보증금'],['other','기타 비용'],['opened','신규 등록'],['ended','계약 종료'],['cancelled','계약 해지'],['transferred','명의 변경'],['started','가맹사업 개시일']];
const counts = new Set(['stores','opened','ended','cancelled','transferred']);
const make = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const value = (key, val) => {
  if (val == null) return '미공개';
  if (typeof val === 'string') return val;
  return number.format(val) + (counts.has(key) ? '개' : '원');
};
function reportedValue(row, key) {
  return row.conflicts?.includes(key) ? '확인 필요' : value(key, row[key]);
}
function logo(row) {
  const fallback = make('span', [...row.name].slice(0, 2).join(''), 'logo');
  fallback.setAttribute('aria-hidden', 'true');
  if (!row.image || !/^(?:\/images\/[\w.-]+|https:\/\/img\.mega-mgccoffee\.com\/megahp\/common\/img\/new_logo_b\.png)$/.test(row.image)) return fallback;
  const image = make('img', undefined, 'logo');
  image.src = row.image;
  image.alt = row.name + ' 브랜드 이미지';
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => image.replaceWith(fallback), {once:true});
  return image;
}
function addOption(select, label, val) {
  const option = make('option', label);
  option.value = val;
  select.append(option);
}
function currentYear() { return element('year').value; }
function compareButton(row) {
  const button = make('button', selected.has(row.id) ? '선택됨' : '추가', 'compare-btn');
  button.type = 'button';
  button.dataset.compare = row.id;
  button.setAttribute('aria-label', row.name + ' 비교');
  button.addEventListener('click', () => {
    if (selected.has(row.id)) selected.delete(row.id);
    else if (selected.size < 4) selected.add(row.id);
    updateCompare();
  });
  return button;
}
function updateCompare() {
  element('chosen-count').textContent = selected.size;
  document.querySelectorAll('[data-compare]').forEach(button => {
    const active = selected.has(button.dataset.compare);
    button.textContent = active ? '선택됨' : '추가';
    button.setAttribute('aria-pressed', active);
    button.disabled = !active && selected.size === 4;
  });
}
function dialog(title, body) {
  element('panel-title').textContent = title;
  element('panel-body').replaceChildren(body);
  if (!element('panel').open) element('panel').showModal();
}
function detail(row, rank) {
  const body = make('div');
  const heading = make('div', undefined, 'detail-brand');
  const identity = make('div');
  identity.append(make('h3', row.name), make('p', [row.company, row.category, currentYear() && currentYear() + '년 기준'].filter(Boolean).join(' · ')));
  heading.append(logo(row), identity);
  const facts = make('dl', undefined, 'detail-grid');
  for (const [key, label] of details) {
    const item = make('div');
    item.append(make('dt', label), make('dd', reportedValue(row, key)));
    facts.append(item);
  }
  const actions = make('div', undefined, 'detail-actions');
  const source = make('a', '공정위 정보공개서 검색');
  source.href = 'https://franchise.ftc.go.kr/';
  actions.append(compareButton(row), source);
  const note = catalog.preview
    ? '기존 자료에 있던 브랜드 목록이야. 공시 원본을 확인하기 전에는 수치와 순위를 표시하지 않아.'
    : (rank ? metrics[element('metric').value] + ' 기준 ' + number.format(rank) + '위 · ' : '') + '미공개 또는 확인 필요 항목은 정보공개서에서 확인해.';
  body.append(heading, facts, make('p', note, 'detail-note'), actions);
  dialog('브랜드 상세', body);
  updateCompare();
}
function compare() {
  if (!selected.size) {
    dialog('브랜드 비교', make('p','순위 목록에서 비교할 브랜드를 최대 4개 골라줘.'));
    return;
  }
  const brands = rows.filter(row => selected.has(row.id));
  const frame = make('div', undefined, 'table-frame');
  const table = make('table');
  const thead = make('thead');
  const heading = make('tr');
  heading.append(make('th', '비교 항목'));
  for (const brand of brands) heading.append(make('th',brand.name));
  thead.append(heading);
  const tbody = make('tbody');
  for (const [label, getter] of [['업종', b => b.category], ['가맹본부', b => b.company || '미공개'], ...details.map(([key,label]) => [label, b => reportedValue(b,key)])]) {
    const row = make('tr');
    const caption = make('th',label);
    caption.scope = 'row';
    row.append(caption, ...brands.map(brand => make('td',getter(brand))));
    tbody.append(row);
  }
  table.append(thead, tbody);
  frame.append(table);
  const content = make('div');
  content.append(make('p',catalog.preview ? '미리보기 · 공시 수치 확인 전' : currentYear() + '년 공시 기준'), frame);
  dialog('브랜드 비교', content);
}
function lookup(text) { return String(text ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g,''); }
function refresh() {
  const category = element('industry').value;
  const key = element('metric').value;
  const query = lookup(element('query').value);
  const sorted = rows.filter(r => !category || r.category === category).sort((a,b) => {
    const left = a[key], right = b[key];
    if (left == null && right != null) return 1;
    if (right == null && left != null) return -1;
    return (key === 'cost' ? left - right : right - left) || collator.compare(a.name,b.name);
  });
  let previous, rank = 0;
  shown = sorted.map((row,i) => {
    const current = row[key];
    if (current != null && current !== previous) rank = i + 1;
    previous = current;
    return {row,rank:current == null ? null : rank};
  }).filter(({row}) => !query || [row.name,row.company,row.category].some(text => lookup(text).includes(query)));
  renderPage();
}
function renderPage() {
  const list = element('results');
  const fragment = document.createDocumentFragment();
  for (const {row,rank} of shown.slice(page * pageSize, (page + 1) * pageSize)) {
    const tr = make('tr');
    const name = make('button',row.name,'name-button');
    name.type = 'button';
    name.addEventListener('click', () => detail(row,rank));
    const brand = make('div',undefined,'brand-cell');
    brand.append(logo(row),name);
    const brandCell = make('td');
    brandCell.append(brand);
    const action = make('td');
    action.append(compareButton(row));
    tr.append(make('td',rank == null ? '—' : number.format(rank)),brandCell,make('td',row.category),...Object.keys(metrics).map(key => make('td',reportedValue(row,key),'metric')),action);
    fragment.append(tr);
  }
  if (!shown.length) {
    const empty = make('td','조건에 맞는 브랜드가 없어. 검색어나 업종을 바꿔 봐.','empty');
    empty.colSpan = 7;
    const tr = make('tr');
    tr.append(empty);
    fragment.append(tr);
  }
  list.replaceChildren(fragment);
  const pages = Math.max(1,Math.ceil(shown.length / pageSize));
  element('result-count').textContent = number.format(shown.length) + '개 브랜드';
  element('page-number').textContent = (page + 1) + ' / ' + pages;
  element('prev').disabled = page === 0;
  element('next').disabled = page + 1 >= pages;
  updateCompare();
}
function changeYear() {
  rows = catalog.years[currentYear()] || [];
  selected.clear();
  page = 0;
  const categories = [...new Set(rows.map(row => row.category))].sort(collator.compare);
  const industry = element('industry');
  industry.replaceChildren();
  addOption(industry,'전체 업종','');
  for (const category of categories) addOption(industry,category,category);
  element('brand-count').textContent = number.format(rows.length) + '개';
  element('industry-count').textContent = number.format(categories.length) + '개';
  element('snapshot-year').textContent = currentYear() ? currentYear() + '년 공시' : '미리보기';
  refresh();
}
element('open-compare').addEventListener('click',compare);
element('year').addEventListener('change',changeYear);
for (const id of ['query','industry','metric']) element(id).addEventListener(id === 'query' ? 'input' : 'change',() => {
  if (!catalog) return;
  page = 0;
  refresh();
});
element('prev').addEventListener('click',() => { page--; renderPage(); });
element('next').addEventListener('click',() => { page++; renderPage(); });
try {
  const reply = await fetch('/catalog.json');
  if (!reply.ok) throw new Error('데이터 응답 오류');
  catalog = await reply.json();
  const years = Object.keys(catalog.years).sort().reverse();
  for (const year of years) addOption(element('year'),year,year);
  element('year-control').hidden = years.length < 2;
  const status = element('data-status');
  if (catalog.preview) {
    status.classList.add('preview');
    status.textContent = '미리보기 · 기존 수집 목록만 표시 중이야. 공정위 데이터가 연동되면 공시 수치와 전체·업종별 순위가 표시돼.';
  } else {
    const date = new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeZone:'Asia/Seoul'}).format(new Date(catalog.checkedAt));
    status.textContent = '공정거래위원회 정보공개서 · 마지막 동기화 ' + date + ' · 공시 기준 연도와 동기화 날짜는 달라.';
  }
  changeYear();
} catch (error) {
  element('data-status').textContent = '데이터를 읽지 못했어. 잠시 뒤 다시 열어 봐.';
  element('prev').disabled = element('next').disabled = true;
  console.error(error);
}
