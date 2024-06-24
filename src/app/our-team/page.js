import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import Card from "../components/Card"

import nn from "../images/officers/nn.jpg"
import ks from "../images/officers/ks.jpg"
import jb from "../images/officers/jb.jpg"
import am from "../images/officers/am.jpg"
import bm from "../images/officers/bm.jpg"
import kds from "../images/officers/kds.jpg"


const OurTeam = () => {
    return (
      
        
        <div class="section section-team">
        
        <div id="abouttitle">
            <h1><b class="red-bold">Our Team</b></h1>
        </div>

        <br />
        
        <div id="teamtitle">
            <h1 id="officertitle"><b>Officers</b></h1>
            <div id="grid">
                <Card name={'Justin Brand'} title={'President'} image={jb}/>
                <Card name={'Nivedha Natarajan'} title={'Technical Officer'} image={nn}/>
                <Card name={'Kelsey Sterner'} title={'Community Relations Officer'} image={ks}/>
                <Card name={'Avery Marco'} title={'Instructional Officer'} image={am}/>
                <Card name={'Kade Styron'} title={'Corporate & Career Officer'} image={kds}/>
                <Card name={'Bryant Monahan'} title={'Campus Initiatives Officer'} image={bm}/>
            </div>
            </div>
        </div>
    
       
    )
}

export default OurTeam;