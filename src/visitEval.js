// 訪問が完了した予定に対する、お客様の評価（営業の記録）の登録状況。評価は予定表から、訪問のあとに登録する。
export const evalFilled = (e) => Boolean(e && (e.overall || e.attitude || e.repeat || e.wealth || e.timing || e.cats?.length || e.flags?.length || e.memo?.trim()));

// 訪問の評価。訪問の記録に含まれていればそれ、なければ保存済みの評価から訪問IDで探す
export const evalOfVisit = (v, evals) => v.eval ?? evals.find((x) => x.visitId === v.visitId) ?? null;

// none=評価の対象外（不在などの結果で終わった訪問）／pending=未登録／done=登録済み
export const evalStatus = (v, evals) => (v.outcome ? 'none' : evalFilled(evalOfVisit(v, evals)) ? 'done' : 'pending');

export const pendingEvalCount = (visits, evals) => visits.filter((v) => evalStatus(v, evals) === 'pending').length;
