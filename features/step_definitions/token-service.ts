import { Given, Then, When } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import { 
  AccountBalanceQuery, 
  AccountId, 
  Client, 
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  TransferTransaction,
  TokenAssociateTransaction,
  CustomRoyaltyFee,
  CustomFixedFee,
  Hbar,
  Status,
  TransactionReceipt,
  TokenInfoQuery
} from "@hashgraph/sdk";
import assert from "node:assert";

const client = Client.forTestnet();
let tokenId: any;
let lastTransaction: any;
let accountsMap: Map<string, { id: string, privateKey: string }> = new Map();

// Helper function to setup an account
async function setupAccount(accountIndex: number) {
  const account = accounts[accountIndex];
  const accountId = AccountId.fromString(account.id);
  const privateKey = PrivateKey.fromStringED25519(account.privateKey);
  accountsMap.set(`account${accountIndex}`, account);
  return { accountId, privateKey };
}

Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const { accountId, privateKey } = await setupAccount(0);
  client.setOperator(accountId, privateKey);

  const query = new AccountBalanceQuery().setAccountId(accountId);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);
});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  const { accountId, privateKey } = await setupAccount(0);
  
  const transaction = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(0)
    .setTreasuryAccountId(accountId)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTokenType(TokenType.FungibleCommon)
    .setAdminKey(privateKey.publicKey)
    .setSupplyKey(privateKey.publicKey);

  const txResponse = await transaction.execute(client);
  const receipt = await txResponse.getReceipt(client);
  tokenId = receipt.tokenId;
  assert.ok(tokenId, "Token ID should be present in receipt");
});

Then(/^The token has the name "([^"]*)"$/, async function (expectedName: string) {
  const info = await new TokenInfoQuery()
    .setTokenId(tokenId)
    .execute(client);
  
  assert.ok(info.name, "Token name should be present");
  assert.strictEqual(info.name, expectedName);
});

Then(/^The token has the symbol "([^"]*)"$/, async function (expectedSymbol: string) {
  const info = await new TokenInfoQuery()
    .setTokenId(tokenId)
    .execute(client);
  
  assert.ok(info.symbol, "Token symbol should be present");
  assert.strictEqual(info.symbol, expectedSymbol);
});

Then(/^The token has (\d+) decimals$/, async function (expectedDecimals: number) {
  const info = await new TokenInfoQuery()
    .setTokenId(tokenId)
    .execute(client);
  
  assert.ok(typeof info.decimals === 'number', "Token decimals should be present");
  assert.strictEqual(info.decimals, expectedDecimals);
});

Then(/^The token is owned by the account$/, async function () {
  const { accountId } = await setupAccount(0);
  const info = await new TokenInfoQuery()
    .setTokenId(tokenId)
    .execute(client);
  
  assert.ok(info.treasuryAccountId, "Treasury account ID should be present");
  assert.strictEqual(info.treasuryAccountId.toString(), accountId.toString());
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, async function (amount: number) {
  const transaction = new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(amount);

  const txResponse = await transaction.execute(client);
  const receipt = await txResponse.getReceipt(client);
  assert.strictEqual(receipt.status, Status.Success);
});

When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, async function (initialSupply: number) {
  const { accountId, privateKey } = await setupAccount(0);
  
  const transaction = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(initialSupply)
    .setTreasuryAccountId(accountId)
    .setSupplyType(TokenSupplyType.Finite)
    .setTokenType(TokenType.FungibleCommon)
    .setMaxSupply(initialSupply);

  const txResponse = await transaction.execute(client);
  const receipt = await txResponse.getReceipt(client);
  tokenId = receipt.tokenId;
  assert.ok(tokenId, "Token ID should be present in receipt");
});

Then(/^The total supply of the token is (\d+)$/, async function (expectedSupply: number) {
  const info = await new TokenInfoQuery()
    .setTokenId(tokenId)
    .execute(client);
  
  assert.ok(info.totalSupply, "Total supply should be present");
  assert.strictEqual(info.totalSupply.toNumber(), expectedSupply);
});

Then(/^An attempt to mint tokens fails$/, async function () {
  const transaction = new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(1);

  try {
    await transaction.execute(client);
    assert.fail("Expected mint transaction to fail");
  } catch (error: any) {
    if (error.status) {
      assert.strictEqual(error.status.toString(), "TOKEN_HAS_NO_SUPPLY_KEY");
    } else {
      assert.ok(error.toString().includes("TOKEN_HAS_NO_SUPPLY_KEY"));
    }
  }
});

// The rest of the implementation remains the same...

// Implementation for token transfers between accounts
Given(/^A first hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const { accountId, privateKey } = await setupAccount(0);
  client.setOperator(accountId, privateKey);

  const query = new AccountBalanceQuery().setAccountId(accountId);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);
});

Given(/^A second Hedera account$/, async function () {
  await setupAccount(1);
});

Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, async function (initialSupply: number) {
  const { accountId, privateKey } = await setupAccount(0);
  
  const transaction = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(initialSupply)
    .setTreasuryAccountId(accountId)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTokenType(TokenType.FungibleCommon)
    .setAdminKey(privateKey.publicKey)
    .setSupplyKey(privateKey.publicKey);

  const txResponse = await transaction.execute(client);
  const receipt = await txResponse.getReceipt(client);
  tokenId = receipt.tokenId;
});

async function associateTokenToAccount(accountIndex: number) {
  const account = accountsMap.get(`account${accountIndex}`);
  if (!account) throw new Error(`Account ${accountIndex} not found`);
  
  const accountId = AccountId.fromString(account.id);
  const privateKey = PrivateKey.fromStringED25519(account.privateKey);
  
  const transaction = new TokenAssociateTransaction()
    .setAccountId(accountId)
    .setTokenIds([tokenId]);

  const txResponse = await transaction
    .freezeWith(client)
    .sign(privateKey);
  
  const executeResponse = await txResponse.execute(client);
  await executeResponse.getReceipt(client);
}

Given(/^The first account holds (\d+) HTT tokens$/, async function (amount: number) {
  await associateTokenToAccount(0);
  // Transfer initial tokens if needed
});

Given(/^The second account holds (\d+) HTT tokens$/, async function (amount: number) {
  await associateTokenToAccount(1);
  if (amount > 0) {
    const transaction = new TransferTransaction()
      .addTokenTransfer(tokenId, AccountId.fromString(accounts[1].id), amount)
      .addTokenTransfer(tokenId, AccountId.fromString(accounts[0].id), -amount);

    lastTransaction = await transaction.execute(client);
    await lastTransaction.getReceipt(client);
  }
});

When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, async function (amount: number) {
  const transaction = new TransferTransaction()
    .addTokenTransfer(tokenId, AccountId.fromString(accounts[1].id), amount)
    .addTokenTransfer(tokenId, AccountId.fromString(accounts[0].id), -amount);

  lastTransaction = await transaction.execute(client);
});

When(/^The first account submits the transaction$/, async function () {
  await lastTransaction.getReceipt(client);
});

// Implement remaining steps following similar patterns...