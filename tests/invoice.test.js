import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { RECEIPT_SAMPLES, isInvoiceNo } = await import('../src/ai.js');
const { blankExpenseDraft, invoiceAfterRead, addExpense } = await import('../src/workday.js');


test('Tと数字13桁だけが登録番号', () => {
    assert.equal(isInvoiceNo('T1234567890123'), true);
    assert.equal(isInvoiceNo('T123456789012'), false);
    assert.equal(isInvoiceNo('1234567890123'), false);
    assert.equal(isInvoiceNo(''), false);
    assert.equal(isInvoiceNo(undefined), false);
  });
test('レシートの見本は、番号があるものとないものの両方がある', () => {
    assert.equal(RECEIPT_SAMPLES.some((s) => s.invoiceNo), true);
    assert.equal(RECEIPT_SAMPLES.some((s) => !s.invoiceNo), true);
    RECEIPT_SAMPLES.filter((s) => s.invoiceNo).forEach((s) => assert.equal(isInvoiceNo(s.invoiceNo), true));
  });

test('入力の初期値は未チェック', () => {
    assert.equal(blankExpenseDraft().invoice, false);
  });
test('OCRで登録番号が読めたらチェックする', () => {
    assert.equal(invoiceAfterRead(false, { invoiceNo: 'T1234567890123' }, false), true);
  });
test('番号が読めなくても、人がつけたチェックは外さない（再読取は読取結果に合わせる）', () => {
    assert.equal(invoiceAfterRead(true, {}, false), true);
    assert.equal(invoiceAfterRead(true, {}, true), false);
    assert.equal(invoiceAfterRead(false, {}, false), false);
  });
test('計上した経費に、インボイス対応の記録が残る', () => {
    const day = addExpense({ expenses: [] }, { id: 'EX1', invoice: true });
    assert.equal(day.expenses[0].invoice, true);
  });
