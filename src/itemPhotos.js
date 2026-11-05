// 買取商品の写真。写真は必須（1枚以上）で、複数枚登録できる
export const hasPhoto = (item) => (item.photos?.length ?? 0) > 0;
export const itemReady = (item) => item.price > 0 && hasPhoto(item);
export const noPhotoCount = (items) => items.filter((i) => !hasPhoto(i)).length;
export const addPhoto = (item, photo) => ({ ...item, photos: [...(item.photos ?? []), photo] });
export const removePhoto = (item, idx) => ({ ...item, photos: (item.photos ?? []).filter((_, i) => i !== idx) });

// 買取明細で「次へ」が押せない理由（押せるなら空文字）
export const itemsBlocker = (items) => {
  if (items.length === 0) return '商品を1点以上追加してください';
  const noPhoto = noPhotoCount(items);
  const noPrice = items.filter((i) => !(i.price > 0)).length;
  return [
    noPhoto ? `写真が未登録の商品が${noPhoto}点あります。写真を1枚以上登録してください` : '',
    noPrice ? `査定金額が未入力の商品が${noPrice}点あります` : '',
  ].filter(Boolean).join('／');
};
