'use client'
import { Influencer } from '@/types/types'
import { Button, Marble } from '@worldcoin/mini-apps-ui-kit-react'
import { CheckCircleSolid } from 'iconoir-react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { useEffect, useState } from 'react'

interface InfluencerWithSubscription extends Influencer {
  isSubscribed?: boolean
  subscribers?: string[]
}

export const Influencers = () => {
  const { data: session } = useSession()
  const [influencers, setInfluencers] = useState<InfluencerWithSubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [subscribingTo, setSubscribingTo] = useState<number | null>(null)
  const [subscriptionMessage, setSubscriptionMessage] = useState<string | null>(null)

  useEffect(() => {
    const fetchInfluencers = async () => {
      try {
        const response = await fetch('/api/top-influencers')
        const data = await response.json()
        console.log('Top Influencers: ', data)

        const influencersWithSubscriptionStatus = (data.influencers || []).map(
          (influencer: InfluencerWithSubscription) => ({
            ...influencer,
            isSubscribed: session?.user?.username
              ? influencer.subscribers?.includes(session.user.username) || false
              : false,
          })
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
      setSubscriptionMessage('Please log in to subscribe')
      return
    }

    setSubscribingTo(influencerId)
    setSubscriptionMessage(null)

    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          influencerId,
          username: session.user?.username,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        console.log(`Successfully subscribed to ${influencerName}`)
        setSubscriptionMessage(`Successfully subscribed to @${influencerName}!`)

        setInfluencers((prevInfluencers) =>
          prevInfluencers.map((influencer) =>
            influencer.id === influencerId
              ? {
                  ...influencer,
                  isSubscribed: true,
                  subscribers: [...(influencer.subscribers || []), session.user?.username || ''],
                }
              : influencer
          )
        )
      } else {
        console.error('Subscription failed:', result.error)
        setSubscriptionMessage(result.error || 'Subscription failed')
      }
    } catch (error) {
      console.error('Error subscribing:', error)
      setSubscriptionMessage('Network error. Please try again.')
    } finally {
      setSubscribingTo(null)
      setTimeout(() => setSubscriptionMessage(null), 3000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="!animate-spin rounded-full h-8 w-8 border-2 !border-blue-600 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="w-full bg-neutral-900 border-none shadow-md">
      <div className="px-6 py-5 border-b border-neutral-800">
        <h2 className="text-2xl font-semibold text-neutral-100 font-['Inter'] tracking-tight">
          Top Crypto Influencers
        </h2>
        {subscriptionMessage && (
          <div
            className={`mt-3 p-3 rounded-lg text-sm font-medium font-['Inter'] transition-all duration-300 ${
              subscriptionMessage.includes('Successfully')
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}
          >
            {subscriptionMessage}
          </div>
        )}
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
              className={`rounded-full py-2 w-full text-sm font-medium border transition-all duration-200 ${
                influencer.isSubscribed
                  ? '!text-green-700 border !border-green-700 hover:!bg-green-200'
                  : '!text-neutral-100 !bg-blue-600 hover:!bg-blue-700'
              }`}
            >
              {subscribingTo === influencer.id ? (
                <div className="flex items-center space-x-2">
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
          </div>
        ))}
        {influencers.length === 0 && (
          <div className="text-center py-8">
            <span className="text-base text-neutral-400 font-['Inter']">No influencers found</span>
          </div>
        )}
      </div>
    </div>
  )
}