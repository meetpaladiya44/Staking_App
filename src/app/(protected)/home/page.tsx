import { auth } from '@/auth';
import { Page } from '@/components/PageLayout';
import { UserInfo } from '@/components/UserInfo';
import { Marble, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
import { Verify } from '@/components/Verify';
import { Influencers } from '@/components/Influencers';
import Username from '@/components/Username';
import InfoButton from '@/components/InfoButton';
import { StakingForm2 } from '@/components/StakingIntegration/StakingForm2';
import { StakingFormMain } from '@/components/StakingIntegration/StakeMain';
import AdminPage from '@/components/StakingIntegration/Admin';

export default async function Home() {
  const session = await auth();

  return (
    <>
      <Page.Header className="p-0 !bg-neutral-900 sticky top-0 z-50 border-b border-neutral-800">
        <div className='flex items-center justify-between p-3'>
          <Username />
          <InfoButton />
        </div>
      </Page.Header>

      <Page.Main className="min-h-screen bg-neutral-900">
        {/* Main Container with proper spacing */}
        <div className="w-full max-w-none space-y-8 pb-20 px-4">

          {/* Admin Section */}
          {/* <section className="w-full">
            <AdminPage />
          </section> */}

          {/* Staking Section */}
          <section className="w-full">
            <StakingFormMain />
          </section>

          {/* Additional Components Section */}
          <section className="w-full max-w-fit space-y-8">
            <div className="bg-neutral-800 rounded-2xl shadow-lg border border-neutral-700 overflow-hidden">
              <div className="border-b border-neutral-700 bg-neutral-800 px-6 py-4">
                <h2 className="text-xl font-bold text-white">Community & Verification</h2>
                <p className="text-neutral-400">Connect with influencers and verify your identity</p>
              </div>
              <div className="bg-neutral-800">
                <Influencers />
                <div className="border-t border-neutral-700 pt-6">
                  <Verify />
                </div>
              </div>
            </div>
          </section>

        </div>
      </Page.Main>
    </>
  );
}
