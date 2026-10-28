// 本人確認書類の登録（GMOサイン）。表面は必須、裏面は任意で、最大2枚。photo は、1枚だけだった昔の保存との互換用（表面と同じ）
export const KYC_MAX_PHOTOS = 2;

export const buildKyc = (type, front, back = '') => {
  if (!front) return null;
  const photos = [front, back].filter(Boolean).slice(0, KYC_MAX_PHOTOS);
  return { type, photo: photos[0], photos };
};

export const kycPhotos = (kyc) => kyc?.photos ?? (kyc?.photo ? [kyc.photo] : []);
