import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evalFilled, evalOfVisit, evalStatus, pendingEvalCount } from '../src/visitEval.js';

const blank = { overall: 0, attitude: '', repeat: '', wealth: '', timing: '', cats: [], flags: [], memo: '' };

describe('訪問完了後のお客様の評価', () => {
  it('evalFilled: 何か1つでも入力があれば登録済み', () => {
    assert.equal(evalFilled(null), false);
    assert.equal(evalFilled(blank), false);
    assert.equal(evalFilled({ ...blank, overall: 3 }), true);
    assert.equal(evalFilled({ ...blank, memo: ' ' }), false);
  });
  it('evalOfVisit: 訪問の記録の評価を優先し、なければ保存済みの評価から訪問IDで探す', () => {
    const saved = [{ visitId: 'V2', overall: 4 }];
    assert.equal(evalOfVisit({ visitId: 'V1', eval: { overall: 5 } }, saved).overall, 5);
    assert.equal(evalOfVisit({ visitId: 'V2' }, saved).overall, 4);
    assert.equal(evalOfVisit({ visitId: 'V3' }, saved), null);
  });
  it('evalStatus: 不在などの結果がある訪問は対象外、買取の訪問は登録済み／未登録', () => {
    assert.equal(evalStatus({ visitId: 'V1', outcome: { type: 'absent' } }, []), 'none');
    assert.equal(evalStatus({ visitId: 'V1' }, []), 'pending');
    assert.equal(evalStatus({ visitId: 'V1' }, [{ visitId: 'V1', ...blank }]), 'pending');
    assert.equal(evalStatus({ visitId: 'V1' }, [{ visitId: 'V1', ...blank, overall: 2 }]), 'done');
  });
  it('pendingEvalCount: 未登録の件数', () => {
    const visits = [{ visitId: 'A' }, { visitId: 'B' }, { visitId: 'C', outcome: { type: 'absent' } }];
    assert.equal(pendingEvalCount(visits, [{ visitId: 'A', ...blank, overall: 1 }]), 1);
  });
});
