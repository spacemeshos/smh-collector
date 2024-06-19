import crypto from 'crypto';

export const sign = (dataBytes: Uint8Array, privateKey: Uint8Array | string) => {
  const privPart = typeof privateKey === 'string'
    ? Buffer.from(privateKey, 'hex')
    : Buffer.from(privateKey);
  const key = Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'), // DER privateKey prefix for ED25519
    privPart
  ]);
  const pk = crypto.createPrivateKey({
    format: 'der',
    type: 'pkcs8',
    key,
  });
  return Uint8Array.from(crypto.sign(null, dataBytes, pk));
};
