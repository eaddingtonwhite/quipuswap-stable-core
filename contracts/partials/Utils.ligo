(* Helper function to get account *)
[@inline]
function get_account_balance(
  const key             : (address * pool_id_type);
  const ledger          : big_map((address * pool_id_type), nat))
                        : nat is
  case ledger[key] of
  | Some(instance) -> instance
  | None -> 0n
  end;

[@inline]
function nat_or_error(
  const value: int;
  const err: string
  ): nat is
  case is_nat(value) of
  | Some(natural) -> natural
  | None -> (failwith(err): nat)
  end;

(* Helper function to get pair info *)
function get_pair(
  const pair_id         : nat;
  const pools_bm        : big_map(pool_id_type, pair_type))
                        : pair_type is
  case pools_bm[pair_id] of
  | Some(instance) -> instance
  | None -> (failwith(ERRORS.pair_not_listed): pair_type)
  end;

(* Helper function to get pair info *)
function get_tokens(
  const pair_id         : nat;
  const tokens          : big_map(pool_id_type, tokens_type))
                        : tokens_type is
  case tokens[pair_id] of
  | Some(instance) -> instance
  | None -> (failwith(ERRORS.pair_not_listed): tokens_type)
  end;

(* Helper function to get pair info *)
function get_token(
  const token_id        : nat;
  const tokens          : tokens_type)
                        : token_type is
  case tokens[token_id] of
  | Some(instance) -> instance
  | None -> (failwith(ERRORS.no_token): token_type)
  end;

(* Helper function to get pair info *)
function get_input(
  const key         : token_pool_index;
  const inputs      : map(nat, nat))
                    : nat is
  case inputs[key] of
  | Some(instance) -> instance
  | None -> 0n
  end;

(* Helper function to get pair info *)
function get_token_info(
  const key         : token_pool_index;
  const tokens_info : map(token_pool_index, token_info_type))
                    : token_info_type is
  case tokens_info[key] of
  | Some(instance) -> instance
  | None ->  (failwith(ERRORS.no_token_info) : token_info_type)
  end;

(* Helper function to get pair info *)
function get_dev_rewards(
  const key         : token_type;
  const dev_rewards : big_map(token_type, nat))
                    : nat is
  case dev_rewards[key] of
  | Some(instance) -> instance
  | None ->  0n
  end;

function get_ref_rewards(
  const key         : (address * token_type);
  const ref_rewards : big_map((address * token_type), nat))
                    : nat is
  case ref_rewards[key] of
  | Some(instance) -> instance
  | None ->  0n
  end;

(* Helper function to get pair info *)
function get_address(
  const referral        : option(address);
  const default_ref     : address)
                        : address is
  case referral of
  | Some(instance) -> instance
  | None -> default_ref
  end;

(* Helper function to get token pair *)
function get_pair_info(
  const token_bytes     : bytes;
  const pools_count     : nat;
  const pool_to_id      : big_map(bytes, nat);
  const pools           : big_map(pool_id_type, pair_type))
                        : (pair_type * nat) is
  block {
    const token_id : nat =
      case pool_to_id[token_bytes] of
      | Some(instance) -> instance
      | None -> pools_count
      end;
    const pair : pair_type =
      case pools[token_id] of
      | Some(instance) -> instance
      | None -> (record [
          initial_A             = 0n;
          future_A              = 0n;
          initial_A_time        = Tezos.now;
          future_A_time         = Tezos.now;
          tokens_info           = (map []: map(token_pool_index, token_info_type));
          fee                   = record[
            dev_fee               = 0n;
            lp_fee                = 0n;
            ref_fee               = 0n;
            stakers_fee           = 0n;
          ];
          staker_accumulator    = record[
            accumulator           = (map []: map(token_pool_index, nat));
            total_staked          = 0n;
          ];
          proxy_contract        = (None: option (address));
          proxy_reward_acc      = (map []: map(token_type, nat));
          total_supply          = 0n;
        ]: pair_type)
      end;
  } with (pair, token_id)

// (* Helper function to wrap the pair for swap *)
// function form_pools(
//   const from_pool       : nat;
//   const to_pool         : nat;
//   const supply          : nat;
//   const direction       : swap_type)
//                         : pair_type is
//   case direction of
//     B_to_a -> record [
//       token_a_pool      = to_pool;
//       token_b_pool      = from_pool;
//       total_supply      = supply;
//     ]
//   | A_to_b -> record [
//       token_a_pool      = from_pool;
//       token_b_pool      = to_pool;
//       total_supply      = supply;
//     ]
//   end;

// (* Helper function to unwrap the pair for swap *)
// function form_swap_data(
//   const pair            : pair_type;
//   const swap            : tokens_type;
//   const direction       : swap_type)
//                         : swap_data_type is
//   block {
//     const side_a : swap_side_type = record [
//         pool            = pair.token_a_pool;
//         token           = swap.token_a_type;
//       ];
//     const side_b : swap_side_type = record [
//         pool            = pair.token_b_pool;
//         token           = swap.token_b_type;
//       ];
//   } with case direction of
//       A_to_b -> record [
//         from_           = side_a;
//         to_             = side_b;
//       ]
//     | B_to_a -> record [
//         from_           = side_b;
//         to_             = side_a;
//       ]
//     end;

(* Helper function to get fa2 token contract *)
function get_fa2_token_contract(
  const token_address   : address)
                        : contract(entry_fa2_type) is
  case (Tezos.get_entrypoint_opt("%transfer", token_address)
      : option(contract(entry_fa2_type))) of
    Some(contr) -> contr
  | None -> (failwith(ERRORS.wrong_token_entrypoint) : contract(entry_fa2_type))
  end;

(* Helper function to get fa1.2 token contract *)
function get_fa12_token_contract(
  const token_address   : address)
                        : contract(entry_fa12_type) is
  case (Tezos.get_entrypoint_opt("%transfer", token_address)
     : option(contract(entry_fa12_type))) of
    Some(contr) -> contr
  | None -> (failwith(ERRORS.wrong_token_entrypoint) : contract(entry_fa12_type))
  end;

(* Helper function to transfer the asset based on its standard *)
function typed_transfer(
  const owner           : address;
  const receiver        : address;
  const amount_         : nat;
  const token           : token_type)
                        : operation is
    case token of
      Fa12(token_address) -> Tezos.transaction(
        TransferTypeFA12(owner, (receiver, amount_)),
        0mutez,
        get_fa12_token_contract(token_address)
      )
    | Fa2(token_info) -> Tezos.transaction(
        TransferTypeFA2(list[
          record[
            from_ = owner;
            txs = list [ record [
                to_           = receiver;
                token_id      = token_info.token_id;
                amount        = amount_;
              ] ]
          ]
        ]),
        0mutez,
        get_fa2_token_contract(token_info.token_address)
      )
    end;

// (* Helper function to get the reentrancy entrypoint of the current contract *)
// [@inline]
// function check_reentrancy(
//   const entered         : bool)
//                         : bool is
//   if entered
//   then failwith(ERRORS.reentrancy)
//   else True

[@inline]
function div_ceil(
  const numerator       : nat;
  const denominator     : nat)
                        : nat is
  case ediv(numerator, denominator) of
    Some(result) -> if result.1 > 0n
      then result.0 + 1n
      else result.0
  | None -> (failwith(ERRORS.no_liquidity): nat)
  end;