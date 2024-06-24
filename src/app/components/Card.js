import "./Card.css"
import Image from "next/image";

const Card = (props) => {
    return (
        <div id={props.bgcolor} className="officer-card">
            <Image id="pic" src={props.image} width="200" height="300"/>
            <div id="officer-description">
                <h2 class="officer-name">{props.name}</h2>
                <p id="officer-title-name">{props.title}</p>
                <p id="founder">Founder</p>
            </div>
        </div>
    )
}

export default Card;