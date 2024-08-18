import Card from "../../components/Card"

import nn from "../../images/officers/nn.jpg"
import ks from "../../images/officers/ks.jpg"
import jb from "../../images/officers/jb.jpg"
import am from "../../images/officers/am.jpg"
import bm from "../../images/officers/bm.jpg"
import kds from "../../images/officers/kds.jpg"

const OurTeam = () =>
{
 return (
  <div className="section section-team">

   <div className="text-center mt-[2rem]">
    
    <h1 className="font-bold text-[3rem] md:text-[3.5rem] lg:text-[4rem]">Our <div class="red-bold">People</div></h1>
   </div>





   <h3 className="text-black text-[3rem] font-semibold text-center mt-[5rem] p-0"> 2024 - 2025 </h3>
   <h3 className="text-black text-[3rem] font-bold text-center">Executive Board</h3>




   <div id="grid"> 
    <Card name={'Justin Brand'} title={'President'} image={jb} bgcolor="brown-dark" />
    <Card name={'Nivedha Natarajan'} title={'Technical Officer'} image={nn} bgcolor="cyan-light" />
    <Card name={'Kelsey Sterner'} title={'Community Relations Officer'} image={ks} bgcolor="pink-light" />
    <Card name={'Avery Marco'} title={'Instructional Officer'} image={am} bgcolor="pink" />
    <Card name={'Kade Styron'} title={'Corporate & Career Officer'} image={kds} bgcolor="pink-dark" />
    <Card name={'Bryant Monahan'} title={'Campus Initiatives Officer'} image={bm} bgcolor="brown-light" />
   </div>
   <div className="p-4"></div>
  </div>
 )
}

export default OurTeam;
