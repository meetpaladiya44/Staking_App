// import { chain } from "@/app/chain";
// import { client } from "@/app/client";
// import { getContract } from "thirdweb";
// import { STAKING_CONTRACT_ABI } from "./stakingContractABI";

// // Replace <contract_address> with the contract address of your contract
// const stakeTokenContractAddress = process.env.NEXT_PUBLIC_STAKE_TOKEN_CONTRACT_ADDRESS!;
// const rewardTokenContractAddress = process.env.NEXT_PUBLIC_REWARD_TOKEN_CONTRACT_ADDRESS!;
// const stakingContractAddress = process.env.NEXT_PUBLIC_STAKING_CONTRACT_ADDRESS!;

// export const STAKE_TOKEN_CONTRACT = getContract({
//     client: client,
//     chain: chain,
//     address: stakeTokenContractAddress,
// });

// export const REWARD_TOKEN_CONTRACT = getContract({
//     client: client,
//     chain: chain,
//     address: rewardTokenContractAddress,
// });


// export const STAKING_CONTRACT = getContract({
//     client: client,
//     chain: chain,
//     address: stakingContractAddress,
//     abi: STAKING_CONTRACT_ABI
// });