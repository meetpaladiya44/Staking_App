'use client'
import { Influencer, InfluencerWithSubscription } from '@/types/types'
import { Button, LiveFeedback, Marble, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@worldcoin/mini-apps-ui-kit-react'
import { MiniKit } from '@worldcoin/minikit-js'
import { CheckCircleSolid } from 'iconoir-react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { useEffect, useState } from 'react'

export const Influencers = () => {
  const { data: session } = useSession()
  const [influencers, setInfluencers] = useState<InfluencerWithSubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [subscribingTo, setSubscribingTo] = useState<number | null>(null)
  const [subscriptionMessages, setSubscriptionMessages] = useState<{ [key: number]: string }>({})
  const [showUsernameAlert, setShowUsernameAlert] = useState(false)

  useEffect(() => {
    const fetchInfluencers = async () => {
      try {
        const username = MiniKit.user.username;
        const response = await fetch('/api/top-influencers')
        const data = await response.json()
        console.log('Top Influencers: ', data)
        console.log('username: ', username);

        const userAddress = session?.user?.username
          ? (await MiniKit.getUserByUsername(`${session.user.username}`))?.walletAddress
          : null

        const influencersWithSubscriptionStatus = (data.influencers || []).map(
          (influencer: InfluencerWithSubscription) => {
            // Check if user is subscribed by either username or wallet address
            const isSubscribed = influencer.subscribers?.some(subscriber =>
              (session?.user?.username && subscriber.username === session.user.username) ||
              (userAddress && subscriber.address === userAddress)
            ) || false

            return {
              ...influencer,
              isSubscribed,
            }
          }
        )

        setInfluencers(influencersWithSubscriptionStatus)
      } catch (error) {
        console.error('Error fetching influencers:', error)
      } finally {
        setLoading(false)
      }
    }

    if (session !== undefined) {
      fetchInfluencers()
    }
  }, [session])

  const handleSubscribe = async (influencerId: number, influencerName: string) => {
    if (!session) {
      setSubscriptionMessages(prev => ({
        ...prev,
        [influencerId]: 'Please log in to subscribe'
      }))
      setTimeout(() => {
        setSubscriptionMessages(prev => {
          const { [influencerId]: _, ...rest } = prev
          return rest
        })
      }, 5000)
      return
    }

    const address = (await MiniKit.getUserByUsername(`${session.user?.username}`)).walletAddress;
    // const username = session.user?.username;
    const username = null;

    if (username === null || username === undefined) {
      setShowUsernameAlert(true)
      return
    }

    setSubscribingTo(influencerId)
    setSubscriptionMessages(prev => {
      const { [influencerId]: _, ...rest } = prev
      return rest
    })

    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          influencerId,
          username: username,
          walletAddress: address,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        console.log(`Successfully subscribed to ${influencerName}`)
        setSubscriptionMessages(prev => ({
          ...prev,
          [influencerId]: `Successfully subscribed to @${influencerName}!`
        }))

        // Update local state with new subscriber object
        setInfluencers((prevInfluencers) =>
          prevInfluencers.map((influencer) =>
            influencer.id === influencerId
              ? {
                ...influencer,
                isSubscribed: true,
                subscribers: [
                  ...(influencer.subscribers || []),
                  {
                    username: session.user?.username || '',
                    address: address || '',
                    subscribedAt: new Date()
                  }
                ],
              }
              : influencer
          )
        )
      } else {
        console.error('Subscription failed:', result.error)
        setSubscriptionMessages(prev => ({
          ...prev,
          [influencerId]: result.error || 'Subscription failed'
        }))
      }
    } catch (error) {
      console.error('Error subscribing:', error)
      setSubscriptionMessages(prev => ({
        ...prev,
        [influencerId]: 'Network error. Please try again.'
      }))
    } finally {
      setSubscribingTo(null)
      setTimeout(() => {
        setSubscriptionMessages(prev => {
          const { [influencerId]: _, ...rest } = prev
          return rest
        })
      }, 3000)
    }
  }

  // Loading state with skeleton loaders
  if (loading) {
    return (
      <div className="w-full bg-neutral-900 rounded-2xl border-none shadow-md">
        <div className="px-6 py-5 border-b border-neutral-800">
          <h2 className="text-2xl font-semibold text-neutral-100 font-['Inter'] tracking-tight">
            Top Crypto Influencers
          </h2>
        </div>
        <div className="p-6 space-y-4">
          {[...Array(5)].map((_, index) => (
            <div
              key={index}
              className="flex flex-col gap-2 items-center justify-between p-4 bg-neutral-800/50 border-none animate-pulse"
            >
              <div className="flex items-center space-x-4 w-full">
                <div className="h-10 w-10 rounded-full bg-neutral-700"></div>
                <div className="flex flex-col flex-1">
                  <div className="h-4 bg-neutral-700 rounded w-24 mb-2"></div>
                  <div className="h-3 bg-neutral-700 rounded w-20"></div>
                </div>
              </div>
              <div className="w-full h-10 bg-neutral-700 rounded-full"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="w-full bg-zinc-900 rounded-3xl border-none shadow-md">
        <div className="px-6 py-5 border-b border-neutral-800">
          <h2 className="text-2xl font-semibold text-neutral-100 tracking-tight">
            Top Crypto Influencers
          </h2>
        </div>
        <div className="p-6 space-y-4">
          {influencers.map((influencer: InfluencerWithSubscription) => (
            <div
              key={influencer.id}
              className="flex flex-col gap-2 items-center justify-between p-4 bg-neutral-800/50 border-none hover:bg-neutral-800/70 transition-all duration-200"
            >
              <div className="flex items-center space-x-4">
                <Marble
                  src={influencer.image}
                  className="h-10 w-10 rounded-full object-cover"
                  alt={influencer.name}
                />
                <div className="flex flex-col">
                  <span className="text-base font-medium text-neutral-100 font-['Inter']">
                    @{influencer.name}
                  </span>
                  <span className="text-sm text-neutral-400 font-['Inter']">
                    {influencer.subscribers?.length || 0} subscribers
                  </span>
                </div>
              </div>
              <Button
                variant={influencer.isSubscribed ? 'secondary' : 'primary'}
                onClick={() => !influencer.isSubscribed && handleSubscribe(influencer.id, influencer.name)}
                disabled={subscribingTo === influencer.id || !session || influencer.isSubscribed}
                className={`rounded-full py-2 w-full text-sm font-medium border transition-all duration-200 ${influencer.isSubscribed
                  ? '!text-green-700 border !border-green-700 hover:!bg-green-200'
                  : '!text-neutral-100 !bg-blue-600 hover:!bg-blue-700'
                  }`}
              >
                {subscribingTo === influencer.id ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-neutral-100"></div>
                    <span>Subscribing...</span>
                  </div>
                ) : influencer.isSubscribed ? (
                  <div className="flex items-center space-x-2">
                    <CheckCircleSolid className="h-5 w-5" />
                    <span>Subscribed</span>
                  </div>
                ) : !session ? (
                  'Login to Subscribe'
                ) : (
                  'Subscribe'
                )}
              </Button>
              {subscriptionMessages[influencer.id] && subscriptionMessages[influencer.id].includes('Successfully') && (
                <div
                  className={`mt-2 p-3 rounded-full text-xs font-medium transition-all duration-300 w-full text-center bg-green-500/20 text-green-400 border border-green-500/30`}
                >
                  {subscriptionMessages[influencer.id]}
                </div>
              )}
            </div>
          ))}
          {influencers.length === 0 && (
            <div className="text-center py-8">
              <span className="text-base text-neutral-400 font-['Inter']">No influencers found</span>
            </div>
          )}
        </div>
      </div>

      {/* Username Required Alert Dialog */}
      <AlertDialog open={showUsernameAlert} onOpenChange={setShowUsernameAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <span className="!text-neutral-800">
                Username Required
              </span>
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            Username is required to subscribe to influencers. Please set your username in the World app settings.
            <br /><br />
            <strong>Steps:</strong>
            <br />
            1. Open World app
            <br />
            2. Go to Settings
            <br />
            3. Navigate to World ID
            <br />
            4. Set your username
          </AlertDialogDescription>
          <AlertDialogFooter>
            <Button
              onClick={() => setShowUsernameAlert(false)}
              className="!bg-blue-600 hover:!bg-blue-700 text-white"
            >
              Got it
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}