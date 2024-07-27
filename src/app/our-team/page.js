import Card from "../components/Card"

import nn from "../images/officers/nn.jpg"
import ks from "../images/officers/ks.jpg"
import jb from "../images/officers/jb.jpg"
import am from "../images/officers/am.jpg"
import bm from "../images/officers/bm.jpg"
import kds from "../images/officers/kds.jpg"

const OurTeam = () => {
    return (
        <div className="section section-team">
            <div id="teamstitle">
                <h1><b className="red-bold">Our Team</b></h1>
            </div>

            <div id="teamtitle">
                <h1 id="officertitle"><b>Leadership</b></h1>

                <br />
                <br />
                <br />
                <br />

                <div id="grid">
                    <Card name={'Justin Brand'} title={'President'} image={jb} bgcolor="brown-dark" />
                    <Card name={'Nivedha Natarajan'} title={'Technical Officer'} image={nn} bgcolor="cyan-light" />
                    <Card name={'Kelsey Sterner'} title={'Community Relations Officer'} image={ks} bgcolor="pink-light" />
                    <Card name={'Avery Marco'} title={'Instructional Officer'} image={am} bgcolor="pink" />
                    <Card name={'Kade Styron'} title={'Corporate & Career Officer'} image={kds} bgcolor="pink-dark" />
                    <Card name={'Bryant Monahan'} title={'Campus Initiatives Officer'} image={bm} bgcolor="brown-light" />
                    <br />
                </div>
            </div>
        </div>
    )
}

export default OurTeam;