import { ContractAbstraction, ContractProvider } from "@taquito/taquito";
import { TransactionOperation } from "@taquito/taquito/dist/types/operations/transaction-operation";
import { confirmOperation } from "./confirmation";
import { Token } from "./token";
import { TokenStorage } from "./types";
import { prepareProviderOptions, Tezos } from "./utils";
export const defaultTokenId = 0;

export class TokenFA2 implements Token {
  public contract: ContractAbstraction<ContractProvider>;
  public storage: TokenStorage | any;

  constructor(contract: ContractAbstraction<ContractProvider>) {
    this.contract = contract;
  }

  static async init(tokenAddress: string): Promise<TokenFA2> {
    return new TokenFA2(await Tezos.contract.at(tokenAddress));
  }

  async updateProvider(accountName: string): Promise<void> {
    let config = await prepareProviderOptions(accountName);
    await Tezos.setProvider(config);
  }

  async updateStorage(
    maps: {
      ledger?: string[];
    } = {}
  ): Promise<void> {
    const storage: any = await this.contract.storage();
    this.storage = {
      total_supply: await storage.total_supply[defaultTokenId],
      ledger: {},
    };
    for (let key in maps) {
      this.storage[key] = await maps[key].reduce(async (prev, current) => {
        try {
          return {
            ...(await prev),
            [current]: await storage[key].get(current),
          };
        } catch (ex) {
          return {
            ...(await prev),
            [current]: 0,
          };
        }
      }, Promise.resolve({}));
    }
  }

  async transfer(
    from: string,
    to: string,
    amount: number
  ): Promise<TransactionOperation> {
    let operation = await this.contract.methods
      .transfer([
        {
          from_: from,
          txs: [
            {
              token_id: defaultTokenId,
              amount: amount,
              to_: to,
            },
          ],
        },
      ])
      .send();

    await confirmOperation(Tezos, operation.hash);
    return operation;
  }

  async approve(to: string, amount: number): Promise<TransactionOperation> {
    return await this.updateOperators([
      {
        option: "add_operator",
        param: {
          owner: await Tezos.signer.publicKeyHash(),
          operator: to,
          token_id: defaultTokenId,
        },
      },
    ]);
  }

  async balanceOf(
    requests: {
      owner: string;
      token_id: number;
    }[],
    contract: string
  ): Promise<TransactionOperation> {
    let operation = await this.contract.methods
      .balance_of({ requests, contract })
      .send();
    await confirmOperation(Tezos, operation.hash);
    return operation;
  }

  async tokenMetadataRegistry(receiver: string): Promise<TransactionOperation> {
    let operation = await this.contract.methods
      .token_metadata_registry(receiver)
      .send();
    await confirmOperation(Tezos, operation.hash);
    return operation;
  }

  async updateOperators(
    params: {
      option: "add_operator" | "remove_operator";
      param: {
        owner: string;
        operator: string;
        token_id: number;
      };
    }[]
  ): Promise<TransactionOperation> {
    let operation = await this.contract.methods
      .update_operators(
        params.map((param) => {
          return {
            [param.option]: param.param,
          };
        })
      )
      .send();
    await confirmOperation(Tezos, operation.hash);
    return operation;
  }
}
