const number = new Intl.NumberFormat('ko-KR');
const money = new Set(['revenue', 'cost']);

export function franchiseMetric(row, key) {
  const value = row[key];
  if (row.conflicts?.includes(key)) return { value: null, label: '확인 필요' };
  if (value == null) return { value: null, label: '미공개' };
  if (money.has(key) && value === 0) return { value: null, label: '0원 (원문 확인)' };
  return { value, label: typeof value === 'number' ? number.format(value) : value };
}

export function compareFranchiseMetric(left, right, key) {
  const a = franchiseMetric(left, key).value;
  const b = franchiseMetric(right, key).value;
  if (a === null || b === null) return Number(a === null) - Number(b === null);
  return key === 'cost' ? a - b : b - a;
}
