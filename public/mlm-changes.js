const get = key => document.getElementById('changes-' + key);
const cell = (tag, text) => {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
};
const categories = ['신규 등록','휴업','폐업','등록취소'];
let catalog;

function render() {
  const year = get('year').value;
  const filter = get('category').value;
  const quarters = Object.entries(catalog.quarters).filter(([key]) => key.startsWith(year + '-'));
  const entries = quarters.flatMap(([key,item]) => item.events.map(event => ({...event,quarter:key.split('-')[1],source:item.source})));
  const visible = entries.filter(event => !filter || event.category === filter)
    .sort((a,b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name,'ko'));
  const fragment = document.createDocumentFragment();
  for (const event of visible) {
    const tr = document.createElement('tr');
    const link = cell('a',event.quarter + '분기 원문');
    link.href = event.source;
    const source = document.createElement('td');
    source.append(link);
    tr.append(cell('td',event.date),cell('td',event.category),cell('td',event.name),cell('td',[event.region,event.registration].filter(Boolean).join(' · ')),source);
    fragment.append(tr);
  }
  if (!visible.length) {
    const empty = cell('td','확인된 분기 공지에서 이 구분에 해당하는 항목이 없어.');
    empty.colSpan = 5;
    empty.className = 'empty';
    const row = document.createElement('tr');
    row.append(empty);
    fragment.append(row);
  }
  get('results').replaceChildren(fragment);
  const counts = categories.map(category => category + ' ' + entries.filter(event => event.category === category).length + '건');
  const coverage = quarters.map(([key]) => Number(key.split('-')[1])).sort().map(quarter => quarter + '분기').join(', ');
  get('status').textContent = [year + '년 확인 범위 ' + coverage,...counts,'마지막 확인 ' + catalog.checked].join(' · ');
}

try {
  const response = await fetch('/mlm-changes.json');
  if (!response.ok) throw new Error('공정위 변동 자료를 읽지 못했습니다.');
  catalog = await response.json();
  for (const year of [...new Set(Object.keys(catalog.quarters).map(key => key.split('-')[0]))].sort().reverse()) {
    const option = cell('option',year + '년');
    option.value = year;
    get('year').append(option);
  }
  get('year').addEventListener('change',render);
  get('category').addEventListener('change',render);
  render();
} catch (error) {
  get('status').textContent = '등록 변동 자료를 읽지 못했어. 잠시 뒤 다시 열어 봐.';
  console.error(error);
}
