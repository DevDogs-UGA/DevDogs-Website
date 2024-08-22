"use client"

import Card from "../../components/Card"
import EmblaCarousel from "../../components/EmblaCarousel";
import Caoursel1 from "@/app/images/carousel1.png"
import Caoursel2 from "@/app/images/carousel2.jpg"
import Caoursel3 from "@/app/images/carousel3.jpg"

import nn from "../../images/officers/nn.jpg"
import ks from "../../images/officers/ks.jpg"
import jb from "../../images/officers/jb.jpg"
import am from "../../images/officers/am.jpg"
import bm from "../../images/officers/bm.jpg"
import kds from "../../images/officers/kds.jpg"


const OurTeam = () => {
    const OPTIONS = { loop: true };
    const imagesForCarousel = [
        {
            image: Caoursel1,
        },
        {
            image: Caoursel2,
        },
        {
            image: Caoursel3,
        },
    ];
    return (
        <div className="section section-team">
            <div className="text-center mt-[2rem]">
                <h1 className="font-bold text-[3rem] md:text-[3.5rem] lg:text-[4rem] inline">Our </h1>
                <h1 className="text-UGA font-bold text-[3rem] md:text-[3.5rem] lg:text-[4rem] inline">People</h1>
            </div>

            <br />

            <div className="our-people-section">
                <EmblaCarousel slides={imagesForCarousel} banner={false} options={OPTIONS} />
                <br />
                <p>DevDogs is proud to consist of 100 UGA students from all tech disciplines and backgrounds. We firmly believe that different perspectives breed the solutions--and we think our work shows! Take a look at some of the awesome people that have made DevDogs, DevDogs below.</p>
            </div>

            <div className="text-center mt-[2rem]">
                <h3 className="font-bold text-[3rem] md:text-[3.5rem] lg:text-[4rem] inline">2024 - 2025</h3>
            </div>
            
            <div className="text-center mt-[2rem]">
                <h3 class="text-UGA font-bold text-[3rem] md:text-[3.5rem] lg:text-[4rem] inline">Executive</h3>
                <h3 className="font-bold text-[3rem] md:text-[3.5rem] lg:text-[4rem] inline">Board </h3>
            </div>

            <div id="teamtitle">
                <div id="grid">
                    <Card name={'Justin Brand'} 
                          title={'President'}  
                          image={jb} 
                          bgcolor="brown-dark" />
                    <Card name={'Nivedha Natarajan'} 
                          title={'Technical Officer'} image={nn} bgcolor="cyan-light" />
                    <Card name={'Kelsey Sterner'} title={'Community Relations Officer'} image={ks} bgcolor="pink-light" />
                    <Card name={'Avery Marco'} title={'Instructional Officer'} image={am} bgcolor="pink" />
                    <Card name={'Kade Styron'} title={'Corporate & Career Officer'} image={kds} bgcolor="pink-dark" />
                    <Card name={'Bryant Monahan'} title={'Campus Initiatives Officer'} image={bm} bgcolor="brown-light" />
                </div>
            </div>
                            {/* All of the coded commented out below is set to add more people, 
                              it just need the pictures of the people to be added. */}
        {/*
            <div className="text-center mt-[2rem]">
                <h3 class="text-UGA font-bold text-[3rem] md:text-[3.5rem] lg:text-[4rem] inline">Notable</h3>
                <h3 className="font-bold text-[3rem] md:text-[3.5rem] lg:text-[4rem] inline">Help</h3>
            </div>

            <div id="teamtitle">
                <div id="grid">
                    <Card name={'Helium Yang'} title={'Mentor'} bgcolor="brown-dark" />
                    <Card name={'Dr. Barnes'} title={'Faculty Advisor'} bgcolor="cyan-light" />
                    <Card name={'Dr.Cotterell'} title={'Faculty Advisor'} bgcolor="pink-light" />
                </div>
            </div>

            <div className="text-center mt-[2rem]">
                <h3 className="font-bold text-[3rem] md:text-[3.5rem] lg:text-[4rem] inline">Focus</h3>
                <h3 className="font-bold text-[3rem] md:text-[3.5rem] lg:text-[4rem] inline">Group</h3>
                <h3 class="text-UGA font-bold text-[3rem] md:text-[3.5rem] lg:text-[4rem] inline">Leads</h3>
            </div>

            <div id="teamtitle">
                <div id="grid">
                    <Card name={'Full Name'} title={'Role'} bgcolor="brown-dark" />
                    <Card name={'Full Name'} title={'Role'} bgcolor="cyan-light" />
                    <Card name={'Full Name'} title={'Role'} bgcolor="pink-light" />
                    <Card name={'Full Name'} title={'Role'} bgcolor="pink" />
                    <Card name={'Full Name'} title={'Role'} bgcolor="pink-dark" />
                </div>
            </div>

            <div className="text-center mt-[2rem]">
                <h3 className="font-bold text-[3rem] md:text-[3.5rem] lg:text-[4rem] inline">Members</h3>
            </div>

            <div id="teamtitle">
                <div id="grid2">
                    <Card name={'Full Name'} title={'Role'} bgcolor="brown-dark" />
                    <Card name={'Full Name'} title={'Role'} bgcolor="cyan-light" />
                    <Card name={'Full Name'} title={'Role'} bgcolor="pink-light" />
                    <Card name={'Full Name'} title={'Role'} bgcolor="pink" />
                    <Card name={'Full Name'} title={'Role'} bgcolor="pink-dark" />
                    <Card name={'Full Name'} title={'Role'} bgcolor="brown-dark" />
                    <Card name={'Full Name'} title={'Role'} bgcolor="cyan-light" />
                    <Card name={'Full Name'} title={'Role'} bgcolor="pink-light" />
                </div>
            </div>
        */}

        </div>
    )
}

export default OurTeam;