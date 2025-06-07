'use client'
import { Influencer, InfluencerWithSubscription } from '@/types/types'
import { Button, LiveFeedback, Marble, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@worldcoin/mini-apps-ui-kit-react'
import { MiniKit } from '@worldcoin/minikit-js'
import { CheckCircleSolid, Crown } from 'iconoir-react'
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
  const userAddress = session?.user?.id;
  const username = session?.user?.username;

  useEffect(() => {
    const fetchInfluencers = async () => {
      try {
        const response = await fetch('/api/top-influencers')
        const data = await response.json()
        console.log('Top Influencers: ', data)
        console.log('username: ', username);

        const influencersWithSubscriptionStatus = (data.influencers || []).map(
          (influencer: InfluencerWithSubscription) => {
            // Check if user is subscribed by either username or wallet address
            const isSubscribed = influencer.subscribers?.some(subscriber =>
              (username && subscriber.username === username) ||
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
          walletAddress: userAddress,
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
                    username: username || '',
                    address: userAddress || '',
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
      <div className="w-full bg-zinc-900 rounded-3xl border-none shadow-md transition-colors duration-200">
        <div className="px-6 py-5 border-b border-neutral-800">
          <h2 className="text-2xl font-semibold text-center text-neutral-100 tracking-tight">
            Top Crypto Influencers
          </h2>
        </div>
        <div className="space-y-4 p-4">
          {[...Array(3)].map((_, index) => (
            <div
              key={index}
              className="flex gap-2 items-center justify-between p-4 bg-neutral-800/50 border-none rounded-xl animate-pulse"
            >
              <div className="flex items-center space-x-4 w-full">
                <div className="h-6 w-6 rounded-full bg-neutral-700"></div>
                <div className="flex flex-col flex-grow">
                  <div className="h-4 w-32 bg-neutral-700 rounded mb-2"></div>
                  <div className="h-3 w-24 bg-neutral-700 rounded"></div>
                </div>
              </div>
              <div className="h-8 w-24 bg-neutral-700 rounded-full"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="w-full bg-neutral-900 rounded-3xl border-none shadow-md transition-colors duration-200">
        <div className="px-6 py-5 border-b border-neutral-800">
          <h2 className="text-2xl font-semibold text-center text-neutral-100 tracking-tight">
            Top Crypto Influencers
          </h2>
        </div>
        <div className="p-2 space-y-4">
          {influencers.map((influencer: InfluencerWithSubscription) => (
            <div
              key={influencer.id}
              className="flex gap-2 items-center justify-between p-4 bg-neutral-800/50 border-none hover:bg-neutral-800/70 transition-all duration-200 rounded-xl"
            >
              <div className="flex items-center space-x-4 w-full">
                <Marble
                  src={influencer.image}
                  className="h-6 w-6 rounded-full object-cover ring-2 ring-offset-2 ring-blue-500"
                  alt={influencer.name}
                />
                <div className="flex flex-col">
                  <span className="text-base font-medium text-neutral-100 font-['Inter']">
                    @{influencer.name}
                  </span>
                  <span className="text-sm text-neutral-400 font-['Inter'] flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    {influencer.subscribers?.length || 0} subscribers
                  </span>
                </div>
              </div>
              <Button
                variant={influencer.isSubscribed ? 'secondary' : 'primary'}
                onClick={() => !influencer.isSubscribed && handleSubscribe(influencer.id, influencer.name)}
                disabled={subscribingTo === influencer.id || !session || influencer.isSubscribed}
                className={`rounded-full py-2 text-sm font-medium border transition-all duration-200 ${influencer.isSubscribed
                  ? 'text-green-700 border border-green-700 !bg-green-50'
                  : 'text-white bg-blue-600 hover:!bg-blue-700'
                  }`}
              >
                {subscribingTo === influencer.id ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Subscribing...</span>
                  </div>
                ) : influencer.isSubscribed ? (
                  <div className="flex items-center justify-center space-x-2">
                    <CheckCircleSolid className="h-5 w-5" />
                    <span>Subscribed</span>
                  </div>
                ) : !session ? (
                  'Login to Subscribe'
                ) : (
                  <span className='flex items-center gap-2'>
                    <Crown className='h-5 w-5' />
                    <span className='text-sm'>
                      Subscribe
                    </span>
                  </span>
                )}
              </Button>
              {subscriptionMessages[influencer.id] && (
                <div
                  className={`mt-2 p-3 rounded-lg text-sm font-medium font-['Inter'] transition-all duration-300 w-full text-center ${subscriptionMessages[influencer.id].includes('Successfully')
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}
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
    </>
  )
}