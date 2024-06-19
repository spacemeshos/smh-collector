import { z } from 'zod';

import { Bech32AddressSchema } from './address';
import { BigIntStringSchema } from './strNumber';

export const SubmitTxResponseSchema = z.object({
  txId: z.string().min(1),
});

// Common stuff

export const TransactionIdSchema = z.string().min(1);

export const NestedTransactionIdSchema = z.object({ id: TransactionIdSchema });

export const NonceSchema = z.object({
  counter: z.string(),
  bitfield: z.number().optional(),
});

export type Nonce = z.infer<typeof NonceSchema>;

// Response objects

export const TransactionSchema = z.object({
  id: TransactionIdSchema,
  principal: Bech32AddressSchema,
  template: Bech32AddressSchema,
  method: z.number(),
  nonce: NonceSchema,
  maxGas: BigIntStringSchema,
  gasPrice: BigIntStringSchema,
  maxSpend: BigIntStringSchema,
  raw: z.string(),
});

export const TransactionResultStatusSchema = z.enum([
  'TRANSACTION_STATUS_UNSPECIFIED',
  'TRANSACTION_STATUS_SUCCESS',
  'TRANSACTION_STATUS_FAILURE',
  'TRANSACTION_STATUS_INVALID',
]);

export const TransactionResultSchema = z.object({
  status: TransactionResultStatusSchema,
  message: z.string(),
  gasConsumed: BigIntStringSchema,
  fee: BigIntStringSchema,
  block: z.string(),
  layer: z.number(),
  touchedAddresses: z.array(Bech32AddressSchema),
});

export const TransactionStateEnumSchema = z.enum([
  'TRANSACTION_STATE_UNSPECIFIED',
  'TRANSACTION_STATE_REJECTED',
  'TRANSACTION_STATE_INSUFFICIENT_FUNDS',
  'TRANSACTION_STATE_CONFLICTING',
  'TRANSACTION_STATE_MEMPOOL',
  'TRANSACTION_STATE_MESH',
  'TRANSACTION_STATE_PROCESSED',
]);

export const TransactionResponseObjectSchema = z.object({
  tx: TransactionSchema,
  txResult: z.nullable(TransactionResultSchema),
  txState: z.nullable(TransactionStateEnumSchema),
});

// Responses

export const TransactionResponseSchema = z.object({
  transactions: z.array(TransactionResponseObjectSchema),
});