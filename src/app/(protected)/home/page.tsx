import { auth } from '@/auth';
import { Page } from '@/components/PageLayout';
import { UserInfo } from '@/components/UserInfo';
import { Marble, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
import MainPage from '@/components/MainPage';
import { Influencers } from '@/components/Influencers';
import Username from '@/components/Username';
import InfoButton from '@/components/InfoButton';

export default async function Home() {
  const session = await auth();

  return (
    <>
      <Page.Header className="p-0 !bg-neutral-900">
        <div className='flex items-center justify-between p-3'>
          <Username />
          <InfoButton />
        </div>
      </Page.Header>
      <Page.Main className="flex flex-col items-center justify-start gap-4 mb-16 bg-neutral-900">
        {/* <UserInfo /> */}
        {/* <WLDStaking /> */}
        {/* <MainPage /> */}
        <Influencers />
      </Page.Main>
    </>
  );
}
