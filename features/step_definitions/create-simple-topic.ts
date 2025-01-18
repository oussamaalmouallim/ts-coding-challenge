import { Given, Then, When } from "@cucumber/cucumber";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey,
  RequestType,
  TopicCreateTransaction,
  TopicInfoQuery,
  TopicMessageQuery,
  TopicMessageSubmitTransaction,
  KeyList
} from "@hashgraph/sdk";
import { accounts } from "../../src/config";
import assert from "node:assert";
import ConsensusSubmitMessage = RequestType.ConsensusSubmitMessage;

// Pre-configured client for test network (testnet)
const client = Client.forTestnet();

Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[0];
  const account: AccountId = AccountId.fromString(acc.id);
  this.account = account;
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.privKey = privKey;
  client.setOperator(this.account, privKey);
  
  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);
});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[1];
  const account: AccountId = AccountId.fromString(acc.id);
  this.secondAccount = account;
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.secondPrivKey = privKey;
  
  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);
});

Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, async function (threshold: number, total: number) {
  const keyList = new KeyList([
    this.privKey.publicKey,
    this.secondPrivKey.publicKey
  ], threshold);
  
  this.thresholdKey = keyList;
});

// Updated to match Cucumber's suggested pattern exactly
When('A topic is created with the memo {string} with the first account as the submit key', async function (memo: string) {
  const transaction = new TopicCreateTransaction()
    .setTopicMemo(memo)
    .setSubmitKey(this.privKey.publicKey);
  
  const txResponse = await transaction
    .execute(client);
  
  const receipt = await txResponse.getReceipt(client);
  this.topicId = receipt.topicId;
});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  const transaction = new TopicCreateTransaction()
    .setTopicMemo(memo)
    .setSubmitKey(this.thresholdKey);
  
  const txResponse = await transaction
    .execute(client);
  
  const receipt = await txResponse.getReceipt(client);
  this.topicId = receipt.topicId;
});

When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {
  // Create the transaction
  const transaction = new TopicMessageSubmitTransaction()
    .setTopicId(this.topicId)
    .setMessage(message);

  // First freeze the transaction
  const frozenTx = await transaction.freeze();
  
  // If using threshold key, sign with both keys
  if (this.thresholdKey) {
    // Sign with first key
    const firstSign = await frozenTx.sign(this.privKey);
    // Sign with second key
    const secondSign = await firstSign.sign(this.secondPrivKey);
    // Execute
    const txResponse = await secondSign.execute(client);
    await txResponse.getReceipt(client);
  } else {
    // Single key signing
    const signedTx = await frozenTx.sign(this.privKey);
    const txResponse = await signedTx.execute(client);
    await txResponse.getReceipt(client);
  }
});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, async function (message: string) {
  const query = new TopicMessageQuery()
    .setTopicId(this.topicId);

  let receivedMessage = false;
  
  const errorHandler = (message: any, error: Error) => {
    if (error) {
      console.error(`Error receiving message: ${error}`);
    }
  };

  const messageHandler = (message: any) => {
    if (message && message.contents) {
      console.log(`Received message: ${message.contents.toString()}`);
      receivedMessage = true;
      subscription.unsubscribe();
    }
  };

  const subscription = query.subscribe(
    client,
    errorHandler,
    messageHandler
  );

  await new Promise((resolve, reject) => {
    setTimeout(() => {
      if (!receivedMessage) {
        reject(new Error("Timeout waiting for message"));
      }
      resolve(true);
    }, 10000);
  });
});