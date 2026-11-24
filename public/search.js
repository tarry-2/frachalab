import './theme.js';
import { franchiseMetric } from './franchise-metrics.js';

const get = id => document.getElementById('disclosure-' + id);
const number = new Intl.NumberFormat('ko-KR');
const pageSize = 15;
const types = {
  franchise: '프랜차이즈',
  mlm: '다단계판매 실적',
  change: '등록 변동',
  life: '생명보험',
  nonlife: '손해보험',
  ga: '법인보험대리점(GA)',
};
const endpoints = [
  ['franchise','/catalog.json'],
  ['mlm','/mlm.json'],
  ['change','/mlm-changes.json'],
  ['life','/insurance-life.json'],
  ['nonlife','/insurance-nonlife.json'],
  ['ga','/insurance-ga.json'],
];
const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase()
  .replace(/\(주\)|\(유\)|주식회사|유한회사/g,'').replace(/[^\p{L}\p{N}]/gu,'');
const aliases = new Map([['메가커피','메가엠지씨커피'],['컴포즈','컴포즈커피']]);
let index = [], matches = [], unavailable = [], page = 0, ready = false;
const node = (tag,text,className) => {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const metric = (row,key,value,unit) => row.conflicts?.includes(key) ? '확인 필요' :
  typeof value === 'number' ? number.format(value) + unit : '미공개';
const linkTo = (path,params,hash = '') => path + '?' + new URLSearchParams(params) + hash;

function fromSource(type,data) {
  const insuranceLink = (query, filters = {}) => linkTo('/research.html', {
    view: 'insurance', insuranceType: type, insuranceQuery: query, ...filters,
  });
  if (type === 'life') return data.companies.map(row => ({
    title: row.name.endsWith('생명') ? row.name : row.name + '생명',
    year: String(data.year), type, terms: [row.name, row.name + '생명보험'],
    facts: [['수입보험료', metric(row, 'premiums', row.premiums, '백만원')]],
    href: insuranceLink(row.name), source: data.file || data.source,
  }));
  if (type === 'nonlife') return data.companies.flatMap(row =>
    Object.entries(row.share).map(([year, share]) => ({
      title: row.name, year, type, terms: [row.name],
      facts: [['보험료 점유율', metric(row, 'share', share, '%')]],
      href: insuranceLink(row.name, {nonlifeYear: year}),
      source: data.source,
    })));
  if (type === 'ga') return Object.entries(data.periods).flatMap(([period, rows]) =>
    rows.map(row => ({
      title: row.name, year: period.slice(0, 4), type,
      context: (period.endsWith('06') ? '상반기' : '12월') + (row.registration ? ' · ' + row.registration : ''),
      terms: [row.name, row.registration, row.address, row.region],
      facts: [['설계사 수', metric(row, 'agents', row.agents, '명')]],
      href: insuranceLink(row.registration || row.name, {gaPeriod: period}), source: data.source,
    })));
  if (type === 'franchise') return Object.entries(data.years).flatMap(([year,rows]) =>
    rows.map(row => ({
      title:row.name, year, type, terms:[row.name,row.company,row.category,row.sector],
      context:[row.company,row.category].filter(Boolean).join(' · '),
      facts:[['가맹점','stores','개'],['점포당 연매출','revenue','원'],['공개 창업비용','cost','원']]
        .map(([name,key,unit]) => {
          const {value,label} = franchiseMetric(row,key);
          return [name, typeof value === 'number' ? label + unit : label];
        }),
      href:linkTo('/',{year,q:row.name,id:row.id},'#ranking'),
    })));
  if (type === 'mlm') return Object.entries(data.years).flatMap(([year,dataset]) =>
    dataset.companies.map(row => ({
      title:row.name, year, type, terms:[row.name,row.registration], context:row.registration,
      facts:[['다단계 매출',metric(row,'sales',row.sales,'원')],['등록 판매원',metric(row,'sellers',row.sellers,'명')],['후원수당',metric(row,'commissions',row.commissions,'원')]],
      href:linkTo('/mlm.html',{year,q:row.name,registration:row.registration},'#mlm-ranking'),
      source:dataset.download,
    })));
  return Object.entries(data.quarters).flatMap(([key,notice]) => notice.events.map(event => ({
    title:event.name, year:event.date.slice(0,4), type, state:event.category, date:event.date,
    terms:[event.name,event.registration,event.region,event.category],
    context:[event.region,event.registration].filter(Boolean).join(' · '),
    facts:[['변동일',event.date],['구분',event.category]],
    href:linkTo('/mlm.html',{changeYear:event.date.slice(0,4),changeQuery:event.name,changeState:event.category},'#mlm-changes'),
    source:notice.source,
  })));
}
function renderPage() {
  const results = get('results');
  const fragment = document.createDocumentFragment();
  for (const item of matches.slice(page*pageSize,(page+1)*pageSize)) {
    const article = node('article',null,'disclosure-card');
    const heading = node('h2');
    const name = node('a',item.title);
    name.href = item.href;
    heading.append(name);
    const info = node('p',[types[item.type],item.year && item.year + '년',item.context].filter(Boolean).join(' · '),'disclosure-caption');
    const list = node('dl',null,'disclosure-facts');
    for (const [label,value] of item.facts) {
      const group = node('div');
      group.append(node('dt',label),node('dd',value));
      list.append(group);
    }
    article.append(info,heading,list);
    if (item.source) {
      const source = node('a','공식 원문','disclosure-source');
      source.href = item.source;
      article.append(source);
    }
    fragment.append(article);
  }
  results.replaceChildren(fragment);
  const pages = Math.max(1, Math.ceil(matches.length/pageSize));
  const filtered = [get('query').value.trim(),get('type').value,get('year').value,get('state').value].some(Boolean);
  const status = !filtered ? '회사명, 브랜드명, 등록번호를 입력하거나 자료 구분을 선택해 봐.' :
    matches.length ? '검색 결과 ' + number.format(matches.length) + '건' : '일치하는 공시가 없어. 다른 이름이나 연도를 검색해 봐.';
  get('status').textContent = [status, unavailable.length ? unavailable.join(', ') + ' 자료는 현재 불러오지 못했어.' : ''].filter(Boolean).join(' · ');
  get('page').textContent = matches.length ? (page+1) + ' / ' + pages : '';
  get('prev').disabled = page === 0;
  get('next').disabled = page + 1 >= pages;
}
function search(updateUrl = true) {
  if (!ready) return;
  const input = get('query').value;
  const clean = normalize(input);
  const candidates = [clean,aliases.get(clean)].filter(Boolean);
  const type = get('type').value;
  const year = get('year').value;
  if (type && type !== 'change') get('state').value = '';
  get('status-field').hidden = Boolean(type && type !== 'change');
  const state = get('state').value;
  const rank = record => {
    if (!candidates.length) return 1;
    if (candidates.includes(record.nameKey)) return 3;
    if (candidates.some(q => record.nameKey.startsWith(q))) return 2;
    return Number(candidates.some(q => record.keys.some(key => key.includes(q))));
  };
  matches = input.trim() || type || year || state ? index
    .filter(row => (!type || row.type === type) && (!year || row.year === year) && (!state || row.state === state))
    .map(row => ({row,rank:input.trim() && !candidates.length ? 0 : rank(row)})).filter(result => result.rank)
    .sort((a,b) => b.rank - a.rank || b.row.year.localeCompare(a.row.year) || (b.row.date || '').localeCompare(a.row.date || '') || a.row.title.localeCompare(b.row.title,'ko'))
    .map(result => result.row) : [];
  if (updateUrl) {
    const params = new URLSearchParams();
    for (const [key,value] of Object.entries({q:input.trim(),type,year,state})) if (value) params.set(key,value);
    history.replaceState(null,'',params.size ? '?' + params : location.pathname);
  }
  page = 0;
  renderPage();
}
get('search').addEventListener('submit',event => { event.preventDefault(); search(); });
get('query').addEventListener('input',() => search());
for (const id of ['type','year','state']) get(id).addEventListener('change',() => search());
get('prev').addEventListener('click',() => { page--; renderPage(); });
get('next').addEventListener('click',() => { page++; renderPage(); });
const settled = await Promise.allSettled(endpoints.map(async ([type,url]) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('공시 자료 응답 오류');
  return fromSource(type,await response.json());
}));
settled.forEach((result,i) => {
  if (result.status === 'rejected') unavailable.push(types[endpoints[i][0]]);
  else index.push(...result.value.map(row => ({...row,nameKey:normalize(row.title),keys:row.terms.map(normalize).filter(Boolean)})));
});
for (const year of [...new Set(index.map(row => row.year).filter(Boolean))].sort().reverse()) {
  const option = node('option',year + '년');
  option.value = year;
  get('year').append(option);
}
const url = new URLSearchParams(location.search);
for (const [key,id] of [['q','query'],['type','type'],['year','year'],['state','state']]) {
  const value = url.get(key);
  const field = get(id);
  if (value && (id === 'query' || [...field.options].some(option => option.value === value))) field.value = value;
}
ready = true;
search(false);
