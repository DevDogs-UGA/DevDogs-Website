import React from 'react'
import ks from "@/app/images/officers/ks.jpg"
import Image from 'next/image'
import { GitHubIcon } from '@/app/images/github.svg';
import Link from 'next/link';

export default function FlippableCard({ image })
{
  return (
    <div className=' place-content-center flex'>
      <div className=' w-[20rem] h-[25rem] bg-transparent cursor-pointer group rounded-3xl bg-black perspective-1000'>
        <div className='relative w-full h-full  preserve-3d group-hover:rotate-y-180 duration-500'>
          <div className=' absolute rounded-3xl overflow-hidden backface-hidden'>
            <Image src={image} className='w-full h-full' />

          </div>
          <div className="absolute bg-black bg-opacity-75 text-white rotate-y-180 w-full h-full rounded-3xl  space-y-5 overflow-hidden backface-hidden">

            <div className='mt-10 text-center'>

              <span className='font-extrabold text-3xl'> test</span>
            </div>
            <div className='mt-10 text-center'>
              <span className='font-semibold text-xl'> test test</span>
            </div>

            <div className='mt-10 text-center'>
              <Link target="_blank" href={"www.github.com"} >Github</Link>
            </div>



          </div>
        </div>

      </div>

    </div>
  )
}
