import KitGroup from "../KitGroup";

/**
 * Gallery section owned by the Command unit. Today it renders the kit's static
 * markup for its group; replace that with the live primitives and every state
 * they support (props-only states included). Edit this file only.
 */
export default function CommandSection() {
  return (
    <>
      <KitGroup title="Data" />
      <KitGroup title="Code" />
    </>
  );
}
