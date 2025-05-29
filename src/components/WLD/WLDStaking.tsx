// components/WLDStaking.tsx
'use client'

import { useState, useEffect } from "react";
import {
  useAddress,
  useContract,
  useContractRead,
  useContractWrite,
  ConnectWallet,
  useTokenBalance,
} from "@thirdweb-dev/react";
import { ethers, BigNumber } from "ethers";

const WLD_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_WLD_TOKEN_ADDRESS!;
const STAKING_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_STAKING_CONTRACT_ADDRESS!;

interface StakeInfo {
  _tokensStaked: BigNumber;
  _rewards: BigNumber;
  _timeOfLastUpdate: BigNumber;
}

export default function WLDStaking() {
  const address = useAddress();
  const [stakeAmount, setStakeAmount] = useState<string>("");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");

  // Contract instances
  const { contract: stakingContract } = useContract(STAKING_CONTRACT_ADDRESS);
  const { contract: wldContract } = useContract(WLD_TOKEN_ADDRESS);

  // Read user's WLD balance
  const { data: wldBalance, isLoading: wldBalanceLoading } = useTokenBalance(
    wldContract,
    address
  );

  // Read user's staked balance and rewards
  const { data: stakeInfo, isLoading: stakeInfoLoading } = useContractRead(
    stakingContract,
    "getStakeInfo",
    [address]
  ) as { data: StakeInfo | undefined; isLoading: boolean };

  // Read available rewards to claim
  const { data: availableRewards, isLoading: rewardsLoading } = useContractRead(
    stakingContract,
    "availableRewards",
    [address]
  );

  // Contract write functions
  const { mutateAsync: approveTokens, isLoading: approveLoading } = useContractWrite(
    wldContract,
    "approve"
  );

  const { mutateAsync: stakeTokens, isLoading: stakeLoading } = useContractWrite(
    stakingContract,
    "stake"
  );

  const { mutateAsync: withdrawTokens, isLoading: withdrawLoading } = useContractWrite(
    stakingContract,
    "withdraw"
  );

  const { mutateAsync: claimRewards, isLoading: claimLoading } = useContractWrite(
    stakingContract,
    "claimRewards"
  );

  // Check current allowance
  const { data: allowance } = useContractRead(
    wldContract,
    "allowance",
    [address, STAKING_CONTRACT_ADDRESS]
  );

  const formatTokenAmount = (amount: BigNumber | undefined): string => {
    if (!amount) return "0";
    return parseFloat(ethers.utils.formatEther(amount)).toFixed(4);
  };

  const handleStake = async (): Promise<void> => {
    try {
      if (!stakeAmount || parseFloat(stakeAmount) <= 0) {
        alert("Please enter a valid amount");
        return;
      }

      const amountInWei = ethers.utils.parseEther(stakeAmount);
      
      // Check if approval is needed
      if (!allowance || (allowance as BigNumber).lt(amountInWei)) {
        console.log("Approving tokens...");
        await approveTokens({
          args: [STAKING_CONTRACT_ADDRESS, amountInWei],
        });
      }

      console.log("Staking tokens...");
      await stakeTokens({
        args: [amountInWei],
      });

      setStakeAmount("");
      alert("WLD tokens staked successfully!");
    } catch (error) {
      console.error("Staking failed:", error);
      alert("Staking failed. Please try again.");
    }
  };

  const handleWithdraw = async (): Promise<void> => {
    try {
      if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
        alert("Please enter a valid amount");
        return;
      }

      const amountInWei = ethers.utils.parseEther(withdrawAmount);

      await withdrawTokens({
        args: [amountInWei],
      });

      setWithdrawAmount("");
      alert("WLD tokens withdrawn successfully!");
    } catch (error) {
      console.error("Withdrawal failed:", error);
      alert("Withdrawal failed. Please try again.");
    }
  };

  const handleClaimRewards = async (): Promise<void> => {
    try {
      await claimRewards({
        args: [],
      });
      alert("WLD rewards claimed successfully!");
    } catch (error) {
      console.error("Claim failed:", error);
      alert("Claim failed. Please try again.");
    }
  };

  const handleMaxStake = (): void => {
    if (wldBalance) {
      setStakeAmount(ethers.utils.formatEther(wldBalance.value));
    }
  };

  const handleMaxWithdraw = (): void => {
    if (stakeInfo?._tokensStaked) {
      setWithdrawAmount(ethers.utils.formatEther(stakeInfo._tokensStaked));
    }
  };

  if (!address) {
    return (
      <div className="container mx-auto p-8 text-center">
        <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">WLD Staking</h1>
            <p className="text-gray-600">Stake your Worldcoin tokens and earn rewards</p>
          </div>
          <div className="mb-6">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-white font-bold text-xl">WLD</span>
            </div>
          </div>
          <p className="text-gray-600 mb-6">Connect your wallet to start staking WLD tokens</p>
          <ConnectWallet 
            theme="dark"
            btnTitle="Connect Wallet"
            className="w-full"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 py-8">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-center mb-8 bg-white rounded-lg shadow-sm p-6">
            <div className="mb-4 sm:mb-0">
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">WLD</span>
                </div>
                Worldcoin Staking
              </h1>
              <p className="text-gray-600 mt-1">Stake WLD tokens and earn rewards</p>
            </div>
            <ConnectWallet theme="dark" />
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-gray-400">
              <h3 className="font-semibold text-gray-600 text-sm uppercase tracking-wide">Wallet Balance</h3>
              <p className="text-2xl font-bold text-gray-800 mt-2">
                {wldBalanceLoading ? "..." : formatTokenAmount(wldBalance?.value)} WLD
              </p>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue-500">
              <h3 className="font-semibold text-gray-600 text-sm uppercase tracking-wide">Staked Amount</h3>
              <p className="text-2xl font-bold text-blue-600 mt-2">
                {stakeInfoLoading ? "..." : 
                  formatTokenAmount(stakeInfo?._tokensStaked)
                } WLD
              </p>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-green-500">
              <h3 className="font-semibold text-gray-600 text-sm uppercase tracking-wide">Available Rewards</h3>
              <p className="text-2xl font-bold text-green-600 mt-2">
                {rewardsLoading ? "..." : 
                  formatTokenAmount(availableRewards)
                } WLD
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-purple-500">
              <h3 className="font-semibold text-gray-600 text-sm uppercase tracking-wide">Total Earned</h3>
              <p className="text-2xl font-bold text-purple-600 mt-2">
                {stakeInfoLoading ? "..." : 
                  formatTokenAmount(stakeInfo?._rewards)
                } WLD
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Staking Section */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm">+</span>
                </div>
                Stake WLD Tokens
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amount to Stake
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-16"
                      step="0.01"
                      min="0"
                    />
                    <button
                      onClick={handleMaxStake}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-600 hover:text-blue-800 font-medium text-sm"
                    >
                      MAX
                    </button>
                  </div>
                </div>
                
                <button
                  onClick={handleStake}
                  disabled={stakeLoading || approveLoading || !stakeAmount}
                  className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {stakeLoading || approveLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      {approveLoading ? "Approving..." : "Staking..."}
                    </span>
                  ) : (
                    "Stake WLD Tokens"
                  )}
                </button>
              </div>
            </div>

            {/* Withdraw Section */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-2">
                <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm">-</span>
                </div>
                Withdraw Staked Tokens
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amount to Withdraw
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent pr-16"
                      step="0.01"
                      min="0"
                    />
                    <button
                      onClick={handleMaxWithdraw}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-600 hover:text-red-800 font-medium text-sm"
                    >
                      MAX
                    </button>
                  </div>
                </div>
                
                <button
                  onClick={handleWithdraw}
                  disabled={withdrawLoading || !withdrawAmount}
                  className="w-full py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {withdrawLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Withdrawing...
                    </span>
                  ) : (
                    "Withdraw Tokens"
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Claim Rewards Section */}
          <div className="mt-8 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg shadow-sm p-6 border border-green-200">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-2">Claim Your Rewards</h2>
                <p className="text-gray-600">
                  You have <span className="font-semibold text-green-600">
                    {formatTokenAmount(availableRewards)} WLD
                  </span> available to claim
                </p>
              </div>
              <button
                onClick={handleClaimRewards}
                disabled={claimLoading || !availableRewards || (availableRewards as BigNumber)?.eq(0)}
                className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {claimLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Claiming...
                  </span>
                ) : (
                  "Claim Rewards"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}