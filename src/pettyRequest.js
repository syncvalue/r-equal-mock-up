// 鑑定士の小口金の申請（鑑定士タブレットから）。承認・却下は経理部（固定費・小口金管理）が行う。
import { loadLedger } from './ledger.js';
import { loadPettyUses, savePettyUses, pettyRows, pettyStatusOf, pettyUseReady, makePettyUse, addPettyUse, withdrawPettyUse } from './fixedCosts.js';
import { userById } from './dashboard.js';
import { dateKey } from './workday.js';

export const blankPettyForm = () => ({ amount: 0, date: dateKey(), memo: '' });
export const pettyReady = (form) => pettyUseReady({ ...form, userId: 'x' });

// 鑑定士の、残りと申請の一覧（新しい順）
export const pettyOf = (userId) => ({
  row: pettyRows(loadLedger(), loadPettyUses(), [userById(userId)])[0],
  mine: loadPettyUses().filter((u) => u.userId === userId).sort((a, b) => b.at - a.at),
});
export const pettyPendingCount = (userId) => loadPettyUses().filter((u) => u.userId === userId && pettyStatusOf(u) === 'pending').length;

// 申請する。入力が足りなければ false
export function sendPettyRequest(userId, form, now = Date.now()) {
  if (!pettyReady(form)) return false;
  const by = userById(userId).name;
  return savePettyUses(addPettyUse(loadPettyUses(), makePettyUse({ ...form, userId }, { by, now })));
}
export const withdrawPetty = (userId, id) => savePettyUses(withdrawPettyUse(loadPettyUses(), id, userId));
