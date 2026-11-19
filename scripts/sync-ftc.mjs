import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';

const sources = {
  brands: 'FftcBrandBrandStatsService/getBrandBrandStats',
  stores: 'FftcBrandFrcsStatsService/getBrandFrcsStats',
  costs: 'FftcBrandFntnStatsService/getBrandFntnStats',
};
const catalogPath = new URL('../public/catalog.json', import.meta.url);
const clean = value => String(value ?? '').normalize('NFKC').trim();
const integer = value => {
  const input = clean(value).replaceAll(',', '');
  const number = Number(input);
  return /^\d+$/.test(input) && Number.isSafeInteger(number) ? number : null;
};
const keyOf = row => JSON.stringify([row.brandNm, row.corpNm, row.indutyLclasNm, row.indutyMlsfcNm].map(clean));
const knownCount = data => Object.values(data.years || {}).reduce((sum, rows) => sum + rows.length, 0);

async function fetchPage(source, year, page, key) {
  const request = new URL('https://apis.data.go.kr/1130000/' + source);
  request.search = new URLSearchParams({ serviceKey:key, yr:String(year), pageNo:String(page), numOfRows:'100', resultType:'json' });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(request, { signal:AbortSignal.timeout(25000), redirect:'error' });
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) return { error:'HTTP ' + response.status };
        throw new Error('일시적인 응답 오류');
      }
      const payload = await response.json();
      const envelope = payload.response ?? payload;
      const header = envelope.header ?? envelope;
      const code = clean(header.resultCode);
      const body = envelope.body ?? envelope;
      if (code === '03' && !body.totalCount) return { total:0, rows:[] };
      if (!['0','00','0000'].includes(code)) return { error:'공공데이터포털 응답 코드 ' + (/^\d+$/.test(code) ? code : '확인 불가') };
      const total = integer(body.totalCount);
      const items = body.items?.item ?? body.items;
      const rows = Array.isArray(items) ? items : items && typeof items === 'object' ? [items] : [];
      if (total === null || rows.some(row => !clean(row.brandNm) || clean(row.yr) !== String(year))) {
        return { error:'목록 또는 기준 연도 응답 형식이 예상과 다릅니다.' };
      }
      return { total, rows };
    } catch {
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1250 * (attempt + 1)));
    }
  }
  return { error:'API 연결 또는 JSON 응답을 확인하지 못했습니다.' };
}

async function fetchAll(name, year, key) {
  let total, pageSize;
  const rows = [];
  const pages = new Set();
  for (let page = 1; page <= 1000; page++) {
    const result = await fetchPage(sources[name], year, page, key);
    if (result.error) throw new Error(name + ' ' + year + '년 · ' + result.error);
    if (page === 1) {
      total = result.total;
      pageSize = result.rows.length;
    }
    if (total !== result.total || (total > rows.length && !result.rows.length)) {
      throw new Error(name + ' · 페이지를 모두 수집하지 못했습니다.');
    }
    if (total) {
      const signature = JSON.stringify(result.rows);
      if (pages.has(signature)) throw new Error(name + ' · 같은 페이지가 반복됐습니다.');
      pages.add(signature);
    }
    rows.push(...result.rows);
    if (rows.length === total) {
      console.log(name + ' ' + year + '년 · ' + total + '행 · ' + page + '회');
      return rows;
    }
    if (rows.length > total || result.rows.length !== pageSize) break;
  }
  throw new Error(name + ' · 수집 건수가 총 건수와 일치하지 않습니다.');
}

function merge(brands, stores, costs, units, images) {
  const data = new Map();
  const money = (value, unit) => {
    const raw = integer(value);
    return raw === null || !Number.isSafeInteger(raw * unit) ? null : raw * unit;
  };
  for (const [group, records] of Object.entries({brands,stores,costs})) {
    const seen = new Map();
    for (const raw of records) {
      const identity = keyOf(raw);
      if (seen.has(identity) && seen.get(identity) !== JSON.stringify(raw)) {
        throw new Error(group + ' · 같은 브랜드와 본사에 서로 다른 공시 행이 있습니다.');
      }
      seen.set(identity, JSON.stringify(raw));
      const name = clean(raw.brandNm);
      const company = clean(raw.corpNm);
      const row = data.get(identity) ?? {
        id:createHash('sha256').update(identity).digest('hex').slice(0,24),
        name, company, category:clean(raw.indutyMlsfcNm) || clean(raw.indutyLclasNm) || '미분류',
        sector:clean(raw.indutyLclasNm),
      };
      if (group === 'brands') Object.assign(row,{stores:integer(raw.frcsCnt),started:clean(raw.jngBizStrtDate) || null});
      if (group === 'stores') Object.assign(row,{
        stores:integer(raw.frcsCnt) ?? row.stores ?? null, revenue:money(raw.avrgSlsAmt,units.revenue),
        opened:integer(raw.newFrcsRgsCnt), ended:integer(raw.ctrtEndCnt), cancelled:integer(raw.ctrtCncltnCnt), transferred:integer(raw.nmChgCnt),
      });
      if (group === 'costs') Object.assign(row,{
        cost:money(raw.smtnAmt,units.cost), fee:money(raw.jngBzmnJngAmt,units.cost), education:money(raw.jngBzmnEduAmt,units.cost),
        deposit:money(raw.jngBzmnAssrncAmt,units.cost), other:money(raw.jngBzmnEtcAmt,units.cost),
      });
      const image = images.find(item => item.name === name && item.company === company);
      if (image) row.image = image.image;
      data.set(identity,row);
    }
  }
  return [...data.values()].sort((a,b) => a.id.localeCompare(b.id));
}

async function main() {
  const key = process.env.FTC_DATA_SERVICE_KEY?.trim();
  if (!key) throw new Error('저장소 비밀값 FTC_DATA_SERVICE_KEY가 필요합니다.');
  const units = {revenue:integer(process.env.FTC_REVENUE_UNIT_WON),cost:integer(process.env.FTC_COST_UNIT_WON)};
  if (Object.values(units).some(unit => ![1,1000].includes(unit))) {
    throw new Error('원본의 금액 단위를 확인하고 FTC_REVENUE_UNIT_WON 및 FTC_COST_UNIT_WON을 원 단위 1 또는 천 원 단위 1000으로 설정하세요.');
  }
  const previous = JSON.parse(await readFile(catalogPath,'utf8'));
  const images = JSON.parse(await readFile(new URL('../data/brand-images.json',import.meta.url),'utf8'));
  const now = new Date();
  const current = Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(now));
  const requested = process.env.FTC_YEARS?.trim();
  const years = requested ? [...new Set(requested.split(',').map(year => integer(year)))] : [current,current-1,current-2];
  if (years.length > 8 || years.some(year => year === null || year < 2017 || year > current)) throw new Error('FTC_YEARS를 확인하세요.');
  const result = {};
  for (const year of years) {
    const brands = await fetchAll('brands',year,key);
    const stores = await fetchAll('stores',year,key);
    const costs = await fetchAll('costs',year,key);
    if (!brands.length && !stores.length && !costs.length) continue;
    const merged = merge(brands,stores,costs,units,images);
    const old = previous.preview ? [] : previous.years[year] || [];
    if (!brands.length || !stores.length || !costs.length || merged.length < old.length * 0.85) {
      throw new Error(year + '년 공시 목록이 비어 있거나 직전 수집보다 현저히 줄었습니다.');
    }
    result[year] = merged;
  }
  if (!knownCount({years:result})) throw new Error('공식 자료가 확인되지 않아 기존 목록을 유지합니다.');
  const updated = {preview:false,checkedAt:now.toISOString(),years:{...(previous.preview ? {} : previous.years),...result}};
  const temp = new URL(catalogPath.href + '.tmp');
  await writeFile(temp,JSON.stringify(updated) + '\n');
  await rename(temp,catalogPath);
  console.log('공식 목록 저장 · ' + knownCount(updated) + '개 브랜드·연도 행');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
