import "./Card.css"
import Image from "next/image";

const Card = (props) => {
    return (
        <div id="officer-card">
            <Image id="pic" src={props.image} width="200" height="300"/>
            <div id="officer-description">
                <h2 class="officer-name">{props.name}</h2>
                <h3 class="officer-title">{props.title}</h3>
                <h3 class="officer-title">Founder</h3>
            </div>
        </div>
    )
}

export default Card;