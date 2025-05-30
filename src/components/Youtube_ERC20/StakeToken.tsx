'use client';

import { ConnectButton, TransactionButton, useActiveAccount, useReadContract } from "thirdweb/react";
import { approve, balanceOf } from "thirdweb/extensions/erc20";
import { REWARD_TOKEN_CONTRACT, STAKE_TOKEN_CONTRACT, STAKING_CONTRACT } from "../../../utils/contracts";
import { prepareContractCall, toEther, toWei } from "thirdweb";
import { useEffect, useState } from "react";
import { client } from "@/app/client";
import { chain } from "@/app/chain";
import styles from '../../app/page.module.css';

type StakingStateType = "init" | "approved";

export const StakeToken = () => {
    const account = useActiveAccount();

    const [stakeAmount, setStakeAmount] = useState(0);
    const [withdrawAmount, setWithdrawAmount] = useState(0);
    const [stakingState, setStakingState] = useState<StakingStateType>("init");
    const [isStaking, setIsStaking] = useState(false);
    const [isWithdrawing, setIsWithdrawing] = useState(false);
    const [stakeError, setStakeError] = useState<string | null>(null);
    const [withdrawError, setWithdrawError] = useState<string | null>(null);

    const { data: stakingTokenBalance, isLoading: loadingStakeTokenBalance, refetch: refetchStakingTokenBalance } = useReadContract(
        balanceOf,
        {
            contract: STAKE_TOKEN_CONTRACT,
            address: account?.address || "",
            queryOptions: {
                enabled: !!account,
            }
        }
    );

    const { data: rewardTokenBalance, isLoading: loadingRewardTokenBalance, refetch: refetchRewardTokenBalance } = useReadContract(
        balanceOf,
        {
            contract: REWARD_TOKEN_CONTRACT,
            address: account?.address || "",
            queryOptions: {
                enabled: !!account,
            }
        }
    );

    const { data: stakeInfo, refetch: refetchStakeInfo } = useReadContract({
        contract: STAKING_CONTRACT,
        method: "getStakeInfo",
        params: [account?.address as string],
        queryOptions: {
            enabled: !!account,
        }
    });

    function truncate(value: string | number, decimalPlaces: number): number {
        const numericValue: number = Number(value);
        if (isNaN(numericValue)) {
            throw new Error('Invalid input: value must be a convertible to a number.');
        }
        const factor: number = Math.pow(10, decimalPlaces);
        return Math.trunc(numericValue * factor) / factor;
    }

    useEffect(() => {
        setInterval(() => {
            refetchData();
        }, 10000);
    }, []);

    const refetchData = () => {
        refetchStakeInfo();
    };

    const validateStake = (amount: number | "") => {
        if (amount === "" || Number(amount) <= 0) return 'Amount must be greater than 0.';
        if (!stakingTokenBalance || Number(toEther(stakingTokenBalance)) < Number(amount)) return 'Insufficient staking token balance.';
        return null;
    };
    const validateWithdraw = (amount: number | "") => {
        if (amount === "" || Number(amount) <= 0) return 'Amount must be greater than 0.';
        if (!stakeInfo || Number(toEther(stakeInfo[0])) < Number(amount)) return 'Cannot withdraw more than staked.';
        return null;
    };

    return (
        <div>
            {account && (
                <div className={styles.stakingCard}>
                    <ConnectButton 
                        client={client}
                        chain={chain}
                    />
                    <div className={styles.stakingBalances}>
                        <div className={styles.stakingBalanceRow}>
                            <span className={styles.stakingText}>
                                {loadingStakeTokenBalance
                                    ? "Loading..."
                                    : typeof stakingTokenBalance !== "undefined"
                                        ? `Staking Token: ${truncate(toEther(stakingTokenBalance), 2)}`
                                        : "Staking Token: 0"}
                            </span>
                        </div>
                        <div className={styles.stakingBalanceRow}>
                            <span className={styles.stakingText}>
                                {loadingRewardTokenBalance
                                    ? "Loading..."
                                    : typeof rewardTokenBalance !== "undefined"
                                        ? `Reward Token: ${truncate(toEther(rewardTokenBalance), 2)}`
                                        : "Reward Token: 0"}
                            </span>
                        </div>
                    </div>
                    {stakeInfo && (
                        <>
                            <div className={styles.stakingButtons}>
                                <button
                                    className={styles.stakingButton}
                                    onClick={() => setIsStaking(true)}
                                >Stake</button>
                                <button
                                    className={styles.stakingButton}
                                    onClick={() => setIsWithdrawing(true)}
                                >Withdraw</button>
                            </div>
                            <div style={{ width: '100%' }}>
                                <p className={styles.stakingText}>Balance Staked: {truncate(toEther(stakeInfo[0]).toString(),2)}</p>
                                <p className={styles.stakingText}>Reward Balance: {truncate(toEther(stakeInfo[1]).toString(),2)}</p>
                                <TransactionButton
                                    className={styles.claimButton}
                                    transaction={() => (
                                        prepareContractCall({
                                            contract: STAKING_CONTRACT,
                                            method: "claimRewards",
                                        })
                                    )}
                                    onTransactionConfirmed={() => {
                                        refetchData();
                                        refetchStakingTokenBalance();
                                        refetchRewardTokenBalance();
                                    }}
                                >Claim Rewards</TransactionButton>
                            </div>
                        </>
                    )}
                    {isStaking && (
                        <div className={styles.stakingModalOverlay}>
                            <div className={styles.stakingModal}>
                                <button
                                    className={styles.closeModalBtn}
                                    onClick={() => {
                                        setIsStaking(false)
                                        setStakeAmount(0);
                                        setStakingState("init");
                                        setStakeError(null);
                                    }}
                                >✕</button>
                                <h3 className={styles.stakingText}>Stake</h3>
                                <p className={styles.stakingText}>Balance: {toEther(stakingTokenBalance!)}</p>
                                {stakingState === "init" ? (
                                    <>
                                        <input 
                                            type="number" 
                                            placeholder="0.0"
                                            value={stakeAmount}
                                            onChange={(e) => {
                                                const val = e.target.value === "" ? 0 : parseFloat(e.target.value);
                                                setStakeAmount(val);
                                                setStakeError(validateStake(val));
                                            }}
                                            className={styles.stakingInput}
                                        />
                                        {stakeError && (
                                            <div className={styles.errorBox}>{stakeError}</div>
                                        )}
                                        {stakeError ? (
                                            <button className={`${styles.stakingButton} ${styles.stakingButtonDisabled}`} disabled>
                                                Set Approval
                                            </button>
                                        ) : (
                                            <TransactionButton
                                                className={styles.stakingButton}
                                                transaction={() => (
                                                    approve({
                                                        contract: STAKE_TOKEN_CONTRACT,
                                                        spender: STAKING_CONTRACT.address as `0x${string}`,
                                                        amount: stakeAmount,
                                                    })
                                                )}
                                                onTransactionConfirmed={() => setStakingState("approved")}
                                            >Set Approval</TransactionButton>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <h3 className={styles.stakingText} style={{ margin: "10px 0" }}>{stakeAmount}</h3>
                                        <TransactionButton
                                            className={styles.stakingButton}
                                            transaction={() => (
                                                prepareContractCall({
                                                    contract: STAKING_CONTRACT,
                                                    method: "stake",
                                                    params: [toWei(stakeAmount.toString())],
                                                })
                                            )}
                                            onTransactionConfirmed={() => {
                                                setStakeAmount(0);
                                                setStakingState("init")
                                                refetchData();
                                                refetchStakingTokenBalance();
                                                setIsStaking(false);
                                                setStakeError(null);
                                            }}
                                        >Stake</TransactionButton>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                    {isWithdrawing && (
                        <div className={styles.stakingModalOverlay}>
                            <div className={styles.stakingModal}>
                                <button
                                    className={styles.closeModalBtn}
                                    onClick={() => {
                                        setIsWithdrawing(false)
                                        setWithdrawError(null);
                                    }}
                                >✕</button>
                                <h3 className={styles.stakingText}>Withdraw</h3>
                                <input 
                                    type="number" 
                                    placeholder="0.0"
                                    value={withdrawAmount}
                                    onChange={(e) => {
                                        const val = e.target.value === "" ? 0 : parseFloat(e.target.value);
                                        setWithdrawAmount(val);
                                        setWithdrawError(validateWithdraw(val));
                                    }}
                                    className={styles.stakingInput}
                                />
                                {withdrawError && (
                                    <div className={styles.errorBox}>{withdrawError}</div>
                                )}
                                {withdrawError ? (
                                    <button className={`${styles.stakingButton} ${styles.stakingButtonDisabled}`} disabled>
                                        Withdraw
                                    </button>
                                ) : (
                                    <TransactionButton
                                        className={styles.stakingButton}
                                        transaction={() => (
                                            prepareContractCall({
                                                contract: STAKING_CONTRACT,
                                                method: "withdraw",
                                                params: [toWei(withdrawAmount.toString())],
                                            })
                                        )}
                                        onTransactionConfirmed={() => {
                                            setWithdrawAmount(0);
                                            refetchData();
                                            refetchStakingTokenBalance();
                                            setIsWithdrawing(false);
                                            setWithdrawError(null);
                                        }}
                                    >Withdraw</TransactionButton>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
};