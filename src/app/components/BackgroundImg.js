import Image from 'next/image'
import background from '../images/background.png'
 
export default function Background() {
  return (
    <Image
      alt="Background"
      src={background}
      placeholder="blur"
      quality={100}
      fill
      priority = {false}
      sizes="100vw"
      style={{
        objectFit: 'cover',
      }}
    />
  )
}