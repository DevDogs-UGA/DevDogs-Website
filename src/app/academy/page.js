import PageTitleTemplate from "../components/PageTitleTemplate";
import ArticleBrowser from "../components/ArticleBrowser";
import PropTypes from "prop-types";

const devArticles = [
  {
    title: "Article1",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "FooArticle",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "FooArticle2",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "BarArticle",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "FooArticle4",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
];

const devTags = [
  "Frontend Development",
  "Backend Development",
  "Databases",
  "Project Management Tools",
  "Web Development",
  "Mobile Development",
  "UI Design",
];

const careerArticles = [
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
  {
    title: "Article",
    authors: ["Author"],
    tags: ["Tag"],
    path: "/academy/article",
    image: "https://placehold.co/200x200",
  },
];

const careerTags = [
  "Building a Resume",
  "Becoming a Leader",
  "Having an Impact",
];

const RedBlackHeader = ({ red, black }) => (
  <div>
    <h2 className="font-bold inline text-[2rem] md:text-[2.5rem] lg:text-[3rem]">
      {red}
    </h2>
    <h2 className="font-bold inline text-[2rem] md:text-[2.5rem] lg:text-[3rem] text-UGASecondary">
      {black}
    </h2>
  </div>
);

RedBlackHeader.propTypes = {
  red: PropTypes.string,
  black: PropTypes.string,
};

const AcademyPage = () => {
  return (
    <div className="section">
      <PageTitleTemplate
        blackText={"DevDogs "}
        redText={"Academy"}
        reverse={true}
      />
      <div className="page-main-side-padding space-y-8">
        <div className="lg:w-[50%] ">
          <RedBlackHeader red="What's the " black="Academy?" />
          <p className="font-semibold text-[1.1rem] md:text-[1.3rem] lg:text-[1.5rem]">
            DevDogs Academy is a for-students, by-students hub for all things
            learning. We strongly believe in the value of constant
            learning&mdash;it’s what drives the best solutions and refines the
            most refined perspectives. Whether it’s career preparation, frontend
            development, or database management, there’s something for
            you&mdash;take a look below!
          </p>
        </div>
        <div className="flex flex-col text-center items-center">
          <RedBlackHeader red="Software " black="Development" />
          <ArticleBrowser articles={devArticles} tags={devTags} />
        </div>
        <div className="flex flex-col text-center items-center">
          <RedBlackHeader red="Career " black="Development" />
          <ArticleBrowser articles={careerArticles} tags={careerTags} />
        </div>
      </div>
    </div>
  );
};

export default AcademyPage;
