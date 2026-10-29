// 買取商品の写真。写真は必須（1枚以上）で、複数枚登録できる
export const hasPhoto = (item) => (item.photos?.length ?? 0) > 0;
export const itemReady = (item) => item.price > 0 && hasPhoto(item);
export const noPhotoCount = (items) => items.filter((i) => !hasPhoto(i)).length;
export const addPhoto = (item, photo) => ({ ...item, photos: [...(item.photos ?? []), photo] });
export const removePhoto = (item, idx) => ({ ...item, photos: (item.photos ?? []).filter((_, i) => i !== idx) });
