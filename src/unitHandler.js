// 買い取った商品の担当の表示。訪問買取は担当営業、店頭買取は店舗と店舗スタッフ（店舗スタッフを、営業の名簿で引かない）。
import { userById } from './dashboard.js';
import { loadEmployees } from './employees.js';
import { loadStores, storeNameOf } from './stores.js';

export function handlerLabel(unit, { employees = loadEmployees(), stores = loadStores() } = {}) {
  if (unit.channel !== 'store') return `担当営業 ${userById(unit.userId)?.name ?? unit.userId}`;
  const staff = employees.find((u) => u.id === unit.userId && u.role === 'store');
  return `${storeNameOf(unit.storeId, stores)}・店舗スタッフ${staff ? ` ${staff.name}` : '（不明）'}`;
}
