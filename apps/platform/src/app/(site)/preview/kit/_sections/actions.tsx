import {
  ArrowRightIcon,
  CalendarPlusIcon,
  CopyIcon,
  DotsThreeIcon,
  TrashIcon,
} from "@phosphor-icons/react/ssr";

import FormButton from "~/components/FormButton";
import { Button } from "~/ui/button";
import LinkButton from "~/ui/link-button";
import { TextLink } from "~/ui/text-link";
import { KIT_GROUPS } from "../groups";

const FINISHES = [
  { finish: "cosmic", label: "Cosmic · DevDogs" },
  { finish: "paper", label: "Paper · GDG on Campus" },
] as const;

const note = KIT_GROUPS.find((g) => g.title === "Buttons")?.note ?? "";

/** Every state of the live button primitives, in both finishes. */
function Pane({ finish, label }: (typeof FINISHES)[number]) {
  return (
    <div className={`pane ${finish}`} data-label={label}>
      <div className="spec" data-kind="build">
        <Button>
          Join DevDogs <ArrowRightIcon weight="bold" />
        </Button>
        <Button variant="outline">See events</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="destructive">
          <TrashIcon weight="bold" /> Remove
        </Button>
      </div>
      <div className="spec" data-kind="social">
        <Button variant="flat">Flat</Button>
        <Button variant="danger-solid">
          <TrashIcon weight="bold" /> Delete account
        </Button>
        <Button variant="terminal">
          <b>$</b> curl devdogsuga.org/events
        </Button>
      </div>
      <div className="spec" data-kind="workshop">
        <Button kind="workshop" size="lg">
          <CalendarPlusIcon weight="bold" /> Add to calendar
        </Button>
        <Button size="sm">Small</Button>
        <Button size="xs" variant="outline">
          Extra small
        </Button>
        <Button variant="outline" size="sm">
          <CopyIcon weight="bold" /> Copy
        </Button>
        <Button variant="outline" size="icon" aria-label="More">
          <DotsThreeIcon weight="bold" />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="More, small">
          <DotsThreeIcon weight="bold" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="More, ghost">
          <DotsThreeIcon weight="bold" />
        </Button>
        <Button kind="workshop" variant="outline">
          Kind outline
        </Button>
      </div>
      <div className="spec" data-kind="build">
        <Button disabled>Disabled</Button>
        <Button variant="outline" disabled>
          Disabled
        </Button>
        <Button loading>Saving</Button>
        <Button loading variant="outline">
          Saving changes
        </Button>
        <Button className="focus" variant="default">
          Focus ring
        </Button>
        <FormButton theme="black" type="button">
          FormButton
        </FormButton>
        <FormButton theme="rose" type="button">
          FormButton rose
        </FormButton>
      </div>
      <div className="spec" data-kind="build">
        <LinkButton href="/preview/kit" variant="default">
          LinkButton <ArrowRightIcon weight="bold" />
        </LinkButton>
        <LinkButton href="/preview/kit" variant="outline" size="sm">
          LinkButton sm
        </LinkButton>
        <Button asChild variant="outline">
          <a href="/preview/kit" aria-current="page">
            asChild, aria-current
          </a>
        </Button>
        <TextLink href="/preview/kit">
          Text link <ArrowRightIcon weight="bold" />
        </TextLink>
        <TextLink href="/preview/kit" kind="workshop">
          Kind text link
        </TextLink>
        <Button variant="link">Link variant</Button>
      </div>
      <div className="spec" style={{ alignItems: "stretch" }}>
        <div className="card k" data-kind="build" style={{ padding: 18 }}>
          <div className="row" style={{ gap: 12 }}>
            <Button>In a card</Button>
            <Button variant="outline">Secondary</Button>
            <Button variant="danger-solid" size="sm">
              Delete
            </Button>
          </div>
        </div>
        <div
          className="dialog"
          data-kind="build"
          style={{ width: 360, padding: 20 }}
        >
          <h2>Leave the team?</h2>
          <p>You keep your commits.</p>
          <div className="acts" style={{ display: "flex", gap: 12 }}>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
            <Button variant="destructive" size="sm">
              Leave team
            </Button>
          </div>
        </div>
      </div>
      <div className="spec" data-kind="build">
        <Button className="w-full" size="lg">
          Full width on phones
        </Button>
      </div>
    </div>
  );
}

export default function ActionsSection() {
  return (
    <section className="grp" id="buttons">
      <h2>Buttons</h2>
      <p dangerouslySetInnerHTML={{ __html: note }} />
      <div className="pair">
        {FINISHES.map((f) => (
          <Pane key={f.finish} {...f} />
        ))}
      </div>
    </section>
  );
}
