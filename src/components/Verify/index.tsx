'use client';
import { Button, LiveFeedback, CircularIcon } from '@worldcoin/mini-apps-ui-kit-react';
import { MiniKit, VerificationLevel } from '@worldcoin/minikit-js';
import { useState } from 'react';
import { ShieldCheck, Eye } from 'iconoir-react';

/**
 * This component is an example of how to use World ID in Mini Apps
 * Minikit commands must be used on client components
 * It's critical you verify the proof on the server side
 * Read More: https://docs.world.org/mini-apps/commands/verify#verifying-the-proof
 */
export const Verify = () => {
  const [buttonState, setButtonState] = useState<
    'pending' | 'success' | 'failed' | undefined
  >(undefined);

  const [whichVerification, setWhichVerification] = useState<VerificationLevel>(
    VerificationLevel.Device,
  );

  const onClickVerify = async (verificationLevel: VerificationLevel) => {
    setButtonState('pending');
    setWhichVerification(verificationLevel);
    const result = await MiniKit.commandsAsync.verify({
      action: 'staking-application', // Make sure to create this in the developer portal -> incognito actions
      verification_level: verificationLevel,
    });
    console.log(result.finalPayload);
    // Verify the proof
    const response = await fetch('/api/verify-proof', {
      method: 'POST',
      body: JSON.stringify({
        payload: result.finalPayload,
        action: 'staking-application',
      }),
    });

    const data = await response.json();
    if (data.verifyRes.success) {
      setButtonState('success');
      // Normally you'd do something here since the user is verified
      // Here we'll just do nothing
    } else {
      setButtonState('failed');

      // Reset the button state after 3 seconds
      setTimeout(() => {
        setButtonState(undefined);
      }, 2000);
    }
  };

  return (
    <div className="px-6 pb-6 space-y-6">
      {/* Header Section */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <CircularIcon 
            size="lg" 
            className="bg-gradient-to-r from-green-600 to-teal-600 shadow-lg"
          >
            <ShieldCheck className="h-6 w-6 text-white" />
          </CircularIcon>
        </div>
        <div>
          <h3 className="text-xl font-bold text-white mb-2">Identity Verification</h3>
          <p className="text-neutral-400 text-sm leading-relaxed">
            Verify your World ID to unlock enhanced features and increase your trust score in the platform
          </p>
        </div>
      </div>

      {/* Verification Benefits */}
      <div className="bg-gradient-to-r from-green-600/10 to-teal-600/10 border border-green-500/30 rounded-2xl p-4 space-y-3">
        <h4 className="text-green-400 font-semibold flex items-center gap-2">
          <span className="text-lg">✨</span>
          Verification Benefits
        </h4>
        <div className="space-y-2 text-sm text-neutral-300">
          <div className="flex items-center gap-2">
            <span className="text-green-400">•</span>
            <span>Higher staking limits</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">•</span>
            <span>Priority access to new features</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">•</span>
            <span>Enhanced security & trust</span>
          </div>
        </div>
      </div>

      {/* Verification Button */}
      <div className="space-y-3">
        <LiveFeedback
          state={
            whichVerification === VerificationLevel.Device
              ? buttonState
              : undefined
          }
          className="w-full"
        >
          <Button
            onClick={() => onClickVerify(VerificationLevel.Device)}
            disabled={buttonState === 'pending'}
            size="lg"
            variant="tertiary"
            className="w-full bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white font-semibold py-4 rounded-2xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 border-0 disabled:opacity-50 disabled:transform-none"
          >
            <div className="flex items-center justify-center gap-3">
              <Eye className="h-5 w-5" />
              <span>
                {buttonState === 'pending' 
                  ? 'Verifying...' 
                  : buttonState === 'success' 
                  ? 'Verified ✓' 
                  : 'Verify with World ID'
                }
              </span>
            </div>
          </Button>
        </LiveFeedback>
        
        {buttonState === 'success' && (
          <div className="bg-green-600/20 border border-green-500/50 rounded-xl p-3 text-center">
            <p className="text-green-400 text-sm font-medium">
              🎉 Verification successful! You can now access premium features.
            </p>
          </div>
        )}
        
        {buttonState === 'failed' && (
          <div className="bg-red-600/20 border border-red-500/50 rounded-xl p-3 text-center">
            <p className="text-red-400 text-sm font-medium">
              ⚠️ Verification failed. Please ensure you have World App installed and try again.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
