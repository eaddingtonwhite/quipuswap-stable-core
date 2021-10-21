import {
  ContractAbstraction,
  ContractProvider,
  MichelsonMap,
} from "@taquito/taquito";
import { BatchOperation } from "@taquito/taquito/dist/types/operations/batch-operation";
import { TransactionOperation } from "@taquito/taquito/dist/types/operations/transaction-operation";
import { BigNumber } from "bignumber.js";
import { defaultTokenId, TokenFA2 } from "./tokenFA2";
import {
  DexStorage,
  FeeType,
  LambdaFunctionType,
  FA2TokenType,
  FA12TokenType,
} from "./types";
import { destructObj, getLigo, Tezos } from "./utils";
import { execSync } from "child_process";
import { confirmOperation } from "./confirmation";
import { dexLambdas, tokenLambdas } from "../storage/Functions";
import { TokenFA12 } from "./tokenFA12";
import dex_lambdas_comp from "../../build/lambdas/Dex_lambdas.json";
import token_lambdas_comp from "../../build/lambdas/Token_lambdas.json";

const standard = process.env.EXCHANGE_TOKEN_STANDARD;

export class Dex extends TokenFA2 {
  public contract: ContractAbstraction<ContractProvider>;
  public storage: DexStorage;

  constructor(contract: ContractAbstraction<ContractProvider>) {
    super(contract);
  }

  static async init(dexAddress: string): Promise<Dex> {
    const dex = new Dex(await Tezos.contract.at(dexAddress));
    await dex.setFunctionBatchCompilled("Dex", dex_lambdas_comp);
    await dex.setFunctionBatchCompilled("Token", token_lambdas_comp);
    return dex;
  }

  async updateStorage(
    maps: {
      tokens?: string[];
      token_to_id?: string[];
      pools?: string[];
      ledger?: any[];
      dex_lambdas?: number[];
      token_lambdas?: number[];
    } = {}
  ): Promise<void> {
    const storage: any = await this.contract.storage();
    this.storage = {
      storage: {
        admin: storage.storage.admin,
        default_referral: storage.storage.default_referral,
        managers: storage.storage.managers,
        dev_address: storage.storage.dev_address,
        reward_rate: storage.storage.reward_rate,
        pools_count: storage.storage.pools_count,
        tokens: {},
        pool_to_id: {},
        pools: {},
        ledger: {},
        account_data: {},
        dev_rewards: {},
        referral_rewards: {},
        stakers_balance: {},
        permits: {},
      },
      dex_lambdas: {},
      token_lambdas: {},
      metadata: {},
      token_metadata: {},
    };
    for (let key in maps) {
      if (["dex_lambdas", "token_lambdas"].includes(key)) continue;
      this.storage[key] = await maps[key].reduce(async (prev, current) => {
        try {
          return {
            ...(await prev),
            [key == "ledger" ? current[0] : current]: await storage.storage[
              key
            ].get(current),
          };
        } catch (ex) {
          console.log(ex);
          return {
            ...(await prev),
          };
        }
      }, Promise.resolve({}));
    }
    for (let key in maps) {
      if (!["dex_lambdas", "token_lambdas"].includes(key)) continue;
      this[key] = await maps[key].reduce(async (prev, current) => {
        try {
          return {
            ...(await prev),
            [current]: await storage[key].get(current.toString()),
          };
        } catch (ex) {
          return {
            ...(await prev),
          };
        }
      }, Promise.resolve({}));
    }
  }

  async initializeExchange(
    a_const: BigNumber = new BigNumber("100000"),
    tokens_count: BigNumber = new BigNumber("3"),
    inputs: {
      asset: TokenFA12 | TokenFA2;
      in_amount: BigNumber;
      rate: BigNumber;
    }[],
    approve: boolean = true
  ): Promise<TransactionOperation> {
    if (approve) {
      for (const input of inputs) {
        await input.asset.approve(
          this.contract.address,
          input.in_amount.toNumber()
        );
      }
    }
    let input_tokens = new MichelsonMap<
      number,
      {
        asset: unknown;
        in_amount: BigNumber;
        rate: BigNumber;
      }
    >();
    const input_params = inputs.map((item, i) => {
      let mapped_item = (input) => {
        if (input.asset instanceof TokenFA2) {
          return {
            asset: {
              fa2: {
                token_address: input.asset.contract.address,
                token_id: defaultTokenId,
              },
            },
            in_amount: input.in_amount,
            rate: input.rate,
          };
        } else
          return {
            asset: {
              fa12: input.asset.contract.address,
            },
            in_amount: input.in_amount,
            rate: input.rate,
          };
      };
      input_tokens.set(i, mapped_item(item));

      return {
        [i]: mapped_item(item),
      };
    }, {});
    const operation = await this.contract.methods
      .addPair(a_const, tokens_count, input_tokens)
      .send();
    await confirmOperation(Tezos, operation.hash);
    return operation;
  }

  // async tokenToTokenRoutePayment(
  //   swaps: SwapSliceType[],
  //   amountIn: number,
  //   minAmountOut: number,
  //   receiver: string,
  //   tokenAid: BigNumber = new BigNumber(0),
  //   tokenBid: BigNumber = new BigNumber(0)
  // ): Promise<TransactionOperation> {
  //   let firstSwap = swaps[0];
  //   if (Object.keys(firstSwap.operation)[0] == "buy") {
  //     if (["FA2"].includes(standard)) {
  //       await this.approveFA2Token(
  //         firstSwap.pair.token_b_address,
  //         tokenBid,
  //         amountIn,
  //         this.contract.address
  //       );
  //     } else {
  //       await this.approveFA12Token(
  //         firstSwap.pair.token_b_address,
  //         amountIn,
  //         this.contract.address
  //       );
  //     }
  //   } else {
  //     if (["FA2", "MIXED"].includes(standard)) {
  //       await this.approveFA2Token(
  //         firstSwap.pair.token_a_address,
  //         tokenAid,
  //         amountIn,
  //         this.contract.address
  //       );
  //     } else {
  //       await this.approveFA12Token(
  //         firstSwap.pair.token_a_address,
  //         amountIn,
  //         this.contract.address
  //       );
  //     }
  //   }
  //   const operation = await this.contract.methods
  //     .use("swap", swaps, amountIn, minAmountOut, receiver)
  //     .send();
  //   await confirmOperation(Tezos, operation.hash);
  //   return operation;
  // }

  // async tokenToTokenPayment(
  //   tokenAAddress: string,
  //   tokenBAddress: string,
  //   opType: string,
  //   amountIn: number,
  //   minAmountOut: number,
  //   receiver: string,
  //   tokenAid: BigNumber = new BigNumber(0),
  //   tokenBid: BigNumber = new BigNumber(0)
  // ): Promise<TransactionOperation> {
  //   if (opType == "buy") {
  //     if (["FA2"].includes(standard)) {
  //       await this.approveFA2Token(
  //         tokenBAddress,
  //         tokenBid,
  //         amountIn,
  //         this.contract.address
  //       );
  //     } else {
  //       await this.approveFA12Token(
  //         tokenBAddress,
  //         amountIn,
  //         this.contract.address
  //       );
  //     }
  //   } else {
  //     if (["FA2", "MIXED"].includes(standard)) {
  //       await this.approveFA2Token(
  //         tokenAAddress,
  //         tokenAid,
  //         amountIn,
  //         this.contract.address
  //       );
  //     } else {
  //       await this.approveFA12Token(
  //         tokenAAddress,
  //         amountIn,
  //         this.contract.address
  //       );
  //     }
  //   }
  //   const swaps = [
  //     {
  //       pair: {
  //         token_a_address: tokenAAddress,
  //         token_b_address: tokenBAddress,
  //         token_a_id: tokenAid,
  //         token_b_id: tokenBid,
  //         token_a_type: {
  //           [standard.toLowerCase() == "mixed"
  //             ? "fa2"
  //             : standard.toLowerCase()]: null,
  //         },
  //         token_b_type: {
  //           [standard.toLowerCase() == "mixed"
  //             ? "fa12"
  //             : standard.toLowerCase()]: null,
  //         },
  //       },
  //       operation: { [opType]: null },
  //     },
  //   ];
  //   const operation = await this.contract.methods
  //     .use("swap", swaps, amountIn, minAmountOut, receiver)
  //     .send();
  //   await confirmOperation(Tezos, operation.hash);
  //   return operation;
  // }

  // async investLiquidity(
  //   pairId: string,
  //   tokenAmounts: Map<BigNumber, BigNumber>,
  //   minShares: number,
  //   refferal: string
  // ): Promise<TransactionOperation> {
  //   await this.updateStorage({ tokens: [pairId] });
  //   let pair = this.storage.storage.tokens[pairId];
  //   if (["FA2", "MIXED"].includes(standard)) {
  //     await this.approveFA2Token(
  //       pair.token_a_address,
  //       pair.token_a_id,

  //       tokenAAmount,
  //       this.contract.address
  //     );
  //   } else {
  //     await this.approveFA12Token(
  //       pair.token_a_address,
  //       tokenAAmount,
  //       this.contract.address
  //     );
  //   }
  //   if ("FA2" == standard) {
  //     await this.approveFA2Token(
  //       pair.token_b_address,
  //       pair.token_b_id,
  //       tokenBAmount,
  //       this.contract.address
  //     );
  //   } else {
  //     await this.approveFA12Token(
  //       pair.token_b_address,
  //       tokenBAmount,
  //       this.contract.address
  //     );
  //   }
  //   const operation = await this.contract.methods
  //     .use(
  //       "invest",
  //       pair.token_a_address,
  //       pair.token_a_id,
  //       standard.toLowerCase() == "mixed" ? "fa2" : standard.toLowerCase(),
  //       null,
  //       pair.token_b_address,
  //       pair.token_b_id,
  //       standard.toLowerCase() == "mixed" ? "fa12" : standard.toLowerCase(),
  //       null,
  //       minShares,
  //       tokenAAmount,
  //       tokenBAmount
  //     )
  //     .send();
  //   await confirmOperation(Tezos, operation.hash);
  //   return operation;
  // }

  // async divestLiquidity(
  //   pairId: string,
  //   tokenAAmount: number,
  //   tokenBAmount: number,
  //   sharesBurned: number
  // ): Promise<TransactionOperation> {
  //   await this.updateStorage({ tokens: [pairId] });
  //   let pair = this.storage.storage.tokens[pairId];
  //   const operation = await this.contract.methods
  //     .use(
  //       "divest",
  //       pair.token_a_address,
  //       pair.token_a_id,
  //       standard.toLowerCase() == "mixed" ? "fa2" : standard.toLowerCase(),
  //       null,
  //       pair.token_b_address,
  //       pair.token_b_id,
  //       standard.toLowerCase() == "mixed" ? "fa12" : standard.toLowerCase(),
  //       null,
  //       tokenAAmount,
  //       tokenBAmount,
  //       sharesBurned
  //     )
  //     .send();
  //   await confirmOperation(Tezos, operation.hash);
  //   return operation;
  // }

  async approveFA2Token(
    tokenAddress: string,
    tokenId: BigNumber,
    tokenAmount: number,
    address: string
  ): Promise<TransactionOperation> {
    await this.updateStorage();
    let token = await Tezos.contract.at(tokenAddress);
    let operation = await token.methods
      .update_operators([
        {
          [tokenAmount ? "add_operator" : "remove_operator"]: {
            owner: await Tezos.signer.publicKeyHash(),
            operator: address,
            token_id: tokenId,
          },
        },
      ])
      .send();
    await confirmOperation(Tezos, operation.hash);
    return operation;
  }

  async approveFA12Token(
    tokenAddress: string,
    tokenAmount: number,
    address: string
  ): Promise<TransactionOperation> {
    await this.updateStorage();
    let token = await Tezos.contract.at(tokenAddress);
    let operation = await token.methods.approve(address, tokenAmount).send();
    await confirmOperation(Tezos, operation.hash);
    return operation;
  }

  async setDexFunction(index: number, lambdaName: string): Promise<void> {
    let ligo = getLigo(true);
    const stdout = execSync(
      `${ligo} compile expression pascaligo 'SetDexFunction(record [index =${index}n; func = Bytes.pack(${lambdaName})])' --michelson-format json --init-file $PWD/contracts/main/Dex.ligo`,
      { maxBuffer: 1024 * 500 }
    );
    const operation = await Tezos.contract.transfer({
      to: this.contract.address,
      amount: 0,
      parameter: {
        entrypoint: "setDexFunction",
        value: JSON.parse(stdout.toString()).args[0].args[0].args[0].args[0],
      },
    });
    await confirmOperation(Tezos, operation.hash);
  }

  async setDexFunctionBatch(
    funcs_map: LambdaFunctionType[] = dexLambdas
  ): Promise<void> {
    let batch = await Tezos.contract.batch();
    let ligo = getLigo(true);
    for (const lambdaFunction of funcs_map) {
      console.log(`${lambdaFunction.index}\t${lambdaFunction.name}`);
      const stdout = execSync(
        `${ligo} compile expression pascaligo 'SetDexFunction(record [index =${lambdaFunction.index}n; func = Bytes.pack(${lambdaFunction.name})])' --michelson-format json --init-file $PWD/contracts/main/Dex.ligo`,
        { maxBuffer: 1024 * 500 }
      );
      batch = batch.withTransfer({
        to: this.contract.address,
        amount: 0,
        parameter: {
          entrypoint: "setDexFunction",
          value: JSON.parse(stdout.toString()).args[0].args[0].args[0].args[0],
        },
      });
    }
    const batchOp = await batch.send();
    await confirmOperation(Tezos, batchOp.hash);
  }
  async setFunctionBatchCompilled(
    type: "Dex" | "Token",
    comp_funcs_map
  ): Promise<void> {
    let batch = await Tezos.contract.batch();
    for (const lambdaFunction of comp_funcs_map) {
      batch = batch.withTransfer({
        to: this.contract.address,
        amount: 0,
        parameter: {
          entrypoint: `set${type}Function`,
          value: lambdaFunction,
        },
      });
    }
    const batchOp = await batch.send();
    await confirmOperation(Tezos, batchOp.hash);
  }

  async setTokenFunction(index: number, lambdaName: string): Promise<void> {
    let ligo = getLigo(true);
    const stdout = execSync(
      `${ligo} compile expression pascaligo 'SetTokenFunction(record [index =${index}n; func = Bytes.pack(${lambdaName})])' --michelson-format json --init-file $PWD/contracts/main/Dex.ligo`,
      { maxBuffer: 1024 * 500 }
    );
    const operation = await Tezos.contract.transfer({
      to: this.contract.address,
      amount: 0,
      parameter: {
        entrypoint: "setTokenFunction",
        value: JSON.parse(stdout.toString()).args[0].args[0].args[0].args[0],
      },
    });
    await confirmOperation(Tezos, operation.hash);
  }

  async setTokenFunctionBatch(
    funcs_map: LambdaFunctionType[] = tokenLambdas
  ): Promise<void> {
    let batch = await Tezos.contract.batch();
    let ligo = getLigo(true);
    for (const lambdaFunction of funcs_map) {
      console.log(`${lambdaFunction.index}\t${lambdaFunction.name}`);
      const stdout = execSync(
        `${ligo} compile expression pascaligo 'SetTokenFunction(record [index =${lambdaFunction.index}n; func = Bytes.pack(${lambdaFunction.name})])' --michelson-format json --init-file $PWD/contracts/main/Dex.ligo`,
        { maxBuffer: 1024 * 500 }
      );
      batch = batch.withTransfer({
        to: this.contract.address,
        amount: 0,
        parameter: {
          entrypoint: "setTokenFunction",
          value: JSON.parse(stdout.toString()).args[0].args[0].args[0].args[0],
        },
      });
    }
    const batchOp = await batch.send();
    await confirmOperation(Tezos, batchOp.hash);
  }

  async setAdmin(new_admin: string): Promise<TransactionOperation> {
    await this.updateStorage({});
    const operation = await this.contract.methods.set_admin(new_admin).send();

    await confirmOperation(Tezos, operation.hash);
    return operation;
  }
  async addRemManager(
    add: boolean,
    manager: string
  ): Promise<TransactionOperation> {
    await this.updateStorage({});
    const operation = await this.contract.methods
      .addRemManagers(add, manager)
      .send();
    await confirmOperation(Tezos, operation.hash);
    return operation;
  }
  async setDevAddress(dev: string): Promise<TransactionOperation> {
    await this.updateStorage({});
    const operation = await this.contract.methods.set_dev_address(dev).send();

    await confirmOperation(Tezos, operation.hash);
    return operation;
  }
  async setFees(
    pool_id: BigNumber,
    fees: FeeType
  ): Promise<TransactionOperation> {
    await this.updateStorage({});
    const operation = await this.contract.methods
      .set_fees(
        pool_id,
        fees.lp_fee,
        fees.ref_fee,
        fees.dev_fee,
        fees.stakers_fee,
      )
      .send();

    await confirmOperation(Tezos, operation.hash);
    return operation;
  }
}
