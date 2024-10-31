import DirectMessageForm from "../../components/DirectMessageForm";
import PageTitleTemplate from "../../components/PageTitleTemplate";
import SocialsAndContact from "../../components/SocialsAndContact";

const Page = () => {
  return (
    <div className="section page-main-side-padding flex h-[100vh] w-full flex-col">
      <PageTitleTemplate redText={"Sponsor "} blackText={"Us"} />
      <SocialsAndContact />
      <DirectMessageForm />
    </div>
  );
};

export default Page;
