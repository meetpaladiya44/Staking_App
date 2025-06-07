"use client";
import { truncateAddress } from '@/utils/commonUtils';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import React, { useEffect, useState } from 'react'
import { BsCheck2, BsCopy } from 'react-icons/bs';

function Username() {
  const { data: session } = useSession();
  const [isCopied, setIsCopied] = useState(false);

  const displayText = session?.user?.username || truncateAddress(session?.user?.id || '')

  useEffect(() => {
    if (isCopied) {
      const timer = setTimeout(() => setIsCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isCopied]);

  const handleCopy = () => {
    const textToCopy = session?.user?.username || truncateAddress(session?.user?.id || '');
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
    }
  };


  return (
    <div className="flex items-center gap-2 bg-gradient-to-r from-gray-800 to-slate-800 rounded-full px-2 py-1 shadow-lg transition-shadow duration-300">
      {session?.user?.profilePictureUrl ? (
        <Image
          src={session?.user?.profilePictureUrl}
          alt="User profile"
          width={32}
          height={32}
          className="rounded-full h-6 w-6 object-cover border border-neutral-600"
        />
      ) : (
        <div className="h-6 w-6 rounded-full bg-blue-900 flex items-center justify-center text-white text-sm font-medium">
          {session?.user?.username?.charAt(0)?.toUpperCase() || '?'}
        </div>
      )}
      <div className="flex items-center gap-2.5">
        <span className="text-white text-sm font-medium truncate max-w-[150px]">{displayText}</span>
        <button
          onClick={handleCopy}
          className={`p-1 rounded-full transition-colors duration-200 ${isCopied ? 'bg-green-500/20 text-green-400' : 'text-white hover:bg-neutral-500/50'
            }`}
          aria-label={isCopied ? 'Copied' : 'Copy username or address'}
          title={isCopied ? 'Copied!' : 'Copy'}
        >
          {isCopied ? <BsCheck2 size={12} /> : <BsCopy size={12} />}
        </button>
      </div>
    </div>
  )
}

export default Username