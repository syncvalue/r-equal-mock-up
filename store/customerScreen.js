// 店舗の「お客様画面」（/store/customer.html?store=店舗ID）。デュアルモニタの2枚目を、お客様に向けて使う。
// 店舗スタッフの画面で「お客様画面へ反映」が押されると、別のウィンドウの localStorage が変わり、storage イベントで、ここが更新される。
// お客様が入力できるのは2つだけ: 来店の受付（お名前・電話番号 → 来店の「待ち」に入る）と、本人確認（住所・生年月日など → 買取の作業中の内容に入る）。
// モックのため、同じブラウザの中だけで連動する。端末のひもづけ・認証は、正式版（FUTURE_REQUIREMENTS R-7）。
import { setScreenBadge } from '../src/screenIds.js';
import { STORES_KEY, loadStores, storeById, activeStores } from '../src/stores.js';
import { STORE_CUSTOMER_VIEW_KEY, STORE_VISITS_KEY, STORE_DRAFT_KEY } from '../src/store.js';
import { loadCustomerView, welcomeView, checkinView, receivedView, customerScreenId } from '../src/storeCustomerView.js';
import { loadStoreVisits, saveStoreVisits, checkIn } from '../src/storeVisits.js';
import { loadDraft, saveDraft } from '../src/storeDraft.js';
import { missingIdentity } from '../src/idScan.js';
import { customerScreenHtml } from './customerScreenView.js';

const storeId = new URLSearchParams(location.search).get('store');
const store = () => storeById(storeId, loadStores()) ?? activeStores(loadStores())[0] ?? { id: '', name: '' };

const RECEIVED_CHECKIN = 'スタッフが、ご案内いたします。少々お待ちください。';
const RECEIVED_IDENTITY = 'ご入力ありがとうございました。スタッフが、内容を確認いたします。';
const RECEIVED_SECONDS = 8;

// お客様画面の中だけの状態。店舗スタッフが「反映」したとき（storage）は、こちらを捨てて、反映された内容を出す
let local = null; // null／checkin（受付の入力中）／received（入力を受け付けた）
let form = { name: '', phone: '' };
let error = '';
let timer = null;

function render() {
  const s = store();
  const shown = loadCustomerView(s.id)?.view ?? welcomeView();
  const view = local ?? shown;
  const draft = view.kind === 'identity' ? loadDraft(view.visitId) : null;
  document.querySelector('#root').innerHTML = customerScreenHtml(view, { store: s, draft, form, error });
  setScreenBadge(customerScreenId(view));
}

function reset() {
  clearTimeout(timer);
  local = null;
  form = { name: '', phone: '' };
  error = '';
}

const REASON = { noName: 'お名前を、ご入力ください', noPhone: '電話番号を、ご入力ください', noStore: '店舗が正しくありません。スタッフをお呼びください', badStatus: 'もう一度、お試しください' };

function submitCheckin() {
  const r = checkIn(loadStoreVisits(), { storeId: store().id, ...form }, { storeIds: activeStores(loadStores()).map((x) => x.id) });
  if (!r.ok) { error = REASON[r.reason] ?? 'もう一度、お試しください'; return render(); }
  if (!saveStoreVisits(r.list)) { error = '保存できませんでした。スタッフをお呼びください'; return render(); }
  reset();
  local = receivedView(RECEIVED_CHECKIN);
  timer = setTimeout(() => { reset(); render(); }, RECEIVED_SECONDS * 1000);
  render();
}

function submitIdentity() {
  const view = loadCustomerView(store().id)?.view;
  const d = view?.visitId ? loadDraft(view.visitId) : null;
  if (!d) return;
  const miss = missingIdentity(d.customer);
  if (miss.length) { error = `${miss.join('・')}を、ご入力ください`; return render(); }
  if (!saveDraft({ ...d, entered: true })) { error = '保存できませんでした。スタッフをお呼びください'; return render(); }
  error = '';
  local = receivedView(RECEIVED_IDENTITY);
  render();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-checkin-start],[data-checkin-submit],[data-checkin-cancel],[data-identity-submit]');
  if (!t) return;
  if ('checkinStart' in t.dataset) { reset(); local = checkinView(); render(); }
  else if ('checkinSubmit' in t.dataset) submitCheckin();
  else if ('checkinCancel' in t.dataset) { reset(); render(); }
  else submitIdentity();
});

// 入力中は、画面を作り直さない（入力欄の位置・日本語入力を壊さないため）。値だけ、覚える・保存する
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.ci) form = { ...form, [t.dataset.ci]: t.value };
  if (t.dataset.id) {
    const view = loadCustomerView(store().id)?.view;
    const d = view?.visitId ? loadDraft(view.visitId) : null;
    if (d) saveDraft({ ...d, entered: false, customer: { ...d.customer, [t.dataset.id]: t.value } });
  }
});

window.addEventListener('storage', (e) => {
  if (e.key === STORE_CUSTOMER_VIEW_KEY || e.key === null) { reset(); render(); return; }
  if (document.activeElement?.matches?.('input')) return; // 入力中は、作り直さない
  if ([STORES_KEY, STORE_VISITS_KEY, STORE_DRAFT_KEY].includes(e.key)) render(); // 書類の読み取りで入った内容を、入力欄に出す
});

render();
