import { InfoCircleSolid } from 'iconoir-react'
import React, { useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button
} from '@worldcoin/mini-apps-ui-kit-react'

function InfoButton() {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button className="inline-flex items-center justify-center rounded-md p-2 outline-none">
          <InfoCircleSolid className="h-5 w-5" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-white h-fit rounded-t-4xl">
        <span className='!text-neutral-900'>
          <AlertDialogHeader>
            <AlertDialogTitle>How to Use the World Trade Mini-App</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription className="space-y-3 text-sm text-neutral-800">
            <span className='inline-block pb-2'>
              <strong>Stake WLD:</strong> Connect your World Wallet, lock WLD tokens for 7 days in a secure smart contract. See your staked amount and lock timer.
            </span>
            <br />
            <span className='inline-block pb-2'>
              <strong>Follow Signals:</strong> Choose Maxxit accounts to follow for trading signals. Your selections are saved.
            </span>
            <br />
            <span className='inline-block pb-2'>
              <strong>Track Trades:</strong> Simulated trades run using your staked WLD. Check virtual P&L on the Trade History page.
            </span>
            <br />
            <span className='inline-block pb-2'>
              <strong>Earn Rewards:</strong> Profitable trades may earn real WLD rewards, claimable from the Rewards page.
            </span>
            <br />
            <span className='inline-block pb-2'>
              <strong>Withdraw Funds:</strong> After 7 days, click "Withdraw" to send your WLD back to your wallet.
            </span>
          </AlertDialogDescription>
        </span>
      </AlertDialogContent>
    </AlertDialog >
  )
}

export default InfoButton