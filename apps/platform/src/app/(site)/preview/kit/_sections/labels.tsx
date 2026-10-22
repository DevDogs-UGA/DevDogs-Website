import KitGroup from "../KitGroup";

/**
 * Gallery section owned by the Labels unit. Today it renders the kit's static
 * markup for its group; replace that with the live primitives and every state
 * they support (props-only states included). Edit this file only.
 */
export default function LabelsSection() {
  return (
    <>
      <KitGroup title="Chips, badges and tags" />
      <KitGroup title="Event row" />
      <KitGroup title="Decor and identity" />
    </>
  );
}
