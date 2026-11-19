// 店舗の「お客様画面」（/store/customer.html?store=店舗ID）。デュアルモニタの2枚目を、お客様に向けて使う。
// 店舗スタッフの画面で「お客様画面へ反映」が押されると、別のウィンドウの localStorage が変わり、storage イベントで、ここが更新される。
// モックのため、同じブラウザの中だけで連動する。正式版では、サーバー経由で、店舗の端末どうしを結びつける（FUTURE_REQUIREMENTS）。
import { setScreenBadge } from '../src/screenIds.js';
import { STORES_KEY, loadStores, storeById, activeStores } from '../src/stores.js';
import { STORE_CUSTOMER_VIEW_KEY, STORE_VISITS_KEY } from '../src/store.js';
import { loadCustomerView, welcomeView, customerScreenId } from '../src/storeCustomerView.js';
import { customerScreenHtml } from './customerScreenView.js';

const storeId = new URLSearchParams(location.search).get('store');
const store = () => storeById(storeId, loadStores()) ?? activeStores(loadStores())[0] ?? { id: '', name: '' };

function render() {
  const s = store();
  const view = loadCustomerView(s.id)?.view ?? welcomeView();
  document.querySelector('#root').innerHTML = customerScreenHtml(view, { store: s });
  setScreenBadge(customerScreenId(view));
}

window.addEventListener('storage', (e) => {
  if ([STORE_CUSTOMER_VIEW_KEY, STORES_KEY, STORE_VISITS_KEY, null].includes(e.key)) render(); // null: ブラウザの保存領域の消去（データ初期化）
});

render();
