import { SubmitTxResponseSchema, TransactionResponseSchema } from '../schemas/tx';

export const fetchPublishTx = async (rpc: string, encodedTx: Uint8Array) =>
  fetch(`${rpc}/spacemesh.v2alpha1.TransactionService/SubmitTransaction`, {
    method: 'POST',
    body: JSON.stringify({
      transaction: Buffer.from(encodedTx).toString('base64'),
    }),
  })
    .then((r) => r.json())
    .then(SubmitTxResponseSchema.parse)
    .then(({ txId }) => txId);

export const fetchTransactionsById = async (
  rpc: string,
  txId: string
) =>
  fetch(`${rpc}/spacemesh.v2alpha1.TransactionService/List`, {
    method: 'POST',
    body: JSON.stringify({
      txid: [txId],
      include_state: true,
      include_result: true,
      limit: 100,
    }),
  })
    .then((r) => r.json())
    .then(TransactionResponseSchema.parse)
    .then((res) => res.transactions);
