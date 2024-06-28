import "./Card.css"
import Image from "next/image";

const Card = (props) => {
    return (
        // id={props.bgcolor}
        //  <img src={props.image} alt="Officer picture" style="width:100%"></img>
        <div  className="officer-card">
            <Image id="pic" src={props.image} width="400" height="450"/>
            
            <div id="officer-description">
                
                <br />
                <h2 class="officer-name">{props.name}</h2>
                <p id="officer-title-name">{props.title}</p>
                <br />
            </div>
        </div>
    )
}

export default Card;