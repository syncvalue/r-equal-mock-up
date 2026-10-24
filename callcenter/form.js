// 受付フォームの入力の初期状態（画面・サンプルデータ・テストで共通）
import { blankMain } from './master.js';
import { ymdOf } from '../src/reservations.js';

export function blankForm(now = new Date()) {
  const tomorrow = ymdOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  return {
    phone: '', phone2: '', phone2None: false, lastName: '', firstName: '', lastKana: '', firstKana: '', gender: '', genderEst: false, age: '', ageEst: '', zip: '', address: '', areaId: null, areaAddr: '',
    chirashi: null, flyerId: '', cats: [], mainItems: blankMain(), wants: '', attendee: '', whenAsked: false, large: '', notes: '', companion: '', companionNote: '', parking: '', nameplate: '',
    contactFrom: '', contactTo: '', date: tomorrow, start: 10 * 60, dur: 90, userId: null,
  };
}
