"use client";

import Card from "../components/Card";
import Link from "next/link";
import { useState } from "react";
import PropTypes from "prop-types";

const ArticleBrowser = ({ articles }) => {
  const [searchValue, setSearchValue] = useState("");
  const [appliedTags, setAppliedTags] = useState([]);

  const toggleTag = (tag) =>
    appliedTags.includes(tag)
      ? setAppliedTags(appliedTags.toSpliced(appliedTags.indexOf(tag), 1))
      : setAppliedTags([...appliedTags, tag]);

  const tags = [...new Set(articles.flatMap((a) => a.tags))];

  return (
    <div className="flex flex-col lg:flex-row justify-center gap-[1rem] h-[90vh] lg:w-full lg:h-[80vh]">
      <div className="bg-[#f5f5f5] mx-auto text-left rounded-3xl">
        <input
          type="search"
          placeholder="Search..."
          className="bg-white rounded-3xl m-4 -mb-4 p-3"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
        <div className="p-[1em]">
          <h2 className="font-bold text-[1.2em]">Filter by Tags...</h2>
          {tags
            .map((t, i) => (
              <label key={"label-" + i} className="inline-flex items-baseline">
                <input
                  type="checkbox"
                  className="mr-[0.3em] outline-none"
                  onChange={() => toggleTag(t)}
                />
                {t}
              </label>
            ))
            .reduce((acc, tag) => [acc, <br key="br" />, tag])}
        </div>
      </div>
      <div className="h-full w-content grow flex flex-wrap justify-center overflow-auto gap-[1rem] pr-1">
        {articles
          .filter((a) => appliedTags.every((t) => a.tags.includes(t)))
          .filter((a) =>
            Object.values(a)
              .filter((v) => typeof v === "string")
              .some((v) => v.toLowerCase().includes(searchValue.toLowerCase())),
          )
          .map((a, i) => (
            <Link key={i} href={a.path}>
              <Card
                name={a.title}
                title={a.authors.join(", ")}
                image={a.image}
              />
            </Link>
          ))}
      </div>
    </div>
  );
};

export default ArticleBrowser;

ArticleBrowser.propTypes = {
  tags: PropTypes.array,
  articles: PropTypes.array,
};
