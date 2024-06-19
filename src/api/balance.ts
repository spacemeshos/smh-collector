import { BalanceResponseSchema } from '../schemas/account';

const DEFAULT_STATE = {
  nonce: '0',
  balance: '0',
};

export const fetchBalances = async (rpc: string, addresses: string[]) =>
  fetch(`${rpc}/spacemesh.v2alpha1.AccountService/List`, {
    method: 'POST',
    body: JSON.stringify({
      addresses,
      limit: 100,
    }),
  })
    .then((r) => r.json())
    .then(BalanceResponseSchema.parse);