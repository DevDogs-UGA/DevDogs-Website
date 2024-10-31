import Link from "next/link";
import Image from "next/image";

export default function PaymentTierCard({ image, link, title, color }) {
  return (
    <Link href={link} target="_blank">
      {/* <Image
        className="relative rounded-t-[50px]"
        src={image}
        lazy={true}
        width={250}
        height={250}
        alt="Payment Tier Card"
      /> */}

      <div
        style={{ backgroundColor: color }}
        className="h-[200px] w-[250px] rounded-t-[50px]"
      ></div>

      <div className="relative top-full h-[3rem] w-[100%] rounded-b-[50px] bg-[#3A3A3A] pt-1 text-center font-bold text-white">
        <p>{title}</p>
      </div>
    </Link>
  );
}
