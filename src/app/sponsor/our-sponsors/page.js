import DirectMessageForm from "../../components/DirectMessageForm";
import PageTitleTemplate from "../../components/PageTitleTemplate";
import SocialsAndContact from "../../components/SocialsAndContact";

const Page = () => {
  return (
    <div className="section page-main-side-padding flex h-[100vh] w-full flex-col">
      <PageTitleTemplate
        redText={"Sponsors"}
        blackText={"Our "}
        reverse={true}
      />
      <SocialsAndContact />
      <DirectMessageForm />
    </div>
  );
};

export default Page;
