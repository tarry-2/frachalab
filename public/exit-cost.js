import './theme.js';

const form = document.querySelector('#exit-form');
const error = document.querySelector('#exit-error');
const format = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
const outputs = ['in', 'out', 'net', 'early'].map(key => document.querySelector('#exit-' + key));
const money = value => format.format(value) + '만원';

function render() {
  const fields = [...form.querySelectorAll('input')];
  const amounts = Object.fromEntries(fields.map(input => [input.name, input.valueAsNumber]));
  const { deposit, equipment, restoration, rental, rent, other, early } = amounts;
  const incoming = deposit + equipment;
  const outgoing = restoration + rental + rent + other;
  form.elements.early.max = Number.isFinite(outgoing) ? outgoing : '';
  const valid = form.checkValidity() && Number.isFinite(incoming) && Number.isFinite(outgoing);
  error.hidden = valid;
  error.textContent = Number.isFinite(outgoing) && early > outgoing
    ? '먼저 낼 금액은 낼 돈 합계 이하여야 해.'
    : '각 항목에 0 이상의 금액을 넣어 줘.';
  [incoming, outgoing, incoming - outgoing, early].forEach((value, index) => {
    outputs[index].textContent = valid ? money(value) : '—';
  });
}

form.addEventListener('input', render);
form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('reset', () => setTimeout(render, 0));
render();
