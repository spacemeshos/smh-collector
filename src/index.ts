#!/usr/bin/env node

import prompts from 'prompts';
import * as bip39 from '@scure/bip39';
import Bip32KeyDerivation from './bip32';
import { SingleSigTemplate } from '@spacemesh/sm-codec';
import { bech32 } from 'bech32';
import { fetchBalances } from './api/balance';
import { delay, splitIntoChunks } from './utils';
import { sign } from './ed25519';
import { fetchPublishTx, fetchTransactionsById } from './api/tx';

enum HRP {
  MainNet = 'sm',
  TestNet = 'stest',
  Standalone = 'standalone'
}

const MAINNET_GENESIS_ID = '9eebff023abb17ccb775c602daade8ed708f0a50';
const TESTNET_GENESIS_ID = 'e0ce350b570c2b392c9ee84cb4f788d7f44974ee';

const SPAWN_FEE = 100432n;
const SPEND_FEE = 36218n;

const LAYER_TIME = 6000;

const waitForTx = async (rpc: string, txId: string): Promise<void> => {
  const tx = (await fetchTransactionsById(rpc, txId))[0];
  if (
    tx.txState === 'TRANSACTION_STATE_MEMPOOL' ||
    tx.txState === 'TRANSACTION_STATE_MESH' ||
    tx.txState === 'TRANSACTION_STATE_UNSPECIFIED'
  ) {
    await delay(LAYER_TIME / 2);
    return waitForTx(rpc, txId);
  }

  if (tx.txState !== 'TRANSACTION_STATE_PROCESSED') {
    console.error(`Transaction ${txId} failed with status: ${tx.txState} ${tx.txResult?.message}`);
    process.exit(3);
  }

  return;
};

(async () => {
  const inputs = await prompts([
    {
      type: 'select',
      name: 'hrp',
      message: 'Choose Network',
      initial: 0,
      choices: [
        { title: 'MainNet', value: 'sm' },
        { title: 'TestNet', value: 'stest' },
        { title: 'Standalone', value: 'standalone' },
      ],
    },
    {
      type: (_, values) => values.hrp === HRP.MainNet ? null : 'text',
      name: 'genesisId',
      message: 'Paste Genesis ID',
      initial: (_, values) => {
        switch (values.hrp) {
          case HRP.MainNet:
            return MAINNET_GENESIS_ID;
          case 'stest':
            return TESTNET_GENESIS_ID;
          default:
            return ''
        }
      },
    },
    {
      type: 'text',
      name: 'mnemonic',
      message: 'Paste your mnemonics'
    },
    {
      type: 'number',
      min: 1,
      name: 'accountsAmount',
      message: 'How many accounts to check?',
      initial: 100,
    },
    {
      type: 'text',
      name: 'destination',
      message: 'Destination address'
    },
    {
      type: 'text',
      name: 'rpc',
      message: 'Paste JSON API URL',
      initial: (_, values) => {
        switch (values.hrp) {
          case HRP.MainNet:
            return 'https://wallet-api.spacemesh.network';
          case 'stest':
            return 'https://testnet-12-api.spacemesh.network';
          default:
            return 'http://127.0.0.1:8080/127.0.0.1:9095'
        }
      },
    },
  ], {
    onCancel: () => {
      console.log('Cancelled');
      process.exit(0);
    }
  });

  // Key generation
  const seed = await bip39.mnemonicToSeedSync(inputs.mnemonic);
  const keys = new Array(inputs.accountsAmount)
    .fill(0)
    .map((_, i) =>
      Bip32KeyDerivation.derivePath(
        Bip32KeyDerivation.createWalletPath(i),
        seed
      )
    );
  // Accounts generation
  const accounts = keys.map((keys) => {
    const principal = SingleSigTemplate.methods[0].principal({
      PublicKey: keys.publicKey,
    });
    
    return {
      ...keys,
      address: bech32.encode(inputs.hrp, bech32.toWords(principal)),
      principal,
    };
  });
  // Collecting balances and nonces
  const chunks = splitIntoChunks(accounts, 2);
  const accountInfo = (
    await Promise.all(
      chunks.map((accs) => fetchBalances(
        inputs.rpc,
        accs.map(({ address }) => address)
      ))
    )
  ).flatMap((res) => res.accounts);


  const genesisId = Buffer.from(
    inputs.hrp ===  HRP.MainNet
      ? MAINNET_GENESIS_ID
      : inputs.genesisId,
    'hex'
  );

  // Output balances
  await accountInfo
    .filter((acc) =>
      // Only if there is no pending txs
      acc.current.counter === acc.projected.counter && (
        // And it is spawned and balance more than spend tx fee
        (BigInt(acc.current.counter) > 0n && BigInt(acc.current.balance) > SPEND_FEE) ||
        // Or if it is not spawned, but balance more than spawn and spend tx fees
        (BigInt(acc.current.balance) > SPAWN_FEE + SPEND_FEE)
      )
    )
    .reduce(async (prev, acc) => {
      await prev;
      console.log(`Account: ${acc.address}`);
      console.log(`Balance: ${acc.current.balance} Smidge`);

      // Prepare transactions
      let nonce = BigInt(acc.projected.counter);
      let justSpawned = false;

      const keys = accounts.find(({ address }) => address === acc.address);
      if (!keys) {
        throw new Error(`Cannot find keys for address ${acc.address}`);
      }

      // Create a closure to run it:
      // a). in separate thread if we need to wait for spawn tx first
      // b). in the same thread if we only publish spend tx
      const spend = async (verbose = false) => {
        const destination = Uint8Array.from(
          bech32.fromWords(bech32.decode(inputs.destination).words)
        );
        const amount = BigInt(acc.current.balance) - (justSpawned ? SPAWN_FEE : 0n) - SPEND_FEE;
        const tx = SingleSigTemplate.methods[16].encode(
          keys.principal,
          {
            Nonce: nonce,
            GasPrice: 1n,
            Arguments: {
              Amount: amount,
              Destination: destination,
            }
          }
        );
        const sig = sign(
          Uint8Array.from([...genesisId, ...tx]),
          keys.secretKey
        );
        const signed = SingleSigTemplate.methods[0].sign(tx, sig);
      
        try {
          const txId = await fetchPublishTx(inputs.rpc, signed);
          console.log(
            verbose ? `${acc.address} -> ${inputs.destination}\n` : '',
            `Spend (${String(amount)} Smidge) transaction published: ${txId}`
          );
        } catch (err) {
          console.error('Cannot publish spend transaction:', err);
          console.log('Encoded and signed transaction:\n', Buffer.from(signed).toString('hex'));
          process.exit(2);
        }
      };

      // Spawn transaction if needed
      if (nonce === 0n) {
        const tx = SingleSigTemplate.methods[0].encode(
          keys.principal,
        {
          Nonce: 0n,
          GasPrice: 1n,
          Arguments: {
            PublicKey: keys.publicKey,
          }
        });
        const sig = sign(
          Uint8Array.from([...genesisId, ...tx]),
          keys.secretKey
        );
        const signed = SingleSigTemplate.methods[0].sign(tx, sig);
        nonce += 1n;
        justSpawned = true;

        try {
          const txId = await fetchPublishTx(inputs.rpc, signed);
          console.log(`Spawn transaction published: ${txId}`);
          // Wait for processing of spawn tx and only then publish spend tx
          waitForTx(inputs.rpc, txId).then(() => spend(true));
          console.log('Waiting for processing of Spawn transaction. Spend transaction will be published automatically afterwards.');
        } catch (err) {
          console.error('Cannot publish spawn transaction:', err);
          console.log('Encoded and signed transaction:\n', Buffer.from(signed).toString('hex'));
          process.exit(1);
        }
      } else {
        console.log('Account is already spawned');
        await spend();
      }

      console.log('\n');
      return;
    },
    Promise.resolve()
  );
})().catch(console.error);
