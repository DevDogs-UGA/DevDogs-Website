import "./SponsorshipCard.css"

const SponsorshipCard = (props) => {
    return(
        <div>
            <div id={props.id} className="tier-card">
                <div id="img">
                    {/* <Image id="pic" src={props.image} width="400" height="450" /> */}
                </div>
                <div id="tier-description">
                    {props.tiername}
                </div>
            </div>
        </div>
    )
}

export default SponsorshipCard;